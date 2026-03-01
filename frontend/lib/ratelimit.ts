import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function makeRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = makeRedis();

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
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "rl:oauth",
    })
  : null;
