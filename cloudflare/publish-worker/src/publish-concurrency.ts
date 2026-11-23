/**
 * Fleet-wide publish concurrency via Upstash Redis REST: a cap per platform
 * (shared app quota) and a cap per connected account (per-user platform rate
 * limits, and two uploads to one account racing each other).
 *
 * The check and the take happen in one Lua script. Reading the count and then
 * adding a member in two calls let two isolates both see room and both take
 * the last slot.
 *
 * When the caps are full the caller requeues the job with a delay
 * (`PublishSlotBusyError`) instead of publishing anyway. When Redis itself is
 * missing or failing the slot is skipped (fail-open): this is a throttle, and
 * halting every publish because the throttle store is down is worse than a
 * brief burst above the cap.
 */
import { maxConcurrentPublishesForPlatform } from "../../../backend/shared/src/constants/platform-publish-concurrency";

/**
 * A holder that never released (a killed isolate) frees its slot after this.
 * Executions renew their DB lease while they run; the slot is only a throttle.
 */
export const SLOT_TTL_SEC = 15 * 60;

/** In-flight publishes allowed per connected account. */
export const MAX_CONCURRENT_PUBLISHES_PER_ACCOUNT = 1;

/**
 * Delay before a job that found the caps full tries again. Jittered so jobs
 * that collided do not all come back in the same second.
 */
export function slotRetryDelaySeconds(random: () => number = Math.random): number {
  return 15 + Math.floor(random() * 16);
}

/**
 * Requeues before a job stops waiting and runs anyway, ~30 minutes at the
 * delays above. Slots expire after `SLOT_TTL_SEC`, so only sustained load past
 * the caps reaches it; a scheduled post must still go out.
 */
export const MAX_SLOT_WAITS = 80;

// One hash tag for every key so the script touches a single cluster slot.
function platformKey(platform: string): string {
  return `publish:inflight:{slots}:${platform}`;
}

function accountKey(connectedAccountId: string): string {
  return `publish:inflight:{slots}:acct:${connectedAccountId}`;
}

/**
 * KEYS: platform set, account set. ARGV: now ms, expiry ms, member, platform
 * cap, account cap, ttl ms. Members are scored by expiry, so expired holders
 * are dropped before counting. Returns 1 when both slots were taken, 0 when
 * either cap is full (and takes neither).
 */
export const ACQUIRE_SLOT_SCRIPT = `
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[4]) then return 0 end
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[5]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[6])
redis.call('PEXPIRE', KEYS[2], ARGV[6])
return 1
`;

function redisConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  if (!url || !token) return false;
  if (url.includes("worker-unused")) return false;
  if (token.includes("worker-unused")) return false;
  return true;
}

async function redisCommand(args: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`Upstash ${res.status}`);
  }
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`Upstash: ${data.error}`);
  return data.result;
}

export type PublishSlot = {
  release: () => Promise<void>;
};

/** Both caps are full: requeue the job after `delaySeconds`. */
export class PublishSlotBusyError extends Error {
  constructor(
    readonly platform: string,
    readonly delaySeconds: number,
  ) {
    super(`${platform} publish capacity is full; retrying in ${delaySeconds}s`);
    this.name = "PublishSlotBusyError";
  }
}

/**
 * Take a publish slot for this job's platform and account.
 *
 * Returns the slot, or `null` when Redis is not configured or failing (the
 * publish goes ahead without one). Throws `PublishSlotBusyError` when a cap is
 * full.
 */
export async function acquirePublishSlot(job: {
  platform: string;
  connectedAccountId: string;
  publicationId: string;
}): Promise<PublishSlot | null> {
  if (!redisConfigured()) return null;

  const keys = [platformKey(job.platform), accountKey(job.connectedAccountId)];
  const now = Date.now();
  const member = `${job.publicationId}:${now}:${Math.random().toString(36).slice(2, 10)}`;

  let taken: unknown;
  try {
    taken = await redisCommand([
      "EVAL",
      ACQUIRE_SLOT_SCRIPT,
      keys.length,
      ...keys,
      now,
      now + SLOT_TTL_SEC * 1000,
      member,
      maxConcurrentPublishesForPlatform(job.platform),
      MAX_CONCURRENT_PUBLISHES_PER_ACCOUNT,
      SLOT_TTL_SEC * 1000,
    ]);
  } catch (e) {
    console.warn(
      "[publish-concurrency] redis unavailable, publishing without a slot",
      e instanceof Error ? e.message : e,
    );
    return null;
  }

  if (Number(taken) !== 1) {
    throw new PublishSlotBusyError(job.platform, slotRetryDelaySeconds());
  }

  return {
    release: async () => {
      try {
        await redisCommand(["ZREM", keys[0]!, member]);
        await redisCommand(["ZREM", keys[1]!, member]);
      } catch (e) {
        // The slot expires on its own after SLOT_TTL_SEC.
        console.error("[publish-concurrency] release failed", e);
      }
    },
  };
}
