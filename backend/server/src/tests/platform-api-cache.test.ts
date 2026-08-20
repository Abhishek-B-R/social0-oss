import { describe, expect, it } from "vitest";
import {
  platformCommentPageRounds,
  platformInboxSampleLimit,
  isPlatformRateLimitError,
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
});
