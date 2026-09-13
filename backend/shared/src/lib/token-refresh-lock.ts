import { sleep } from "./sleep.js";
import { randomUUID } from "node:crypto";
import { redis } from "./redis.js";
import { withRedisTimeout } from "./redis-safe.js";

/**
 * Single-flight guard around OAuth token refresh.
 *
 * Publishing one post fans out several concurrent platform jobs on the same
 * connected account, and analytics/inbox reads run alongside them. Each caller
 * independently saw the token near expiry and called the provider's refresh
 * endpoint. On the platforms that *rotate* the refresh token — TikTok,
 * Pinterest, LinkedIn (MDP) — the second call presents a refresh token the
 * first call already invalidated, the provider rejects it, and the account
 * drops out with "please reconnect".
 *
 * Fails open in every direction: no Redis, a Redis error, or a lock we could
 * not wait out all fall through to refreshing anyway, which is exactly the
 * behaviour before this guard existed. Telling a caller "someone else did it"
 * when we cannot actually see the lock would be worse than the race — nobody
 * would refresh and every publish would fail on an expired token.
 */

const LOCK_TTL_SEC = 30;
const WAIT_TIMEOUT_MS = 12_000;
const POLL_INTERVAL_MS = 250;

/** Sentinel distinguishing "Redis said no" from "Redis did not answer". */
const UNAVAILABLE = Symbol("redis-unavailable");

function lockKey(accountId: string): string {
  return `token-refresh:lock:${accountId}`;
}

type AcquireResult = "acquired" | "held" | "unavailable";

async function acquire(
  accountId: string,
  token: string,
): Promise<AcquireResult> {
  if (!redis) return "unavailable";
  const result = await withRedisTimeout<string | null | typeof UNAVAILABLE>(
    `token-refresh-lock:acquire:${accountId}`,
    () => redis!.set(lockKey(accountId), token, { nx: true, ex: LOCK_TTL_SEC }),
    UNAVAILABLE,
  );
  if (result === UNAVAILABLE) return "unavailable";
  return result === null ? "held" : "acquired";
}

async function release(accountId: string, token: string): Promise<void> {
  if (!redis) return;
  // Only drop our own lock: a slow refresh whose TTL expired must not delete
  // the lock a second caller has since taken.
  await withRedisTimeout(
    `token-refresh-lock:release:${accountId}`,
    async () => {
      const current = await redis!.get<string>(lockKey(accountId));
      if (current === token) await redis!.del(lockKey(accountId));
      return true;
    },
    true,
  );
}

type PeekResult = "held" | "free" | "unavailable";

async function peek(accountId: string): Promise<PeekResult> {
  if (!redis) return "unavailable";
  const current = await withRedisTimeout<string | null | typeof UNAVAILABLE>(
    `token-refresh-lock:peek:${accountId}`,
    () => redis!.get<string>(lockKey(accountId)),
    UNAVAILABLE,
  );
  if (current === UNAVAILABLE) return "unavailable";
  return current == null ? "free" : "held";
}

export type RefreshLockOutcome<T> =
  | { refreshed: true; value: T }
  /** Another caller refreshed; re-read the account and use the stored token. */
  | { refreshed: false };

/**
 * Run `refresh` under the account's refresh lock.
 *
 * When another caller holds it, wait for them to finish and report
 * `{ refreshed: false }` so the caller re-reads the freshly stored token
 * instead of racing a second refresh.
 */
export async function withTokenRefreshLock<T>(
  accountId: string,
  refresh: () => Promise<T>,
): Promise<RefreshLockOutcome<T>> {
  const token = randomUUID();
  const acquired = await acquire(accountId, token);

  if (acquired === "unavailable") {
    return { refreshed: true, value: await refresh() };
  }

  if (acquired === "acquired") {
    try {
      return { refreshed: true, value: await refresh() };
    } finally {
      await release(accountId, token);
    }
  }

  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const state = await peek(accountId);
    if (state === "free") return { refreshed: false };
    if (state === "unavailable") break;
  }

  // Holder never released (crash, or a refresh slower than the wait budget),
  // or Redis stopped answering. Refreshing anyway is the pre-lock behaviour.
  console.warn(
    "[token-refresh] could not wait out the refresh lock; refreshing without it",
    accountId,
  );
  return { refreshed: true, value: await refresh() };
}
