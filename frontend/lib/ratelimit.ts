import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";

export { redis };

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

// 120 X/Twitter tweet publications/hour per user — anti-automation only; normal usage stays well below this
export const twitterPublishLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "1 h"),
      prefix: "rl:twitter_publish",
    })
  : null;

// 40 OAuth initiations/minute per user (per platform key)
export const oauthLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(40, "1 m"),
      prefix: "rl:oauth",
    })
  : null;

// 2 Twitter Premium refreshes per user per 5 minutes (user-triggered, calls Twitter API)
export const twitterPremiumRefreshLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(2, "5 m"),
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
// 10/hour is intentionally low — legitimate users rarely need to check more than once or twice.
export const checkEmailLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "rl:check_email",
    })
  : null;
