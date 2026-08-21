import { describe, expect, it } from "vitest";
import {
  platformCommentPageRounds,
  platformFetchConcurrency,
  platformInboxSampleLimit,
  isPlatformRateLimitError,
  pruneBoundedMap,
  shouldBypassCacheForFresh,
  shouldCachePlatformRead,
  MEM_CACHE_MAX_ENTRIES,
  SOFT_FRESH_MIN_AGE_MS,
} from "../lib/platform-api-cache.js";

describe("platform-api-cache helpers", () => {
  it("caps scarce platforms harder than the default page size", () => {
    expect(platformInboxSampleLimit("twitter_x", 40)).toBe(24);
    expect(platformInboxSampleLimit("twitter_x", 24, { allAccounts: true })).toBe(16);
    expect(platformInboxSampleLimit("bluesky", 40)).toBe(8);
    expect(platformInboxSampleLimit("bluesky", 40, { allAccounts: true })).toBe(4);
    expect(platformInboxSampleLimit("youtube", 40)).toBe(8);
    expect(platformInboxSampleLimit("instagram", 40)).toBe(12);
    expect(platformInboxSampleLimit(undefined, 40, { allAccounts: true })).toBe(8);
  });

  it("limits comment page rounds on scarce APIs", () => {
    expect(platformCommentPageRounds("twitter_x", 4)).toBe(1);
    expect(platformCommentPageRounds("bluesky", 4)).toBe(1);
    expect(platformCommentPageRounds("youtube", 4)).toBe(1);
    expect(platformCommentPageRounds(undefined, 4)).toBe(2);
  });

  it("serializes expensive platform fetches", () => {
    expect(platformFetchConcurrency("bluesky", 4)).toBe(1);
    expect(platformFetchConcurrency("youtube", 4)).toBe(1);
    expect(platformFetchConcurrency("twitter_x", 4)).toBe(1);
    expect(platformFetchConcurrency("instagram", 4)).toBe(2);
  });

  it("keeps soft-fresh from bypassing warm cache", () => {
    const now = 1_000_000;
    expect(shouldBypassCacheForFresh(now - 1_000, now)).toBe(false);
    expect(
      shouldBypassCacheForFresh(now - SOFT_FRESH_MIN_AGE_MS - 1, now),
    ).toBe(true);
    expect(shouldBypassCacheForFresh(0, now)).toBe(true);
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
