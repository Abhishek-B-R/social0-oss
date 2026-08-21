import { describe, expect, it } from "vitest";
import {
  platformCommentPageRounds,
  platformInboxSampleLimit,
  isPlatformRateLimitError,
  pruneBoundedMap,
  shouldCachePlatformRead,
  MEM_CACHE_MAX_ENTRIES,
} from "../lib/platform-api-cache.js";

describe("platform-api-cache helpers", () => {
  it("caps X inbox sample size", () => {
    expect(platformInboxSampleLimit("twitter_x", 40)).toBe(12);
    expect(platformInboxSampleLimit("instagram", 40)).toBe(40);
  });

  it("limits X comment page rounds", () => {
    expect(platformCommentPageRounds("twitter_x", 4)).toBe(1);
    expect(platformCommentPageRounds(undefined, 4)).toBe(4);
  });

  it("detects rate limit errors", () => {
    expect(isPlatformRateLimitError({ status: 429 })).toBe(true);
    expect(isPlatformRateLimitError(new Error("Rate limit exceeded"))).toBe(true);
    expect(isPlatformRateLimitError(new Error("Forbidden"))).toBe(false);
  });

  it("does not cache scope-missing platform reads", () => {
    expect(shouldCachePlatformRead({ status: "ok", comments: [] })).toBe(true);
    expect(
      shouldCachePlatformRead({
        status: "scope_missing",
        missingScopes: ["threads_manage_replies"],
      }),
    ).toBe(false);
    expect(
      shouldCachePlatformRead({ status: "ok", missingScopes: ["x"] }),
    ).toBe(false);
  });

  it("exposes a finite in-memory cache cap", () => {
    expect(MEM_CACHE_MAX_ENTRIES).toBeGreaterThan(0);
    expect(MEM_CACHE_MAX_ENTRIES).toBeLessThanOrEqual(2_000);
  });

  it("prunes bounded maps under the max size", () => {
    const map = new Map<string, { exp: number }>();
    for (let i = 0; i < 10; i++) {
      map.set(`k${i}`, { exp: Date.now() + 60_000 });
    }
    pruneBoundedMap(map, 3);
    expect(map.size).toBe(3);
  });
});
