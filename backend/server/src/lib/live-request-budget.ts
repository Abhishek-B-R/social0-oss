/**
 * Hard wall-clock budget for live analytics/inbox RPCs that fan out to platforms.
 * Callers skip remaining work when expired so HTTP handlers cannot hang for minutes.
 */

export const LIVE_RPC_BUDGET_MS = 12_000;
export const PLATFORM_FETCH_TIMEOUT_MS = 10_000;

export type LiveRequestBudget = {
  /** Absolute deadline (Date.now() ms). */
  deadlineAt: number;
  remainingMs: () => number;
  isExpired: () => boolean;
};

export function createLiveRequestBudget(
  timeoutMs = LIVE_RPC_BUDGET_MS,
): LiveRequestBudget {
  const deadlineAt = Date.now() + timeoutMs;
  return {
    deadlineAt,
    remainingMs: () => Math.max(0, deadlineAt - Date.now()),
    isExpired: () => Date.now() >= deadlineAt,
  };
}

/** Race a promise against a timeout; clears the timer on settle. */
export async function raceTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
