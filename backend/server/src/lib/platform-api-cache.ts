/**
 * Cache + outbound rate limits for live platform reads (inbox, analytics).
 * Prevents hammering platform APIs when the UI polls or users refresh often.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis.js";
import { withRedisTimeout } from "./redis-safe.js";
import { enforceRateLimit } from "./ratelimit.js";
import { extractHttpStatus } from "./twitter-errors.js";

export type PlatformReadKind =
  | "inbox_comments"
  | "inbox_dms"
  | "inbox_dm_thread"
  | "analytics";

/** TTL seconds per platform + read kind. */
const TTL_SEC: Record<string, Partial<Record<PlatformReadKind, number>>> = {
  twitter_x: {
    inbox_comments: 180,
    inbox_dms: 120,
    inbox_dm_thread: 90,
    analytics: 300,
  },
  instagram: {
    inbox_comments: 90,
    inbox_dms: 90,
    inbox_dm_thread: 60,
    analytics: 180,
  },
  default: {
    inbox_comments: 60,
    inbox_dms: 60,
    inbox_dm_thread: 45,
    analytics: 120,
  },
};

/** Max outbound platform calls per account per minute (before cache miss). */
const OUTBOUND_PER_MIN: Record<string, Partial<Record<PlatformReadKind, number>>> = {
  twitter_x: {
    inbox_comments: 3,
    inbox_dms: 2,
    inbox_dm_thread: 2,
    analytics: 5,
  },
  default: {
    inbox_comments: 15,
    inbox_dms: 10,
    inbox_dm_thread: 10,
    analytics: 20,
  },
};

const COOLDOWN_PREFIX = "platform:cooldown:";
const CACHE_PREFIX = "platform:read:";

const memCache = new Map<string, { exp: number; raw: string }>();
const memCooldown = new Map<string, number>();

const outboundLimiters = new Map<string, Ratelimit>();

function ttlSec(platform: string, kind: PlatformReadKind): number {
  return (
    TTL_SEC[platform]?.[kind] ??
    TTL_SEC.default[kind] ??
    60
  );
}

function outboundLimit(platform: string, kind: PlatformReadKind): number {
  return (
    OUTBOUND_PER_MIN[platform]?.[kind] ??
    OUTBOUND_PER_MIN.default[kind] ??
    15
  );
}

function cacheKey(kind: PlatformReadKind, platform: string, accountId: string, suffix: string): string {
  return `${CACHE_PREFIX}${kind}:${platform}:${accountId}:${suffix}`;
}

function cooldownKey(platform: string, accountId: string): string {
  return `${COOLDOWN_PREFIX}${platform}:${accountId}`;
}

function getOutboundLimiter(platform: string, kind: PlatformReadKind): Ratelimit | null {
  if (!redis) return null;
  const id = `${platform}:${kind}`;
  let limiter = outboundLimiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(outboundLimit(platform, kind), "1 m"),
      prefix: `rl:out:${platform}:${kind}`,
    });
    outboundLimiters.set(id, limiter);
  }
  return limiter;
}

async function readCache<T>(key: string): Promise<T | null> {
  const mem = memCache.get(key);
  if (mem && Date.now() <= mem.exp) {
    try {
      return JSON.parse(mem.raw) as T;
    } catch {
      memCache.delete(key);
    }
  }
  if (!redis) return null;
  return withRedisTimeout(
    `platform-cache get ${key}`,
    async () => {
      const raw = await redis!.get<string>(key);
      if (raw == null) return null;
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return null;
        }
      }
      return raw as T;
    },
    null,
  );
}

async function writeCache(key: string, value: unknown, ttl: number): Promise<void> {
  const raw = JSON.stringify(value);
  memCache.set(key, { exp: Date.now() + ttl * 1000, raw });
  if (!redis) return;
  await withRedisTimeout(
    `platform-cache set ${key}`,
    async () => {
      await redis!.set(key, raw, { ex: ttl });
    },
    undefined,
  );
}

async function cooldownUntil(platform: string, accountId: string): Promise<number> {
  const key = cooldownKey(platform, accountId);
  const mem = memCooldown.get(key);
  if (mem && mem > Date.now()) return mem;
  if (!redis) return 0;
  const raw = await withRedisTimeout(
    `platform-cooldown get ${key}`,
    async () => redis!.get<number | string>(key),
    null,
  );
  if (raw == null) return 0;
  const until = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(until) ? until : 0;
}

async function setCooldown(platform: string, accountId: string, seconds: number): Promise<void> {
  const until = Date.now() + seconds * 1000;
  const key = cooldownKey(platform, accountId);
  memCooldown.set(key, until);
  if (!redis) return;
  await withRedisTimeout(
    `platform-cooldown set ${key}`,
    async () => {
      await redis!.set(key, until, { ex: Math.max(seconds, 60) });
    },
    undefined,
  );
}

export function isPlatformRateLimitError(e: unknown): boolean {
  const status = extractHttpStatus(e);
  if (status === 429) return true;
  if (e instanceof Error && /rate limit|too many requests|\b429\b/i.test(e.message)) {
    return true;
  }
  return false;
}

function retryAfterSeconds(e: unknown): number {
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const resp = o.response as { headers?: Record<string, string> } | undefined;
    const reset = resp?.headers?.["x-rate-limit-reset"];
    if (reset) {
      const resetSec = Number(reset);
      if (Number.isFinite(resetSec)) {
        const wait = resetSec - Math.floor(Date.now() / 1000);
        if (wait > 0) return Math.min(wait, 900);
      }
    }
  }
  return 300;
}

export type PlatformReadResult<T> = {
  data: T;
  fromCache: boolean;
  rateLimited?: boolean;
};

/**
 * Serve cached platform data when possible; enforce outbound limits; back off on 429.
 * `fresh` skips cache read but still respects cooldown and outbound limits.
 */
export async function withPlatformReadCache<T>(opts: {
  platform: string;
  accountId: string;
  kind: PlatformReadKind;
  suffix: string;
  fresh?: boolean;
  fetch: () => Promise<T>;
}): Promise<PlatformReadResult<T>> {
  const key = cacheKey(opts.kind, opts.platform, opts.accountId, opts.suffix);
  const ttl = ttlSec(opts.platform, opts.kind);

  const cooledUntil = await cooldownUntil(opts.platform, opts.accountId);
  if (cooledUntil > Date.now()) {
    const stale = await readCache<T>(key);
    if (stale) {
      return { data: stale, fromCache: true, rateLimited: true };
    }
    throw new PlatformApiCooldownError(opts.platform, cooledUntil);
  }

  if (!opts.fresh) {
    const cached = await readCache<T>(key);
    if (cached) return { data: cached, fromCache: true };
  }

  const limiter = getOutboundLimiter(opts.platform, opts.kind);
  const allowed = await enforceRateLimit(
    limiter,
    opts.accountId,
    { failClosedWhenUnavailable: false },
  );
  if (!allowed.allowed) {
    const stale = await readCache<T>(key);
    if (stale) {
      return { data: stale, fromCache: true, rateLimited: true };
    }
    throw new PlatformApiCooldownError(opts.platform, Date.now() + 60_000);
  }

  try {
    const data = await opts.fetch();
    await writeCache(key, data, ttl);
    return { data, fromCache: false };
  } catch (e) {
    if (isPlatformRateLimitError(e)) {
      const wait = retryAfterSeconds(e);
      await setCooldown(opts.platform, opts.accountId, wait);
      const stale = await readCache<T>(key);
      if (stale) {
        return { data: stale, fromCache: true, rateLimited: true };
      }
    }
    throw e;
  }
}

export class PlatformApiCooldownError extends Error {
  readonly platform: string;
  readonly retryAt: number;

  constructor(platform: string, retryAt: number) {
    super(`Platform ${platform} is rate limited. Try again later.`);
    this.name = "PlatformApiCooldownError";
    this.platform = platform;
    this.retryAt = retryAt;
  }
}

/** Lower concurrency for expensive platforms (X search, etc.). */
export function platformFetchConcurrency(platform: string, defaultConcurrency: number): number {
  if (platform === "twitter_x") return 1;
  if (platform === "instagram") return 2;
  return defaultConcurrency;
}

/** Cap publications fetched per inbox comments page for expensive platforms. */
export function platformInboxSampleLimit(platform: string | undefined, defaultLimit: number): number {
  if (platform === "twitter_x") return Math.min(defaultLimit, 12);
  return defaultLimit;
}

/** Stop walking empty pub windows sooner on X (each round = many searches). */
export function platformCommentPageRounds(platform: string | undefined, defaultRounds: number): number {
  if (platform === "twitter_x") return 1;
  return defaultRounds;
}
