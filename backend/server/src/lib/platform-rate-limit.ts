/**
 * Platform-side rate limit signals for live reads (inbox, analytics).
 *
 * Fetchers that talk to a platform over plain `fetch` normally degrade
 * failures into a `status: "error"` result. A 429 must not be degraded that
 * way: error results are never cached and never start a cooldown, so every
 * following request re-hits a platform that is already throttling us and
 * keeps the account limited. Throwing `PlatformRateLimitError` lets
 * `withPlatformReadCache` set a cooldown and serve stale data instead.
 */

/** Cooldown used when the platform gives no reset hint. */
export const DEFAULT_PLATFORM_RETRY_AFTER_SEC = 120;
/** Never park an account longer than one X/Graph rate window. */
export const MAX_PLATFORM_RETRY_AFTER_SEC = 15 * 60;

export class PlatformRateLimitError extends Error {
  readonly status = 429;
  readonly platform: string;
  readonly retryAfterSec: number;

  constructor(platform: string, retryAfterSec?: number | null) {
    super(`${platform} rate limit exceeded`);
    this.name = "PlatformRateLimitError";
    this.platform = platform;
    this.retryAfterSec = clampRetryAfter(retryAfterSec);
  }
}

export function clampRetryAfter(sec: number | null | undefined): number {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) {
    return DEFAULT_PLATFORM_RETRY_AFTER_SEC;
  }
  return Math.min(Math.ceil(sec), MAX_PLATFORM_RETRY_AFTER_SEC);
}

type HeaderBag =
  | Headers
  | Record<string, string | string[] | number | undefined>
  | null
  | undefined;

function headerValue(headers: HeaderBag, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const bag = headers as Record<string, string | string[] | number | undefined>;
  const raw = bag[name] ?? bag[name.toLowerCase()];
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : String(raw);
}

/**
 * Seconds until a platform says we may retry, from the usual headers:
 * `Retry-After` (delta seconds or HTTP date), `x-rate-limit-reset` (X, epoch
 * seconds) and `ratelimit-reset` (Bluesky; epoch seconds, or delta seconds
 * per the IETF draft - both are accepted).
 */
export function retryAfterFromHeaders(
  headers: HeaderBag,
  nowMs = Date.now(),
): number | null {
  const retryAfter = headerValue(headers, "retry-after");
  if (retryAfter) {
    const asNumber = Number(retryAfter);
    if (Number.isFinite(asNumber)) return asNumber > 0 ? asNumber : null;
    const asDate = Date.parse(retryAfter);
    if (Number.isFinite(asDate)) {
      const wait = (asDate - nowMs) / 1000;
      return wait > 0 ? wait : null;
    }
  }
  for (const name of ["x-rate-limit-reset", "ratelimit-reset"]) {
    const value = Number(headerValue(headers, name));
    if (!Number.isFinite(value) || value <= 0) continue;
    // Anything that looks like a unix timestamp is absolute; small values are deltas.
    const wait = value > 1e9 ? value - nowMs / 1000 : value;
    if (wait > 0) return wait;
  }
  return null;
}

/**
 * Meta Graph throttling arrives as HTTP 400/403 with an error code rather
 * than a 429: 4 (app), 17 (user), 32 (page), 613 (custom), 80xxx (business
 * use case limits).
 */
export function isGraphRateLimitBody(data: unknown): boolean {
  const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
  if (typeof code !== "number") return false;
  return (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    (code >= 80000 && code < 80100)
  );
}

const YOUTUBE_THROTTLE_REASONS = new Set([
  "quotaExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "dailyLimitExceeded",
]);

/**
 * Google answers quota / rate exhaustion with HTTP 403 and a reason code. Left
 * alone, that 403 reads as "missing scope" and nags the user to reconnect an
 * account that is perfectly healthy.
 */
export function isYouTubeQuotaBody(data: unknown): boolean {
  const errors = (data as { error?: { errors?: Array<{ reason?: unknown }> } } | null)
    ?.error?.errors;
  if (!Array.isArray(errors)) return false;
  return errors.some(
    (e) => typeof e?.reason === "string" && YOUTUBE_THROTTLE_REASONS.has(e.reason),
  );
}

/** Throw when a plain-fetch platform response signals throttling. */
export function throwIfPlatformRateLimited(
  platform: string,
  res: { status: number; headers?: HeaderBag; data?: unknown },
  opts?: { graph?: boolean; youtube?: boolean },
): void {
  const limited =
    res.status === 429 ||
    (opts?.graph === true && isGraphRateLimitBody(res.data)) ||
    (opts?.youtube === true && isYouTubeQuotaBody(res.data));
  if (!limited) return;
  throw new PlatformRateLimitError(platform, retryAfterFromHeaders(res.headers));
}
