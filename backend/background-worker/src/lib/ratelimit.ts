import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis.js";

export { redis };

export function isRateLimitingEnabled(): boolean {
  return redis !== null;
}

/** In production, rate limits must be backed by Redis (fail closed). */
export function isRateLimitingRequired(): boolean {
  return process.env.NODE_ENV === "production";
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; error: string };

export async function enforceRateLimit(
  limiter: Ratelimit | null,
  key: string,
  options?: { rate?: number; failClosedWhenUnavailable?: boolean },
): Promise<RateLimitResult> {
  const failClosed = options?.failClosedWhenUnavailable !== false;
  if (!limiter) {
    if (isRateLimitingRequired() && failClosed) {
      return {
        allowed: false,
        status: 503,
        error: "Rate limiting is unavailable. Try again later.",
      };
    }
    return { allowed: true };
  }

  const { success } = await limiter.limit(key, options);
  if (!success) {
    return {
      allowed: false,
      status: 429,
      error: "Too many requests. Try again later.",
    };
  }
  return { allowed: true };
}

// 400 uploads/hour per user (supports bulk sessions: ~50 images × 8 sessions)
export const uploadLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(400, "1 h"),
      prefix: "rl:upload",
    })
  : null;

// 60 publish actions/hour per user (one action may fan out to several platforms)
export const publishLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 h"),
      prefix: "rl:publish",
    })
  : null;

// 120 X/Twitter tweet publications/hour per user - anti-automation only; normal usage stays well below this
export const twitterPublishLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "1 h"),
      prefix: "rl:twitter_publish",
    })
  : null;

// Connect/reauth on dashboard/connections - generous for multi-platform setup + retries.
export const oauthLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "10 m"),
      prefix: "rl:oauth",
    })
  : null;

// Manual token refresh per platform (separate from OAuth connect quota).
export const tokenRefreshLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 h"),
      prefix: "rl:token_refresh",
    })
  : null;

// Twitter Premium status refresh (user-triggered, calls Twitter API).
export const twitterPremiumRefreshLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(15, "5 m"),
      prefix: "rl:twitter_premium_refresh",
    })
  : null;

// 10 checkout session creations per user per minute (prevents Dodo API quota abuse)
export const checkoutLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "rl:checkout",
    })
  : null;

// Check-email (for sign-in "email not found" message): strict per-IP limit to reduce enumeration.
export const checkEmailLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "rl:check_email",
    })
  : null;

// Per-IP cap on check-email for the same address (slows enumeration of a target inbox).
export const checkEmailPerEmailLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "rl:check_email_addr",
    })
  : null;

// Change-email OTP: per user + per IP (prevents email bombing via OTP sends).
export const changeEmailOtpLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "rl:change_email_otp_user",
    })
  : null;

export const changeEmailOtpIpLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "rl:change_email_otp_ip",
    })
  : null;

export const changeEmailOtpTargetLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 h"),
      prefix: "rl:change_email_otp_target",
    })
  : null;

// Sign-up attempts per IP (applies to both Turnstile and non-Turnstile routes).
export const signUpIpLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "rl:sign_up_ip",
    })
  : null;

// Bluesky BYOK credential validation per user (connections page).
export const blueskyByokLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(40, "1 h"),
      prefix: "rl:bluesky_byok",
    })
  : null;

// Billing sync from Dodo per user.
export const billingSyncLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      prefix: "rl:billing_sync",
    })
  : null;
