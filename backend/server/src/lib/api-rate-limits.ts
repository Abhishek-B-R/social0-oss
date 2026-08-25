import type { FastifyReply } from "fastify";
import { Ratelimit } from "@upstash/ratelimit";
import type { SubscriptionTier } from "@social0/shared";
import { redis } from "./redis.js";
import { enforceRateLimit } from "./ratelimit.js";

export type ApiRateLimitInfo = {
  limit: number;
  remaining: number;
  resetSec: number;
};

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
  | { allowed: true; info: ApiRateLimitInfo }
  | {
      allowed: false;
      status: 429 | 503;
      error: string;
      retryAfterSec?: number;
      info: ApiRateLimitInfo;
    }
> {
  const limit = apiRequestsPerHour(tier);
  const limiter = limiterForTier(tier);
  const result = await enforceRateLimit(limiter, `user:${userId}`);
  const remaining = result.remaining ?? (result.allowed ? limit : 0);
  const resetSec = resetSeconds(result.reset);
  const info: ApiRateLimitInfo = { limit, remaining, resetSec };
  if (!result.allowed) {
    return {
      allowed: false,
      status: result.status,
      error: result.error,
      retryAfterSec: result.status === 429 ? resetSec : undefined,
      info,
    };
  }
  return { allowed: true, info };
}

function resetSeconds(reset: number | undefined): number {
  if (!reset) return 3600;
  const sec = Math.ceil((reset - Date.now()) / 1000);
  return Number.isFinite(sec) && sec > 0 ? sec : 3600;
}

export function applyRateLimitHeaders(
  reply: FastifyReply,
  info: ApiRateLimitInfo,
): void {
  reply.header("RateLimit-Limit", String(info.limit));
  reply.header("RateLimit-Remaining", String(info.remaining));
  reply.header("RateLimit-Reset", String(info.resetSec));
  reply.header("RateLimit-Policy", `${info.limit};w=3600`);
  reply.header(
    "RateLimit",
    `"default";r=${info.remaining};t=${info.resetSec}`,
  );
  reply.header("X-RateLimit-Limit", String(info.limit));
  reply.header("X-RateLimit-Remaining", String(info.remaining));
  reply.header("X-RateLimit-Reset", String(info.resetSec));
}

export const FREE_TIER_RATE_LIMIT: ApiRateLimitInfo = {
  limit: 60,
  remaining: 60,
  resetSec: 3600,
};
