import { Ratelimit } from "@upstash/ratelimit";
import type { SubscriptionTier } from "@social0/shared";
import { redis } from "./redis.js";
import { enforceRateLimit } from "./ratelimit.js";

/** Public API requests per hour by subscription tier. */
export function apiRequestsPerHour(tier: SubscriptionTier): number {
  switch (tier) {
    case "max":
      return 10000;
    case "pro":
      return 5000;
    case "growth":
      return 1000;
    case "starter":
      return 300;
    default:
      return 60;
  }
}

function createTierLimiter(requestsPerHour: number): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requestsPerHour, "1 h"),
    prefix: `rl:api_v1:${requestsPerHour}`,
  });
}

const limiterCache = new Map<number, Ratelimit | null>();

function limiterForTier(tier: SubscriptionTier): Ratelimit | null {
  const limit = apiRequestsPerHour(tier);
  if (!limiterCache.has(limit)) {
    limiterCache.set(limit, createTierLimiter(limit));
  }
  return limiterCache.get(limit) ?? null;
}

export async function enforceApiRateLimit(
  tier: SubscriptionTier,
  userId: string,
): Promise<
  | { allowed: true }
  | { allowed: false; status: 429 | 503; error: string; retryAfterSec?: number }
> {
  const limiter = limiterForTier(tier);
  const result = await enforceRateLimit(limiter, `user:${userId}`);
  if (!result.allowed) {
    return {
      allowed: false,
      status: result.status,
      error: result.error,
      retryAfterSec: result.status === 429 ? 3600 : undefined,
    };
  }
  return { allowed: true };
}
