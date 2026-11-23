import { classifyPublicationError } from "./publication-error-kind.js";

/**
 * Backoff for a publish the platform turned away for a reason that passes:
 * rate limited (429). Each wait stays under the unfinalized-post sweep's
 * 5 minute grace (`UNFINALIZED_GRACE_MS`), so the sweep never finalizes a post
 * (and sends its failure email) while a retry is still queued.
 */
export const PUBLISH_RETRY_DELAYS_SEC = [30, 60, 120] as const;

/**
 * Explicit evidence the platform refused the request. Only rate limits: a 500 /
 * 503 (and Meta's "please retry your request later") can come back after
 * `media_publish` or `/feed` already created the post, so retrying posts twice.
 */
const RETRYABLE_RE =
  /\bHTTP 429\b|\b(?:status|code)[:= ]*429\b|too many requests|\brate[- ]?limit(?:ed)?\b/i;

/**
 * Quotas that reset daily (YouTube `quotaExceeded`, a Graph daily cap) do not
 * clear within the backoff above: retrying only spends the attempts.
 */
const NOT_SOON_RE = /quota|\bdaily\b|per day|24 hours/i;

/**
 * Seconds until a failed publish should run again, or null to fail it now.
 *
 * Retries only on positive evidence of a 429. Every 5xx is left out on
 * purpose: the post may already exist, so it needs a person (see
 * `fetchWithRetry` and `INTERRUPTED_PUBLISH_ERROR`).
 * Anything the shared classifier calls a reconnect, content or plan problem
 * is never retried, whatever status it came with.
 *
 * `attempt` is 1 for the first run.
 */
export function publishRetryDelaySeconds(
  error: string | null | undefined,
  attempt: number,
): number | null {
  const message = (error ?? "").trim();
  if (!message) return null;
  if (attempt < 1 || attempt > PUBLISH_RETRY_DELAYS_SEC.length) return null;
  if (classifyPublicationError({ error: message, status: "failed" }) !== "transient") {
    return null;
  }
  if (!RETRYABLE_RE.test(message) || NOT_SOON_RE.test(message)) return null;
  return PUBLISH_RETRY_DELAYS_SEC[attempt - 1]!;
}
