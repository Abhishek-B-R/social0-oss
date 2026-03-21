import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function makeRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Exported so other modules (e.g. webhook idempotency) can reuse the same instance
export const redis = makeRedis();

// 200 uploads/hour per user (supports bulk sessions: ~50 images × 4 sessions)
export const uploadLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(200, "1 h"),
      prefix: "rl:upload",
    })
  : null;

// 30 publishes/hour per user
export const publishLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      prefix: "rl:publish",
    })
  : null;

// 10 OAuth initiations/minute per user (per platform key)
export const oauthLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 m"),
      prefix: "rl:oauth",
    })
  : null;

// 1 Twitter Premium refresh per user per 5 minutes (user-triggered, calls Twitter API)
export const twitterPremiumRefreshLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, "5 m"),
      prefix: "rl:twitter_premium_refresh",
    })
  : null;

// Check-email (for sign-in "email not found" message): strict per-IP limit to reduce enumeration.
// 5/hour is intentionally low — legitimate users rarely need to check more than once or twice.
export const checkEmailLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "rl:check_email",
    })
  : null;
