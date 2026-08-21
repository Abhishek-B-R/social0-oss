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
  if (mem && mem.exp > Date.now()) return mem;
  if (!redis) return mem && mem.exp > Date.now() ? mem : null;
  const raw = await withRedisTimeout(
    `bsky-session get ${accountId}`,
    async () => redis!.get<Cached>(redisKey(accountId)),
    null,
  );
  if (!raw || typeof raw !== "object") return null;
  if (!raw.accessJwt || !raw.did || typeof raw.exp !== "number") return null;
  if (raw.exp <= Date.now()) return null;
  memCache.set(accountId, raw);
  return raw;
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
        await redis!.set(redisKey(accountId), cached, { ex: REDIS_TTL_SEC });
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
  const allowed = await enforceRateLimit(createSessionLimiter, accountId, {
    failClosedWhenUnavailable: false,
  });
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
  if (!opts?.force) {
    const cached = await readSession(accountId);
    if (cached) {
      return { accessJwt: cached.accessJwt, did: cached.did };
    }
  }

  const existing = await readSession(accountId);
  if (existing?.refreshJwt) {
    const refreshed = await refreshSession(accountId, existing.refreshJwt);
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
