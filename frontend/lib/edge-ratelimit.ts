import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";

/** Per-IP cap on marketing/auth pages before SSR runs (/, /auth, /dashboard). */
export const edgePageIpLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "1 m"),
      prefix: "rl:edge:page",
    })
  : null;

/** Per-IP cap on /api/auth/* before Better Auth + DB run. */
export const edgeAuthIpLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(45, "1 m"),
      prefix: "rl:edge:auth",
    })
  : null;

export type EdgeRateLimitResult = { allowed: true } | { allowed: false };

/**
 * Network-boundary rate limit. Fails open when Redis is unavailable so a
 * Redis outage does not take down the site.
 */
export async function enforceEdgeRateLimit(
  limiter: Ratelimit | null,
  key: string,
): Promise<EdgeRateLimitResult> {
  if (!limiter) return { allowed: true };
  const { success } = await limiter.limit(key);
  return success ? { allowed: true } : { allowed: false };
}
