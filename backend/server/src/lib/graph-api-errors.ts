/**
 * Classify Meta Graph API errors (graph.facebook.com, graph.instagram.com,
 * graph.threads.net) by the numeric `error.code` in the body instead of
 * matching words in the message.
 *
 * Why: a deleted post comes back as GraphMethodException code 100 / subcode 33
 * with the message "Object with ID '...' does not exist, cannot be loaded due
 * to missing permissions, or does not support this operation". Matching the
 * word "permission" (or the "#10" substring, which also hits every "(#100)")
 * turned every deleted post into a false "Reconnect" prompt.
 */

import { isGonePlatformPost } from "./inbox/fetch-errors.js";
import { PlatformRateLimitError } from "./platform-rate-limit.js";

export type GraphApiError = {
  message: string;
  code?: number;
  subcode?: number;
};

function int(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

/** Pull `{ error: { message, code, error_subcode } }` out of a Graph body. */
export function graphApiError(data: unknown, fallback: string): GraphApiError {
  const raw =
    data && typeof data === "object"
      ? (data as { error?: unknown }).error
      : undefined;
  const e =
    raw && typeof raw === "object"
      ? (raw as { message?: unknown; code?: unknown; error_subcode?: unknown })
      : {};
  const message =
    typeof e.message === "string" && e.message.trim() ? e.message : fallback;
  return { message, code: int(e.code), subcode: int(e.error_subcode) };
}

/**
 * Graph throttling: 4 (app), 17 (user), 32 (page), 613 (custom),
 * 80001-80014 (business use case). Plus a plain HTTP 429.
 */
export function isGraphRateLimit(err: GraphApiError, httpStatus?: number): boolean {
  if (httpStatus === 429) return true;
  const c = err.code;
  if (c == null) return false;
  return c === 4 || c === 17 || c === 32 || c === 613 || (c >= 80001 && c <= 80014);
}

/** The object (post, media, thread) is gone: code 100 + subcode 33, or "does not exist". */
export function isGraphObjectGone(err: GraphApiError): boolean {
  if (err.code === 100 && err.subcode === 33) return true;
  return isGonePlatformPost(err.message);
}

/**
 * Missing permission: Graph code 10 or 200-299. When the body carries no code
 * at all, fall back to the message (older / proxied responses).
 * `scopeHint` matches the scope name itself (e.g. /manage_comments/).
 */
export function isGraphPermissionError(err: GraphApiError, scopeHint?: RegExp): boolean {
  const c = err.code;
  if (c === 10 || (c != null && c >= 200 && c <= 299)) return true;
  if (scopeHint?.test(err.message)) return true;
  if (c == null) return /permission/i.test(err.message);
  return false;
}

/** Throw so the platform read cache sets a cooldown and serves saved data. */
export function throwIfGraphRateLimited(
  platform: string,
  err: GraphApiError,
  httpStatus?: number,
): void {
  if (isGraphRateLimit(err, httpStatus)) {
    throw new PlatformRateLimitError(platform);
  }
}
