import { redis } from "./redis.js";

/**
 * Long enough to cover the platform call and the database writes that follow
 * it, short enough that a crashed run retries on the next cron tick rather
 * than being stranded.
 */
const DEFAULT_LEASE_SECONDS = 15 * 60;

/**
 * Take a short exclusive lease on one unit of cron work.
 *
 * The resurface and autoplug crons select their pending rows, act on the
 * platform, and only then mark the row terminal. Two overlapping runs — BullMQ
 * re-delivering a stalled job, or a second worker process during a deploy —
 * therefore both see the same row as pending and both post to the platform,
 * which the user sees as a duplicate retweet or a duplicate plug comment.
 *
 * A lease taken immediately before the platform call closes that window
 * without a new column and without a terminal "processing" state that a dead
 * worker could strand a row in: the key simply expires.
 *
 * Fails open. No Redis, or a Redis that will not answer, means proceeding as
 * before — a possible duplicate is a better outcome than a cron that silently
 * stops doing the work it exists for.
 */
export async function claimCronWork(
  key: string,
  leaseSeconds: number = DEFAULT_LEASE_SECONDS,
): Promise<boolean> {
  if (!redis) return true;
  try {
    const result = await redis.set(key, new Date().toISOString(), {
      nx: true,
      ex: leaseSeconds,
    });
    return result !== null;
  } catch (err) {
    console.warn(
      "[cron] could not check the work lease; proceeding without it",
      key,
      err,
    );
    return true;
  }
}

export function resurfaceEventClaimKey(eventId: string): string {
  return `cron:claim:resurface:${eventId}`;
}

export function autoPlugClaimKey(autoPlugId: string): string {
  return `cron:claim:autoplug:${autoPlugId}`;
}
