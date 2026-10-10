/**
 * Cache + outbound rate limits for live platform reads (inbox, analytics).
 *
 * Goals at multi-tenant scale:
 * - Prefer Redis/memory cache over live platform calls
 * - Singleflight identical in-flight outbound reads (tabs / users share work)
 * - Per-account AND global (egress-IP) outbound budgets
 * - Soft-fresh: Refresh does not burn quota on warm cache
 * - Cooldown + stale serve on platform 429
 */

import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { redis } from "./redis.js";
import { withRedisTimeout } from "./redis-safe.js";
import { enforceRateLimit } from "./ratelimit.js";
import { extractHttpStatus } from "./twitter-errors.js";
import {
  clampRetryAfter,
  PlatformRateLimitError,
  retryAfterFromHeaders,
} from "./platform-rate-limit.js";

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

/** A limiter budget: `tokens` cache-miss reads per sliding `window`. */
type ReadBudget = { tokens: number; window: Duration };

/**
 * Per-account outbound budget (cache misses only; one read is one token).
 *
 * X meters user-context endpoints in 15-minute windows, so its budgets use the
 * same window: a user can open a dozen conversations in a burst and still stay
 * under X's own per-user cap. A per-minute budget of 2 (the old value) turned
 * the third click inside a minute into a "rate limited" error even though X
 * itself had plenty of headroom.
 *
 * Reads are deliberately cheap (DM threads fetch one page, analytics batch
 * every post of an account into one lookup), so a token is ~1 platform call.
 */
const ACCOUNT_BUDGET: Record<string, Partial<Record<PlatformReadKind, ReadBudget>>> = {
  twitter_x: {
    // Recent Search: one call covers ~13 posts.
    inbox_comments: { tokens: 6, window: "15 m" },
    // dm_events: up to 2 pages + one batched users lookup per read.
    inbox_dms: { tokens: 6, window: "15 m" },
    // dm_conversations/:id/dm_events: one page per read.
    inbox_dm_thread: { tokens: 12, window: "15 m" },
    // Batched tweets lookup: one call per account page.
    analytics: { tokens: 20, window: "15 m" },
  },
  bluesky: {
    inbox_comments: { tokens: 30, window: "1 m" },
    inbox_dms: { tokens: 10, window: "1 m" },
    inbox_dm_thread: { tokens: 20, window: "1 m" },
    analytics: { tokens: 20, window: "1 m" },
  },
  youtube: {
    // Data API is metered in daily quota units; keep bursts modest.
    inbox_comments: { tokens: 10, window: "1 m" },
    analytics: { tokens: 20, window: "1 m" },
  },
  default: {
    inbox_comments: { tokens: 20, window: "1 m" },
    inbox_dms: { tokens: 10, window: "1 m" },
    inbox_dm_thread: { tokens: 15, window: "1 m" },
    analytics: { tokens: 20, window: "1 m" },
  },
};

/**
 * Global (all accounts / all tenants on this Redis) outbound safety valve.
 * Only platforms that throttle by app id or egress IP need it; values sit far
 * above what one tenant can spend so a single busy user never trips it.
 */
const GLOBAL_BUDGET: Record<string, Partial<Record<PlatformReadKind, ReadBudget>>> = {
  bluesky: {
    inbox_comments: { tokens: 300, window: "1 m" },
    inbox_dms: { tokens: 150, window: "1 m" },
    inbox_dm_thread: { tokens: 300, window: "1 m" },
    analytics: { tokens: 300, window: "1 m" },
  },
  youtube: {
    inbox_comments: { tokens: 120, window: "1 m" },
    analytics: { tokens: 120, window: "1 m" },
  },
  default: {
    inbox_comments: { tokens: 600, window: "1 m" },
    inbox_dms: { tokens: 300, window: "1 m" },
    inbox_dm_thread: { tokens: 600, window: "1 m" },
    analytics: { tokens: 600, window: "1 m" },
  },
};

const FALLBACK_ACCOUNT_BUDGET: ReadBudget = { tokens: 15, window: "1 m" };
const FALLBACK_GLOBAL_BUDGET: ReadBudget = { tokens: 300, window: "1 m" };

/** Manual Refresh still serves cache younger than this (ms). */
export const SOFT_FRESH_MIN_AGE_MS = 90_000;

const COOLDOWN_PREFIX = "platform:cooldown:";
const CACHE_PREFIX = "platform:read:";

/** Cap in-process cache so many account/suffix keys cannot grow forever. */
export const MEM_CACHE_MAX_ENTRIES = 500;
export const MEM_COOLDOWN_MAX_ENTRIES = 200;

const memCache = new Map<string, { exp: number; raw: string }>();
const memCooldown = new Map<string, number>();

/** In-process singleflight for identical outbound cache keys. */
const inflight = new Map<string, Promise<PlatformReadResult<unknown>>>();

const outboundLimiters = new Map<string, Ratelimit>();
const globalOutboundLimiters = new Map<string, Ratelimit>();

const WEAK_PEER_NAMES = new Set([
  "X user",
  "Unknown",
  "Bluesky user",
  "Conversation",
  "TikTok user",
]);

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

export function accountReadBudget(
  platform: string,
  kind: PlatformReadKind,
): ReadBudget {
  return (
    ACCOUNT_BUDGET[platform]?.[kind] ??
    ACCOUNT_BUDGET.default[kind] ??
    FALLBACK_ACCOUNT_BUDGET
  );
}

export function globalReadBudget(
  platform: string,
  kind: PlatformReadKind,
): ReadBudget {
  return (
    GLOBAL_BUDGET[platform]?.[kind] ??
    GLOBAL_BUDGET.default[kind] ??
    FALLBACK_GLOBAL_BUDGET
  );
}

function cacheKey(kind: PlatformReadKind, platform: string, accountId: string, suffix: string): string {
  return `${CACHE_PREFIX}${kind}:${platform}:${accountId}:${suffix}`;
}

/**
 * Cooldowns are per read kind: platforms meter endpoints separately, so a 429
 * on DM threads must not also blank out analytics and comments for the same
 * account.
 */
function cooldownKey(
  platform: string,
  accountId: string,
  kind: PlatformReadKind,
): string {
  return `${COOLDOWN_PREFIX}${platform}:${accountId}:${kind}`;
}

function getOutboundLimiter(platform: string, kind: PlatformReadKind): Ratelimit | null {
  if (!redis) return null;
  const id = `${platform}:${kind}`;
  let limiter = outboundLimiters.get(id);
  if (!limiter) {
    const budget = accountReadBudget(platform, kind);
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(budget.tokens, budget.window),
      // Prefix carries the window so a budget change never shares counters
      // with the old shape.
      prefix: `rl:out:v2:${platform}:${kind}`,
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
    const budget = globalReadBudget(platform, kind);
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(budget.tokens, budget.window),
      prefix: `rl:out:global:v2:${platform}:${kind}`,
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

async function cooldownUntil(
  platform: string,
  accountId: string,
  kind: PlatformReadKind,
): Promise<number> {
  const key = cooldownKey(platform, accountId, kind);
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
  if (!Number.isFinite(until)) return 0;
  if (until > Date.now()) {
    memCooldown.set(key, until);
    pruneBoundedMap(memCooldown, MEM_COOLDOWN_MAX_ENTRIES);
  }
  return until;
}

async function setCooldown(
  platform: string,
  accountId: string,
  kind: PlatformReadKind,
  seconds: number,
): Promise<number> {
  const until = Date.now() + seconds * 1000;
  const key = cooldownKey(platform, accountId, kind);
  memCooldown.set(key, until);
  pruneBoundedMap(memCooldown, MEM_COOLDOWN_MAX_ENTRIES);
  if (redis) {
    await withRedisTimeout(
      `platform-cooldown set ${key}`,
      async () => {
        await redis!.set(key, until, { ex: Math.max(Math.ceil(seconds), 1) });
      },
      undefined,
    );
  }
  return until;
}

export function isPlatformRateLimitError(e: unknown): boolean {
  if (e instanceof PlatformRateLimitError) return true;
  const status = extractHttpStatus(e);
  if (status === 429) return true;
  if (e instanceof Error && /rate limit|too many requests|\b429\b/i.test(e.message)) {
    return true;
  }
  return false;
}

/**
 * How long to back off after a platform 429. Prefers the platform's own reset
 * hint (twitter-api-v2 `rateLimit.reset`, response headers) and falls back to
 * a short default - a long blind cooldown blanks the inbox for no reason.
 */
export function retryAfterSeconds(e: unknown, nowMs = Date.now()): number {
  if (e instanceof PlatformRateLimitError) return e.retryAfterSec;
  if (e && typeof e === "object") {
    const o = e as {
      rateLimit?: { reset?: unknown };
      headers?: Record<string, string | string[] | undefined>;
      response?: { headers?: Record<string, string | string[] | undefined> };
    };
    const reset = Number(o.rateLimit?.reset);
    if (Number.isFinite(reset) && reset > 0) {
      const wait = reset - nowMs / 1000;
      if (wait > 0) return clampRetryAfter(wait);
    }
    const fromHeaders =
      retryAfterFromHeaders(o.headers, nowMs) ??
      retryAfterFromHeaders(o.response?.headers, nowMs);
    if (fromHeaders != null) return clampRetryAfter(fromHeaders);
  }
  return clampRetryAfter(null);
}

export type PlatformReadResult<T> = {
  data: T;
  fromCache: boolean;
  rateLimited?: boolean;
};

function isWeakPeerIdentity(peer: {
  peerName?: string;
  peerHandle?: string | null;
}): boolean {
  if (peer.peerHandle?.trim()) return false;
  const name = (peer.peerName ?? "").trim();
  return !name || WEAK_PEER_NAMES.has(name);
}

function isCommentFetchResult(value: unknown): value is {
  status?: string;
  missingScopes?: unknown;
} {
  return Boolean(value && typeof value === "object" && "status" in value);
}

/** Do not cache scope/permission failures - reconnect would stay "broken" until TTL. */
export function shouldCachePlatformRead(data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const o = data as {
    status?: string;
    missingScopes?: unknown;
    threads?: Array<{ peerName?: string; peerHandle?: string | null }>;
    thread?: { peerName?: string; peerHandle?: string | null };
  };
  if (o.status === "scope_missing" || o.status === "error") return false;
  if (Array.isArray(o.missingScopes) && o.missingScopes.length > 0) return false;

  // X comment batches are Record<publicationId, CommentFetchResult> with no
  // top-level status — refuse cache if any entry failed.
  const values = Object.values(o as Record<string, unknown>);
  if (
    values.length > 0 &&
    values.every(isCommentFetchResult) &&
    !("threads" in o) &&
    !("thread" in o) &&
    !("comments" in o)
  ) {
    if (
      values.some((v) => {
        const row = v as { status?: string; missingScopes?: unknown };
        if (row.status === "error" || row.status === "scope_missing") return true;
        return Array.isArray(row.missingScopes) && row.missingScopes.length > 0;
      })
    ) {
      return false;
    }
  }

  // Don't cache DM lists / threads that failed to resolve peer identity.
  if (Array.isArray(o.threads) && o.threads.length > 0) {
    if (o.threads.every(isWeakPeerIdentity)) return false;
  }
  if (o.thread && isWeakPeerIdentity(o.thread)) return false;

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
  reason: PlatformCooldownReason,
): Promise<PlatformReadResult<T>> {
  const stale = await readCache<T>(key);
  if (stale && shouldCachePlatformRead(stale.data)) {
    return { data: stale.data, fromCache: true, rateLimited: true };
  }
  throw new PlatformApiCooldownError(platform, retryAt, reason);
}

type OutboundPermit = { allowed: true } | { allowed: false; retryAt: number };

/** Spend one token from the account and global budgets for a cache miss. */
async function acquireOutboundPermit(
  platform: string,
  accountId: string,
  kind: PlatformReadKind,
): Promise<OutboundPermit> {
  const limiters: Array<[Ratelimit | null, string]> = [
    [getOutboundLimiter(platform, kind), accountId],
    [getGlobalOutboundLimiter(platform, kind), "global"],
  ];
  for (const [limiter, id] of limiters) {
    const res = await enforceRateLimit(limiter, id);
    if (!res.allowed) {
      const retryAt =
        typeof res.reset === "number" && res.reset > Date.now()
          ? res.reset
          : Date.now() + 60_000;
      return { allowed: false, retryAt };
    }
  }
  return { allowed: true };
}

/** Record a platform 429 as a cooldown on this read kind; returns retryAt. */
async function noteRateLimited(
  platform: string,
  accountId: string,
  kind: PlatformReadKind,
  e: unknown,
): Promise<number> {
  return setCooldown(platform, accountId, kind, retryAfterSeconds(e));
}

async function outboundPlatformRead<T>(opts: {
  platform: string;
  accountId: string;
  kind: PlatformReadKind;
  fetch: () => Promise<T>;
  key: string;
  ttl: number;
}): Promise<PlatformReadResult<T>> {
  const permit = await acquireOutboundPermit(
    opts.platform,
    opts.accountId,
    opts.kind,
  );
  if (!permit.allowed) {
    return serveStaleOrCooldown<T>(
      opts.key,
      opts.platform,
      permit.retryAt,
      "local_budget",
    );
  }

  try {
    const data = await opts.fetch();
    if (shouldCachePlatformRead(data)) {
      await writeCache(opts.key, data, opts.ttl);
    }
    return { data, fromCache: false };
  } catch (e) {
    if (isPlatformRateLimitError(e)) {
      const retryAt = await noteRateLimited(
        opts.platform,
        opts.accountId,
        opts.kind,
        e,
      );
      return serveStaleOrCooldown<T>(
        opts.key,
        opts.platform,
        retryAt,
        "platform_429",
      );
    }
    throw e;
  }
}

/**
 * Serve cached platform data when possible; enforce outbound limits; back off on 429.
 * `fresh` only bypasses cache when the entry is older than SOFT_FRESH_MIN_AGE_MS.
 * Cache/soft-fresh decisions run before singleflight so Refresh cannot join a
 * non-fresh inflight and miss its bypass. Only outbound fetches are coalesced.
 */
export async function withPlatformReadCache<T>(opts: {
  platform: string;
  accountId: string;
  kind: PlatformReadKind;
  suffix: string;
  fresh?: boolean;
  /**
   * Soft-fresh floor for this read. Defaults to SOFT_FRESH_MIN_AGE_MS so a
   * Refresh click cannot hammer platforms. Mutation *verification* passes 0:
   * it has already missed once, and rejecting a real comment because the
   * cached thread is 20s old is worse than one extra platform call.
   */
  softFreshMinAgeMs?: number;
  fetch: () => Promise<T>;
}): Promise<PlatformReadResult<T>> {
  const key = cacheKey(opts.kind, opts.platform, opts.accountId, opts.suffix);
  const ttl = ttlSec(opts.platform, opts.kind);

  const cooledUntil = await cooldownUntil(opts.platform, opts.accountId, opts.kind);
  if (cooledUntil > Date.now()) {
    return serveStaleOrCooldown<T>(key, opts.platform, cooledUntil, "platform_429");
  }

  const cached = await readCache<T>(key);
  if (cached && shouldCachePlatformRead(cached.data)) {
    const minAge = opts.softFreshMinAgeMs ?? SOFT_FRESH_MIN_AGE_MS;
    if (
      !opts.fresh ||
      !shouldBypassCacheForFresh(cached.cachedAt, Date.now(), minAge)
    ) {
      return { data: cached.data, fromCache: true };
    }
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<PlatformReadResult<T>>;
  }

  const promise = outboundPlatformRead<T>({
    platform: opts.platform,
    accountId: opts.accountId,
    kind: opts.kind,
    fetch: opts.fetch,
    key,
    ttl,
  }).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise as Promise<PlatformReadResult<unknown>>);
  return promise;
}

/** Cache-only lookup: never calls the platform and never spends budget. */
export async function peekPlatformReadCache<T>(opts: {
  platform: string;
  accountId: string;
  kind: PlatformReadKind;
  suffix: string;
}): Promise<T | null> {
  const key = cacheKey(opts.kind, opts.platform, opts.accountId, opts.suffix);
  const cached = await readCache<T>(key);
  if (!cached || !shouldCachePlatformRead(cached.data)) return null;
  return cached.data;
}

/**
 * Drop one cached read (memory + Redis), e.g. a DM thread right after we sent
 * into it, so the next read reflects the platform instead of a pre-send copy.
 */
export async function invalidatePlatformRead(opts: {
  platform: string;
  accountId: string;
  kind: PlatformReadKind;
  suffix: string;
}): Promise<void> {
  const key = cacheKey(opts.kind, opts.platform, opts.accountId, opts.suffix);
  memCache.delete(key);
  if (!redis) return;
  await withRedisTimeout(
    `platform-cache del ${key}`,
    async () => {
      await redis!.del(key);
    },
    undefined,
  );
}

/** Per-item outcome of `withPlatformBatchReadCache`. */
export type PlatformBatchItemResult<T> =
  | { ok: true; read: PlatformReadResult<T> }
  | { ok: false; error: PlatformApiCooldownError };

/**
 * Batched variant of `withPlatformReadCache` for APIs that look up many ids in
 * one call (X tweets lookup, Bluesky getPosts, YouTube videos.list).
 *
 * Every item keeps its own cache entry (so a single-post read elsewhere shares
 * it), but all misses go to the platform in ONE `fetchMany` call that spends a
 * single budget token. Before this, an analytics page of 12 X posts was 12
 * outbound reads and blew through the per-account budget on first load.
 *
 * Suffixes that `fetchMany` leaves out of its map are absent from the result;
 * the caller decides what a missing item means.
 */
export async function withPlatformBatchReadCache<T>(opts: {
  platform: string;
  accountId: string;
  kind: PlatformReadKind;
  suffixes: string[];
  fresh?: boolean;
  fetchMany: (suffixes: string[]) => Promise<Map<string, T>>;
}): Promise<Map<string, PlatformBatchItemResult<T>>> {
  const out = new Map<string, PlatformBatchItemResult<T>>();
  const suffixes = [...new Set(opts.suffixes)];
  if (!suffixes.length) return out;
  const keyOf = (suffix: string) =>
    cacheKey(opts.kind, opts.platform, opts.accountId, suffix);
  const ttl = ttlSec(opts.platform, opts.kind);

  const staleOrError = async (
    suffix: string,
    retryAt: number,
    reason: PlatformCooldownReason,
  ): Promise<PlatformBatchItemResult<T>> => {
    try {
      const read = await serveStaleOrCooldown<T>(
        keyOf(suffix),
        opts.platform,
        retryAt,
        reason,
      );
      return { ok: true, read };
    } catch (e) {
      if (e instanceof PlatformApiCooldownError) return { ok: false, error: e };
      throw e;
    }
  };

  const cooledUntil = await cooldownUntil(opts.platform, opts.accountId, opts.kind);
  if (cooledUntil > Date.now()) {
    for (const suffix of suffixes) {
      out.set(suffix, await staleOrError(suffix, cooledUntil, "platform_429"));
    }
    return out;
  }

  const misses: string[] = [];
  for (const suffix of suffixes) {
    const cached = await readCache<T>(keyOf(suffix));
    if (
      cached &&
      shouldCachePlatformRead(cached.data) &&
      (!opts.fresh || !shouldBypassCacheForFresh(cached.cachedAt))
    ) {
      out.set(suffix, { ok: true, read: { data: cached.data, fromCache: true } });
    } else {
      misses.push(suffix);
    }
  }
  if (!misses.length) return out;

  const permit = await acquireOutboundPermit(
    opts.platform,
    opts.accountId,
    opts.kind,
  );
  if (!permit.allowed) {
    for (const suffix of misses) {
      out.set(suffix, await staleOrError(suffix, permit.retryAt, "local_budget"));
    }
    return out;
  }

  let fetched: Map<string, T>;
  try {
    fetched = await opts.fetchMany(misses);
  } catch (e) {
    if (!isPlatformRateLimitError(e)) throw e;
    const retryAt = await noteRateLimited(
      opts.platform,
      opts.accountId,
      opts.kind,
      e,
    );
    for (const suffix of misses) {
      out.set(suffix, await staleOrError(suffix, retryAt, "platform_429"));
    }
    return out;
  }

  for (const suffix of misses) {
    if (!fetched.has(suffix)) continue;
    const data = fetched.get(suffix) as T;
    if (shouldCachePlatformRead(data)) {
      await writeCache(keyOf(suffix), data, ttl);
    }
    out.set(suffix, { ok: true, read: { data, fromCache: false } });
  }
  return out;
}

/** Why a read was refused without reaching the platform. */
export type PlatformCooldownReason =
  /** The platform answered 429 recently; waiting out its reset. */
  | "platform_429"
  /** Social0's own per-account / global pacing budget is spent. */
  | "local_budget";

const PLATFORM_DISPLAY_NAME: Record<string, string> = {
  twitter_x: "X",
  bluesky: "Bluesky",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};

export function platformDisplayName(platform: string): string {
  return PLATFORM_DISPLAY_NAME[platform] ?? platform;
}

/** Whole seconds until `retryAt` (at least 1). */
export function secondsUntil(retryAt: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((retryAt - now) / 1000));
}

/** User-facing copy: names the platform and when to retry, never internals. */
export function platformCooldownMessage(
  platform: string,
  retryAt: number,
  now = Date.now(),
): string {
  const sec = secondsUntil(retryAt, now);
  const wait = sec < 60 ? `${sec}s` : `${Math.ceil(sec / 60)} min`;
  return `${platformDisplayName(platform)} is limiting requests right now. Try again in about ${wait}.`;
}

export class PlatformApiCooldownError extends Error {
  readonly platform: string;
  readonly retryAt: number;
  readonly reason: PlatformCooldownReason;

  constructor(
    platform: string,
    retryAt: number,
    reason: PlatformCooldownReason = "platform_429",
  ) {
    super(platformCooldownMessage(platform, retryAt));
    this.name = "PlatformApiCooldownError";
    this.platform = platform;
    this.retryAt = retryAt;
    this.reason = reason;
  }

  retryAfterSec(now = Date.now()): number {
    return secondsUntil(this.retryAt, now);
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
