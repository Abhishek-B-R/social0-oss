import { describe, expect, it } from "vitest";
import {
  engagementTotal,
  missingAnalyticsScopes,
  scopeGranted,
  sumMetrics,
} from "../lib/analytics/types.js";

describe("analytics types", () => {
  it("parses granted scopes", () => {
    expect(scopeGranted("a,b,c", "b")).toBe(true);
    expect(scopeGranted("video.list user.info.stats", "video.list")).toBe(true);
    expect(scopeGranted("video.upload", "video.list")).toBe(false);
  });

  it("flags missing insights scopes", () => {
    expect(
      missingAnalyticsScopes("instagram", "instagram_business_basic"),
    ).toContain("instagram_business_manage_insights");
    expect(missingAnalyticsScopes("twitter_x", "whatever")).toEqual([]);
    expect(missingAnalyticsScopes("instagram", null)).toContain(
      "instagram_business_manage_insights",
    );
    expect(missingAnalyticsScopes("tiktok", "")).toContain("video.list");
    expect(missingAnalyticsScopes("youtube", null)).toEqual([]);
  });

  it("sums metrics and engagement", () => {
    const sums = sumMetrics([{ likes: 2, views: 10 }, { likes: 3, comments: 1 }]);
    expect(sums.likes).toBe(5);
    expect(sums.views).toBe(10);
    expect(sums.comments).toBe(1);
    expect(engagementTotal({ likes: 1, comments: 2, shares: 3 })).toBe(6);
  });
});
