/**
 * In-process armed timers for posts due within the next LOOKAHEAD_MS.
 * DB is only claimed at fire time — worker death drops timers; next scan re-arms.
 */

export const LOOKAHEAD_MS = 5 * 60 * 1000;

type ArmedEntry = {
  timeout: ReturnType<typeof setTimeout>;
  fireAt: number;
};

const armedPosts = new Map<string, ArmedEntry>();
const armedQueued = new Map<string, ArmedEntry>();

function arm(
  map: Map<string, ArmedEntry>,
  key: string,
  fireAt: Date,
  fire: () => Promise<void>,
): boolean {
  const fireAtMs = fireAt.getTime();
  const existing = map.get(key);
  // Same wake time already armed — leave it. Different time (user reschedule) → replace.
  if (existing) {
    if (existing.fireAt === fireAtMs) return false;
    clearTimeout(existing.timeout);
    map.delete(key);
  }

  const delay = Math.max(0, fireAtMs - Date.now());
  const timeout = setTimeout(() => {
    map.delete(key);
    void fire().catch((err) => {
      console.error("[scheduled-lookahead] fire failed", key, err);
    });
  }, delay);

  // Don't keep the process alive solely for lookahead timers under pm2.
  if (typeof timeout.unref === "function") timeout.unref();

  map.set(key, { timeout, fireAt: fireAtMs });
  return true;
}

export function armScheduledPost(
  postId: string,
  fireAt: Date,
  fire: () => Promise<void>,
): boolean {
  return arm(armedPosts, postId, fireAt, fire);
}

export function armQueuedSlot(
  queuedId: string,
  fireAt: Date,
  fire: () => Promise<void>,
): boolean {
  return arm(armedQueued, queuedId, fireAt, fire);
}
