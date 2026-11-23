import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis.js";
import { withRedisTimeout } from "./redis-safe.js";

export { redis };

type Window = Parameters<typeof Ratelimit.slidingWindow>[1];

/** Budget of each limiter built by `slidingWindowLimiter`, for the local fallback. */
const limiterBudgets = new WeakMap<Ratelimit, { tokens: number; windowMs: number; prefix: string }>();

const WINDOW_UNITS_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** "1 m", "10m", "24 h" as milliseconds. */
export function windowToMs(window: Window): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(String(window).trim());
  if (!match) throw new Error(`Unsupported rate limit window: ${String(window)}`);
  return Number(match[1]) * WINDOW_UNITS_MS[match[2]!]!;
}

/**
 * A sliding-window limiter on the shared Upstash Redis (null without Redis),
 * whose budget is also recorded so `enforceRateLimit` can keep limiting from
 * memory while Redis is failing.
 */
export function slidingWindowLimiter(
  tokens: number,
  window: Window,
  prefix: string,
): Ratelimit | null {
  if (!redis) return null;
  const limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(tokens, window), prefix });
  limiterBudgets.set(limiter, { tokens, windowMs: windowToMs(window), prefix });
  return limiter;
}

/**
 * Fixed-window counters for when Redis does not answer. One Upstash database
 * backs every limit, and failing closed turned a Redis incident into an API
 * outage. This process (the API runs as one) keeps enforcing the same budget
 * per key until Redis is back; across restarts it starts from zero, which is
 * the price of not failing every request.
 */
const LOCAL_FALLBACK_MAX_KEYS = 50_000;
const localWindows = new Map<string, { count: number; resetAt: number }>();

function limitLocally(
  budget: { tokens: number; windowMs: number; prefix: string },
  key: string,
  rate = 1,
): RateLimitResult {
  const now = Date.now();
  const id = `${budget.prefix}:${key}`;
  let window = localWindows.get(id);
  if (!window || window.resetAt <= now) {
    if (!window && localWindows.size >= LOCAL_FALLBACK_MAX_KEYS) {
      for (const [k, w] of localWindows) {
        if (w.resetAt <= now) localWindows.delete(k);
      }
      if (localWindows.size >= LOCAL_FALLBACK_MAX_KEYS) {
        const oldest = localWindows.keys().next();
        if (!oldest.done) localWindows.delete(oldest.value);
      }
    }
    window = { count: 0, resetAt: now + budget.windowMs };
    localWindows.set(id, window);
  }
  if (window.count + rate > budget.tokens) {
    return {
      allowed: false,
      status: 429,
      error: "Too many requests. Try again later.",
      limit: budget.tokens,
      remaining: 0,
      reset: window.resetAt,
    };
  }
  window.count += rate;
  return {
    allowed: true,
    limit: budget.tokens,
    remaining: budget.tokens - window.count,
    reset: window.resetAt,
  };
}

/** Test hook. */
export function resetLocalRateLimits(): void {
  localWindows.clear();
}

export function isRateLimitingEnabled(): boolean {
  return redis !== null;
}

/** In production, rate limits must be backed by Redis (fail closed). */
export function isRateLimitingRequired(): boolean {
  return process.env.NODE_ENV === "production";
}

export type RateLimitResult =
  | {
      allowed: true;
      limit?: number;
      remaining?: number;
      reset?: number;
    }
  | {
      allowed: false;
      status: 429 | 503;
      error: string;
      limit?: number;
      remaining?: number;
      reset?: number;
    };

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

  // ponytail: Redis down must fail closed in production; dev may skip limits.
  const result = await withRedisTimeout(
    `ratelimit:${key}`,
    () => limiter.limit(key, options),
    undefined,
  );
  if (result === undefined) {
    // Redis did not answer. A limiter with a known budget keeps limiting
    // from memory instead of failing every request.
    const budget = limiterBudgets.get(limiter);
    if (budget) return limitLocally(budget, key, options?.rate);
    if (failClosed && isRateLimitingRequired()) {
      return {
        allowed: false,
        status: 503,
        error: "Rate limiting is unavailable. Try again later.",
      };
    }
    return { allowed: true };
  }
  if (!result.success) {
    return {
      allowed: false,
      status: 429,
      error: "Too many requests. Try again later.",
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  }
  return {
    allowed: true,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

// 400 uploads/hour per user (supports bulk sessions: ~50 images × 8 sessions)
export const uploadLimiter = slidingWindowLimiter(400, "1 h", "rl:upload");

// 60 publish actions/hour per user (one action may fan out to several platforms)
export const publishLimiter = slidingWindowLimiter(60, "1 h", "rl:publish");

// 120 X/Twitter tweet publications/hour per user - anti-automation only; normal usage stays well below this
export const twitterPublishLimiter = slidingWindowLimiter(120, "1 h", "rl:twitter_publish");

// Connect/reauth on dashboard/connections - generous for multi-platform setup + retries.
export const oauthLimiter = slidingWindowLimiter(120, "10 m", "rl:oauth");

// Manual token refresh per platform (separate from OAuth connect quota).
export const tokenRefreshLimiter = slidingWindowLimiter(60, "1 h", "rl:token_refresh");

// Twitter Premium status refresh (user-triggered, calls Twitter API).
export const twitterPremiumRefreshLimiter = slidingWindowLimiter(15, "5 m", "rl:twitter_premium_refresh");

// 10 checkout session creations per user per minute (prevents Dodo API quota abuse)
export const checkoutLimiter = slidingWindowLimiter(10, "1 m", "rl:checkout");

// Check-email (for sign-in "email not found" message): strict per-IP limit to reduce enumeration.
export const checkEmailLimiter = slidingWindowLimiter(10, "1 h", "rl:check_email");

// Per-IP cap on check-email for the same address (slows enumeration of a target inbox).
export const checkEmailPerEmailLimiter = slidingWindowLimiter(5, "1 h", "rl:check_email_addr");

// Change-email OTP: per user + per IP (prevents email bombing via OTP sends).
export const changeEmailOtpLimiter = slidingWindowLimiter(5, "1 h", "rl:change_email_otp_user");

export const changeEmailOtpIpLimiter = slidingWindowLimiter(10, "1 h", "rl:change_email_otp_ip");

export const changeEmailOtpTargetLimiter = slidingWindowLimiter(3, "1 h", "rl:change_email_otp_target");

// Sign-up attempts per IP (applies to both Turnstile and non-Turnstile routes).
export const signUpIpLimiter = slidingWindowLimiter(10, "1 h", "rl:sign_up_ip");

// Bluesky BYOK credential validation per user (connections page).
export const blueskyByokLimiter = slidingWindowLimiter(40, "1 h", "rl:bluesky_byok");

// Billing sync from Dodo per user.
export const billingSyncLimiter = slidingWindowLimiter(5, "1 m", "rl:billing_sync");

/** General RPC calls per authenticated user. */
export const rpcLimiter = slidingWindowLimiter(120, "1 m", "rl:rpc");

/** Expensive RPC mutations (publish, post writes). */
export const rpcMutationLimiter = slidingWindowLimiter(30, "1 m", "rl:rpc_mut");

/**
 * Live platform reads (inbox + analytics). Separate from general RPC so a
 * chatty dashboard cannot burn platform egress via list/refetch storms.
 */
export const rpcLiveReadLimiter = slidingWindowLimiter(20, "1 m", "rl:rpc_live");
