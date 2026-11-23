/**
 * Small shared helpers used across platform publishers.
 */

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Errors raised before a connection exists. The request never left this
 * process, so even a create is safe to send again.
 */
const NEVER_SENT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

/** Errors that can happen after the request reached the server. */
const MAYBE_SENT_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

function networkErrorCode(e: unknown): string | undefined {
  const cause = (e as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === "string" ? cause.code : undefined;
}

function isNetworkError(e: unknown): boolean {
  const code = networkErrorCode(e);
  if (code && (NEVER_SENT_CODES.has(code) || MAYBE_SENT_CODES.has(code))) return true;
  return e instanceof Error && e.message.includes("fetch failed");
}

/**
 * Retry fetch on network errors. Never retries an HTTP response (4xx/5xx).
 *
 * A non-idempotent request (POST, PUT, PATCH, DELETE) is retried only when the
 * connection was never established. After a reset or timeout the platform may
 * already have created the post and only the response was lost; sending it
 * again would publish a duplicate, so that error is thrown to the caller.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 1000;
  const idempotent = IDEMPOTENT_METHODS.has((options.method ?? "GET").toUpperCase());
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (e) {
      lastError = e;
      const code = networkErrorCode(e);
      const retryable = idempotent
        ? isNetworkError(e)
        : code !== undefined && NEVER_SENT_CODES.has(code);
      if (attempt < retries && retryable) {
        await sleep(delayMs);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}
