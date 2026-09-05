import { describe, expect, it } from "vitest";
import { analyticsCoverage } from "../lib/analytics/coverage.js";
import { shouldCachePlatformRead } from "../lib/platform-api-cache.js";
import {
  pickTikTokVideoByPublishTime,
  TIKTOK_PUBLISH_MATCH_TOLERANCE_MS,
} from "../lib/tiktok-post-id.js";

describe("analytics coverage flags", () => {
  it("marks sampled only when the publication page was full", () => {
    expect(analyticsCoverage({ publicationCount: 12, limit: 12, partial: false }))
      .toEqual({ sampled: true, partial: false, sampleLimit: 12 });
    expect(analyticsCoverage({ publicationCount: 3, limit: 12, partial: false }).sampled)
      .toBe(false);
  });

  it("does not let a budget miss masquerade as a capped page", () => {
    // Cold cache: three posts, budget ran out. Warm retry of the same window
    // must only clear `partial`; `sampled` was never true.
    const cold = analyticsCoverage({ publicationCount: 3, limit: 12, partial: true });
    const warm = analyticsCoverage({ publicationCount: 3, limit: 12, partial: false });
    expect(cold).toEqual({ sampled: false, partial: true, sampleLimit: 12 });
    expect(warm).toEqual({ sampled: false, partial: false, sampleLimit: 12 });
  });

  it("keeps both flags when both apply", () => {
    expect(analyticsCoverage({ publicationCount: 12, limit: 12, partial: true }))
      .toEqual({ sampled: true, partial: true, sampleLimit: 12 });
  });
});

describe("platform read cache never stores a failed metrics read", () => {
  it("refuses error, scope_missing, and expired-token results", () => {
    expect(shouldCachePlatformRead({ metrics: {}, status: "error", error: "x" })).toBe(false);
    expect(
      shouldCachePlatformRead({ metrics: {}, status: "scope_missing", missingScopes: ["a"] }),
    ).toBe(false);
    expect(
      shouldCachePlatformRead({ metrics: {}, status: "ok", missingScopes: ["token_expired"] }),
    ).toBe(false);
  });

  it("stores a good read so a warm retry reproduces the same numbers", () => {
    expect(shouldCachePlatformRead({ metrics: { likes: 3 }, status: "ok" })).toBe(true);
  });
});

describe("TikTok publish-time backfill", () => {
  const publishedAt = new Date("2026-03-01T12:00:00.000Z");
  const sec = (d: Date, offsetMs = 0) => Math.floor((d.getTime() + offsetMs) / 1000);

  it("picks the video closest to the publish time inside the tolerance", () => {
    const id = pickTikTokVideoByPublishTime(
      [
        { id: "7000000000000000001", create_time: sec(publishedAt, -10 * 60_000) },
        { id: "7000000000000000002", create_time: sec(publishedAt, 40_000) },
        { id: "7000000000000000003", create_time: sec(publishedAt, 5 * 60_000) },
      ],
      publishedAt,
    );
    expect(id).toBe("7000000000000000002");
  });

  it("returns null when nothing is close enough", () => {
    expect(
      pickTikTokVideoByPublishTime(
        [{ id: "7000000000000000001", create_time: sec(publishedAt, -2 * 60 * 60_000) }],
        publishedAt,
      ),
    ).toBeNull();
    expect(
      pickTikTokVideoByPublishTime(
        [{ id: "7000000000000000001", create_time: sec(publishedAt, TIKTOK_PUBLISH_MATCH_TOLERANCE_MS + 1000) }],
        publishedAt,
      ),
    ).toBeNull();
  });

  it("ignores rows without a usable id or time", () => {
    expect(
      pickTikTokVideoByPublishTime(
        [
          { id: 1.5e18, create_time: sec(publishedAt) },
          { id: "7000000000000000009", create_time: "not-a-time" },
          { id: "7000000000000000010", create_time: String(sec(publishedAt, 1000)) },
        ],
        publishedAt,
      ),
    ).toBe("7000000000000000010");
  });
});
