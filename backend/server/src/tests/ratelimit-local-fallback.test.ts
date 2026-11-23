/**
 * One Upstash database backs every limit, and the limits failed closed: a
 * Redis incident answered every rate-limited request with 503. Limiters built
 * with `slidingWindowLimiter` now keep enforcing their budget from memory
 * while Redis is failing.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforceRateLimit,
  redis,
  resetLocalRateLimits,
  slidingWindowLimiter,
  windowToMs,
} from "../lib/ratelimit.js";

const savedEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = "production";
  resetLocalRateLimits();
});
afterEach(() => {
  process.env.NODE_ENV = savedEnv;
  vi.restoreAllMocks();
});

function redisDown(limiter: Ratelimit) {
  vi.spyOn(limiter, "limit").mockRejectedValue(new Error("ECONNREFUSED upstash"));
}

describe("rate limits while Redis is down", () => {
  it("keeps enforcing the limiter's budget from memory instead of failing with 503", async () => {
    const limiter = slidingWindowLimiter(3, "1 m", "rl:test_fallback");
    expect(limiter).not.toBeNull();
    redisDown(limiter!);

    const results = [];
    for (let i = 0; i < 4; i++) results.push(await enforceRateLimit(limiter, "user-1"));

    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results[3]).toMatchObject({ allowed: false, status: 429 });
    // Another key has its own budget.
    expect((await enforceRateLimit(limiter, "user-2")).allowed).toBe(true);
  });

  it("still fails closed for a limiter built without a known budget", async () => {
    const bare = new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(3, "1 m"), prefix: "rl:bare" });
    redisDown(bare);

    expect(await enforceRateLimit(bare, "user-1")).toMatchObject({ allowed: false, status: 503 });
  });

  it("reads window sizes", () => {
    expect(windowToMs("1 m")).toBe(60_000);
    expect(windowToMs("10m")).toBe(600_000);
    expect(windowToMs("1 h")).toBe(3_600_000);
    expect(() => windowToMs("soon" as never)).toThrow();
  });
});
