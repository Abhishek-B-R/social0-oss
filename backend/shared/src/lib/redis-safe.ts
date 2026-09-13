/** ponytail: short timeout — Upstash quota errors can hang; miss cache and use Postgres instead. */
const DEFAULT_REDIS_TIMEOUT_MS = 2_500;

/**
 * Run a Redis call with a timeout. On failure, return `fallback` so callers can
 * continue (e.g. auth session lookup falls back to the database).
 */
export async function withRedisTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs = DEFAULT_REDIS_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Redis timeout (${label})`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (err) {
    console.warn(
      `[redis] ${label} failed, using fallback:`,
      err instanceof Error ? err.message : err,
    );
    return fallback;
  } finally {
    // Without this the loser of the race keeps a pending timer for the full
    // timeout on every call, which piles up under load.
    if (timer) clearTimeout(timer);
  }
}
