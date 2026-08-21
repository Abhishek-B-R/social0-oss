/**
 * Cache + outbound rate limits for live platform reads (inbox, analytics).
 *
 * Goals at multi-tenant scale:
 * - Prefer Redis/memory cache over live platform calls
 * - Singleflight identical in-flight reads (tabs / users / workers share work)
 * - Per-account AND global (egress-IP) outbound budgets
 * - Soft-fresh: Refresh does not burn quota on warm cache
 * - Cooldown + stale serve on platform 429
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

type CacheEnvelope<T> = { v: T; t: number };

/** TTL seconds per platform + read kind. Longer = fewer platform hits. */
const TTL_SEC: Record<string, Partial<Record<PlatformReadKind, number>>> = {
  twitter_x: {
    // Recent Search quota is tiny - lean on cache; soft-fresh still applies.
    inbox_comments: 900,
    inbox_dms: 180,
    inbox_dm_thread: 120,
    analytics: 300,
  },
  bluesky: {
    // AppView / PDS limits are shared by egress IP across all tenants.
    inbox_comments: 600,
    inbox_dms: 180,
    inbox_dm_thread: 120,
    analytics: 300,
  },
  youtube: {
    inbox_comments: 600,
    inbox_dms: 120,
    inbox_dm_thread: 90,
    analytics: 300,
  },
  threads: {
    inbox_comments: 300,
    inbox_dms: 120,
    inbox_dm_thread: 90,
    analytics: 180,
  },
  facebook: {
    inbox_comments: 300,
    inbox_dms: 120,
    inbox_dm_thread: 90,
    analytics: 180,
  },
  linkedin: {
    inbox_comments: 300,
    analytics: 180,
  },
  instagram: {
    inbox_comments: 300,
    inbox_dms: 120,
    inbox_dm_thread: 90,
    analytics: 180,
  },
  default: {
    inbox_comments: 300,
    inbox_dms: 120,
    inbox_dm_thread: 90,
    analytics: 180,
  },
};

/**
 * Max outbound platform calls per account per minute (cache misses only).
 * Kept intentionally below a full cold page so one power-user cannot exhaust
 * shared platform app / IP quotas alone.
 */
const OUTBOUND_PER_MIN: Record<string, Partial<Record<PlatformReadKind, number>>> = {
  twitter_x: {
    inbox_comments: 2,
    inbox_dms: 2,
    inbox_dm_thread: 2,
    analytics: 4,
  },
  bluesky: {
    inbox_comments: 6,
    inbox_dms: 3,
    inbox_dm_thread: 4,
    analytics: 6,
  },
  youtube: {
    inbox_comments: 8,
    inbox_dms: 4,
    inbox_dm_thread: 4,
    analytics: 10,
  },
  default: {
    inbox_comments: 12,
    inbox_dms: 6,
    inbox_dm_thread: 8,
    analytics: 12,
  },
};

/**
 * Global (all accounts / all tenants on this Redis) outbound caps per minute.
 * Platforms that rate-limit by app id or egress IP need this layer.
 */
const GLOBAL_OUTBOUND_PER_MIN: Record<string, Partial<Record<PlatformReadKind, number>>> = {
  bluesky: {
    inbox_comments: 20,
    inbox_dms: 10,
    inbox_dm_thread: 15,
    analytics: 20,
  },
  youtube: {
    inbox_comments: 40,
    analytics: 40,
  },
  twitter_x: {
    inbox_comments: 15,
    inbox_dms: 10,
    inbox_dm_thread: 10,
    analytics: 20,
  },
  threads: {
    inbox_comments: 30,
    analytics: 30,
  },
  default: {
    inbox_comments: 60,
    inbox_dms: 30,
    inbox_dm_thread: 40,
    analytics: 60,
  },
};

/** Manual Refresh still serves cache younger than this (ms). */
export const SOFT_FRESH_MIN_AGE_MS = 90_000;

const COOLDOWN_PREFIX = "platform:cooldown:";
const CACHE_PREFIX = "platform:read:";

/** Cap in-process cache so many account/suffix keys cannot grow forever. */
export const MEM_CACHE_MAX_ENTRIES = 500;
export const MEM_COOLDOWN_MAX_ENTRIES = 200;

const memCache = new Map<string, { exp: number; raw: string }>();
const memCooldown = new Map<string, number>();

/** In-process singleflight for identical cache keys. */
const inflight = new Map<string, Promise<PlatformReadResult<unknown>>>();

const outboundLimiters = new Map<string, Ratelimit>();
const globalOutboundLimiters = new Map<string, Ratelimit>();

/** Drop expired entries, then FIFO-evict until at/under maxSize. */
export function pruneBoundedMap<V extends { exp?: number } | number>(
  map: Map<string, V>,
  maxSize: number,
  now = Date.now(),
): void {
  for (const [k, v] of map) {
    const exp = typeof v === "number" ? v : v?.exp;
    if (typeof exp === "number" && exp < now) map.delete(k);
  }
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

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

function globalOutboundLimit(platform: string, kind: PlatformReadKind): number {
  return (
    GLOBAL_OUTBOUND_PER_MIN[platform]?.[kind] ??
    GLOBAL_OUTBOUND_PER_MIN.default[kind] ??
    60
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

function getGlobalOutboundLimiter(platform: string, kind: PlatformReadKind): Ratelimit | null {
  if (!redis) return null;
  const id = `g:${platform}:${kind}`;
  let limiter = globalOutboundLimiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(globalOutboundLimit(platform, kind), "1 m"),
      prefix: `rl:out:global:${platform}:${kind}`,
    });
    globalOutboundLimiters.set(id, limiter);
  }
  return limiter;
}

function parseEnvelope<T>(raw: unknown): { data: T; cachedAt: number } | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return parseEnvelope<T>(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && raw !== null && "v" in raw && "t" in raw) {
    const env = raw as CacheEnvelope<T>;
    return {
      data: env.v,
      cachedAt: typeof env.t === "number" ? env.t : 0,
    };
  }
  // Legacy bare payload (pre-envelope) — treat as aged so soft-fresh may refresh once.
  return { data: raw as T, cachedAt: 0 };
}

async function readCache<T>(
  key: string,
): Promise<{ data: T; cachedAt: number } | null> {
  const mem = memCache.get(key);
  if (mem && Date.now() <= mem.exp) {
    const parsed = parseEnvelope<T>(mem.raw);
    if (parsed) return parsed;
    memCache.delete(key);
  }
  if (!redis) return null;
  return withRedisTimeout(
    `platform-cache get ${key}`,
    async () => {
      const raw = await redis!.get<string | CacheEnvelope<T>>(key);
      return parseEnvelope<T>(raw);
    },
    null,
  );
}

async function writeCache(key: string, value: unknown, ttl: number): Promise<void> {
  const envelope: CacheEnvelope<unknown> = { v: value, t: Date.now() };
  const raw = JSON.stringify(envelope);
  memCache.set(key, { exp: Date.now() + ttl * 1000, raw });
  pruneBoundedMap(memCache, MEM_CACHE_MAX_ENTRIES);
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
  pruneBoundedMap(memCooldown, MEM_COOLDOWN_MAX_ENTRIES);
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

/** Do not cache scope/permission failures - reconnect would stay "broken" until TTL. */
export function shouldCachePlatformRead(data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const o = data as {
    status?: string;
    missingScopes?: unknown;
    threads?: Array<{ peerName?: string; peerHandle?: string | null }>;
  };
  if (o.status === "scope_missing" || o.status === "error") return false;
  if (Array.isArray(o.missingScopes) && o.missingScopes.length > 0) return false;
  // Don't cache DM lists that failed to resolve any peer identity — otherwise
  // "X user" placeholders stick until TTL and Refresh can't recover them.
  if (Array.isArray(o.threads) && o.threads.length > 0) {
    const allWeak = o.threads.every((t) => {
      if (t.peerHandle?.trim()) return false;
      const name = (t.peerName ?? "").trim();
      return (
        !name ||
        name === "X user" ||
        name === "Unknown" ||
        name === "Bluesky user" ||
        name === "Conversation" ||
        name === "TikTok user"
      );
    });
    if (allWeak) return false;
  }
  return true;
}

/**
 * Whether a manual Refresh (`fresh`) should skip this cached entry.
 * Warm entries stay served so Refresh cannot hammer platforms.
 */
export function shouldBypassCacheForFresh(
  cachedAt: number,
  now = Date.now(),
  minAgeMs = SOFT_FRESH_MIN_AGE_MS,
): boolean {
  if (!cachedAt) return true;
  return now - cachedAt >= minAgeMs;
}

async function serveStaleOrCooldown<T>(
  key: string,
  platform: string,
  retryAt: number,
): Promise<PlatformReadResult<T>> {
  const stale = await readCache<T>(key);
  if (stale) {
    return { data: stale.data, fromCache: true, rateLimited: true };
  }
  throw new PlatformApiCooldownError(platform, retryAt);
}

async function runPlatformRead<T>(opts: {
  platform: string;
  accountId: string;
  kind: PlatformReadKind;
  suffix: string;
  fresh?: boolean;
  fetch: () => Promise<T>;
  key: string;
  ttl: number;
}): Promise<PlatformReadResult<T>> {
  const cooledUntil = await cooldownUntil(opts.platform, opts.accountId);
  if (cooledUntil > Date.now()) {
    return serveStaleOrCooldown<T>(opts.key, opts.platform, cooledUntil);
  }

  const cached = await readCache<T>(opts.key);
  if (cached && shouldCachePlatformRead(cached.data)) {
    if (!opts.fresh || !shouldBypassCacheForFresh(cached.cachedAt)) {
      return { data: cached.data, fromCache: true };
    }
  }

  const accountLimiter = getOutboundLimiter(opts.platform, opts.kind);
  const accountAllowed = await enforceRateLimit(
    accountLimiter,
    opts.accountId,
    { failClosedWhenUnavailable: false },
  );
  if (!accountAllowed.allowed) {
    return serveStaleOrCooldown<T>(opts.key, opts.platform, Date.now() + 60_000);
  }

  const globalLimiter = getGlobalOutboundLimiter(opts.platform, opts.kind);
  const globalAllowed = await enforceRateLimit(
    globalLimiter,
    "global",
    { failClosedWhenUnavailable: false },
  );
  if (!globalAllowed.allowed) {
    return serveStaleOrCooldown<T>(opts.key, opts.platform, Date.now() + 60_000);
  }

  try {
    const data = await opts.fetch();
    if (shouldCachePlatformRead(data)) {
      await writeCache(opts.key, data, opts.ttl);
    }
    return { data, fromCache: false };
  } catch (e) {
    if (isPlatformRateLimitError(e)) {
      const wait = retryAfterSeconds(e);
      await setCooldown(opts.platform, opts.accountId, wait);
      return serveStaleOrCooldown<T>(
        opts.key,
        opts.platform,
        Date.now() + wait * 1000,
      );
    }
    throw e;
  }
}

/**
 * Serve cached platform data when possible; enforce outbound limits; back off on 429.
 * `fresh` only bypasses cache when the entry is older than SOFT_FRESH_MIN_AGE_MS.
 * Concurrent callers for the same key share one outbound fetch (singleflight).
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

  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<PlatformReadResult<T>>;
  }

  const promise = runPlatformRead<T>({ ...opts, key, ttl }).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise as Promise<PlatformReadResult<unknown>>);
  return promise;
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

/** Lower concurrency for expensive / IP-limited platforms. */
export function platformFetchConcurrency(platform: string, defaultConcurrency: number): number {
  if (platform === "twitter_x") return 1;
  if (platform === "bluesky") return 1;
  if (platform === "youtube") return 1;
  if (platform === "instagram") return 2;
  return Math.min(defaultConcurrency, 2);
}

/**
 * Cap publications fetched per inbox comments page.
 * "All accounts" mode uses a tighter default via `allAccounts`.
 */
export function platformInboxSampleLimit(
  platform: string | undefined,
  defaultLimit: number,
  opts?: { allAccounts?: boolean },
): number {
  const all = Boolean(opts?.allAccounts);
  if (platform === "twitter_x") {
    // Batched: one search covers many posts; full page is fine.
    return Math.min(defaultLimit, all ? 16 : 24);
  }
  if (platform === "bluesky") return Math.min(defaultLimit, all ? 4 : 8);
  if (platform === "youtube") return Math.min(defaultLimit, all ? 4 : 8);
  if (platform === "threads" || platform === "facebook") {
    return Math.min(defaultLimit, all ? 6 : 10);
  }
  if (all) return Math.min(defaultLimit, 8);
  return Math.min(defaultLimit, 12);
}

/** Stop walking empty pub windows sooner on scarce APIs. */
export function platformCommentPageRounds(platform: string | undefined, defaultRounds: number): number {
  if (platform === "twitter_x") return 1;
  if (platform === "bluesky" || platform === "youtube") return 1;
  return Math.min(defaultRounds, 2);
}
