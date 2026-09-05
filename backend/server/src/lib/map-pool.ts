export type MapPoolOptions<T, R> = {
  /**
   * When false, remaining items are filled via `onSkip` (or left undefined) and
   * workers stop claiming new work. Use with live RPC budgets.
   */
  shouldContinue?: () => boolean;
  /** Value (or factory) for items skipped because `shouldContinue` returned false. */
  onSkip?: (item: T, index: number) => R;
};

/** Bounded concurrent map. `next++` is sync so workers never share an index. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  options?: MapPoolOptions<T, R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      if (options?.shouldContinue && !options.shouldContinue()) {
        while (next < items.length) {
          const i = next++;
          if (options.onSkip) {
            results[i] = options.onSkip(items[i]!, i);
          }
        }
        return;
      }
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  // Never fall to 0 workers: a bad concurrency value would silently return
  // an array of `undefined` instead of doing the work.
  const safeConcurrency = Number.isFinite(concurrency)
    ? Math.max(1, Math.floor(concurrency))
    : 1;
  const n = Math.min(safeConcurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
