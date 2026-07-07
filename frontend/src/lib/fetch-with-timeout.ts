/** fetch with an AbortSignal timeout so hung platform APIs cannot block publish forever. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 30_000, signal: userSignal, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onUserAbort = () => controller.abort();
  userSignal?.addEventListener("abort", onUserAbort, { once: true });

  try {
    return await fetch(input, { ...fetchInit, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    userSignal?.removeEventListener("abort", onUserAbort);
  }
}
