/**
 * Small shared helpers used across platform publishers.
 */

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry fetch on network errors (e.g. ECONNRESET). Does not retry on HTTP 4xx/5xx. */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 1000;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (e) {
      lastError = e;
      const err = e as Error & { cause?: { code?: string } };
      const isNetwork =
        err.message?.includes("fetch failed") ||
        err.cause?.code === "ECONNRESET" ||
        err.cause?.code === "ECONNREFUSED";
      if (attempt < retries && isNetwork) {
        await sleep(delayMs);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}
