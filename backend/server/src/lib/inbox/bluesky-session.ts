/**
 * Bluesky AT Proto session cache.
 * Shared across PM2 workers via Redis so createSession is not hammered
 * (createSession is a known rate-limit hotspot on bsky.social).
 */

import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "../redis.js";
import { withRedisTimeout } from "../redis-safe.js";
import { enforceRateLimit } from "../ratelimit.js";

const TTL_MS = 50 * 60 * 1000;
const REDIS_KEY_PREFIX = "bsky:session:";
const REDIS_TTL_SEC = 50 * 60;

type Cached = {
  accessJwt: string;
  refreshJwt: string | null;
  did: string;
  exp: number;
};

const memCache = new Map<string, Cached>();
/** Singleflight login/refresh per account within this process. */
const inflight = new Map<string, Promise<{ accessJwt: string; did: string } | null>>();

const createSessionLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 h"),
      prefix: "rl:bsky_create_session",
    })
  : null;

function redisKey(accountId: string): string {
  return `${REDIS_KEY_PREFIX}${accountId}`;
}

export function dropBlueskySession(accountId: string): void {
  memCache.delete(accountId);
  if (redis) {
    void withRedisTimeout(
      `bsky-session del ${accountId}`,
      async () => {
        await redis!.del(redisKey(accountId));
      },
      undefined,
    );
  }
}

async function readSession(accountId: string): Promise<Cached | null> {
  const mem = memCache.get(accountId);
  if (mem) {
    // Keep expired entries that still have a refreshJwt so we can refresh
    // instead of burning createSession quota.
    if (mem.exp > Date.now() || mem.refreshJwt) {
      // Fall through to also check Redis for a newer copy when mem is expired.
      if (mem.exp > Date.now()) return mem;
    } else {
      memCache.delete(accountId);
    }
  }
  if (!redis) {
    const local = memCache.get(accountId);
    if (local && (local.exp > Date.now() || local.refreshJwt)) return local;
    return null;
  }
  const raw = await withRedisTimeout(
    `bsky-session get ${accountId}`,
    async () => redis!.get<Cached>(redisKey(accountId)),
    null,
  );
  if (!raw || typeof raw !== "object") {
    const local = memCache.get(accountId);
    if (local && (local.exp > Date.now() || local.refreshJwt)) return local;
    return null;
  }
  if (!raw.accessJwt || !raw.did || typeof raw.exp !== "number") return null;
  memCache.set(accountId, raw);
  if (raw.exp > Date.now() || raw.refreshJwt) return raw;
  return null;
}

async function writeSession(
  accountId: string,
  data: { accessJwt: string; refreshJwt?: string | null; did: string },
): Promise<{ accessJwt: string; did: string }> {
  const cached: Cached = {
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt ?? null,
    did: data.did,
    exp: Date.now() + TTL_MS,
  };
  memCache.set(accountId, cached);
  if (redis) {
    await withRedisTimeout(
      `bsky-session set ${accountId}`,
      async () => {
        // Keep refresh material slightly longer than access TTL window.
        await redis!.set(redisKey(accountId), cached, {
          ex: REDIS_TTL_SEC + 30 * 60,
        });
      },
      undefined,
    );
  }
  return { accessJwt: cached.accessJwt, did: cached.did };
}

async function refreshSession(
  accountId: string,
  refreshJwt: string,
): Promise<{ accessJwt: string; did: string } | null> {
  const res = await fetch(
    "https://bsky.social/xrpc/com.atproto.server.refreshSession",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${refreshJwt}` },
      signal: AbortSignal.timeout(12_000),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    accessJwt?: string;
    refreshJwt?: string;
    did?: string;
  };
  const accessJwt = data.accessJwt;
  const did = data.did;
  if (!res.ok || !accessJwt || !did) {
    dropBlueskySession(accountId);
    return null;
  }
  return writeSession(accountId, {
    accessJwt,
    refreshJwt: data.refreshJwt,
    did,
  });
}

async function createSession(
  accountId: string,
  handle: string,
  appPassword: string,
): Promise<{ accessJwt: string; did: string } | null> {
  const allowed = await enforceRateLimit(createSessionLimiter, accountId);
  if (!allowed.allowed) {
    console.warn(
      `[bluesky] createSession rate limited for account ${accountId}`,
    );
    return null;
  }

  const res = await fetch(
    "https://bsky.social/xrpc/com.atproto.server.createSession",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    accessJwt?: string;
    refreshJwt?: string;
    did?: string;
  };
  const accessJwt = data.accessJwt;
  const did = data.did;
  if (!res.ok || !accessJwt || !did) return null;
  return writeSession(accountId, {
    accessJwt,
    refreshJwt: data.refreshJwt,
    did,
  });
}

async function resolveSession(
  accountId: string,
  handle: string,
  appPassword: string,
  opts?: { force?: boolean },
): Promise<{ accessJwt: string; did: string } | null> {
  const cached = await readSession(accountId);
  if (!opts?.force && cached && cached.exp > Date.now()) {
    return { accessJwt: cached.accessJwt, did: cached.did };
  }

  if (cached?.refreshJwt) {
    const refreshed = await refreshSession(accountId, cached.refreshJwt);
    if (refreshed) return refreshed;
  } else if (opts?.force) {
    dropBlueskySession(accountId);
  }

  return createSession(accountId, handle, appPassword);
}

/** Cached session - refresh JWT when possible; password login is last resort. */
export async function blueskySession(
  accountId: string,
  handle: string,
  appPassword: string,
  opts?: { force?: boolean },
): Promise<{ accessJwt: string; did: string } | null> {
  const flightKey = `${accountId}:${opts?.force ? "force" : "soft"}`;
  const existing = inflight.get(flightKey);
  if (existing) return existing;

  const promise = resolveSession(accountId, handle, appPassword, opts).finally(
    () => {
      inflight.delete(flightKey);
    },
  );
  inflight.set(flightKey, promise);
  return promise;
}

/** Drop a dead access JWT, refresh if possible, otherwise re-login. */
export async function blueskySessionAfter401(
  accountId: string,
  handle: string,
  appPassword: string,
): Promise<{ accessJwt: string; did: string } | null> {
  return blueskySession(accountId, handle, appPassword, { force: true });
}
