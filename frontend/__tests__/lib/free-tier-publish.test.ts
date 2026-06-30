import { getPlanLimits } from "@/lib/plans";
import {
  freePublishBlockReason,
  getFreePostsRemaining,
  isFreePublishBlocked,
} from "@/lib/free-tier-publish";

describe("free-tier-publish", () => {
  const limit = getPlanLimits("free").maxFreePosts;

  it("uses the free plan post limit from plans config", () => {
    expect(limit).toBe(5);
  });

  it("blocks publish when free posts are exhausted", () => {
    expect(getFreePostsRemaining("free", limit - 1)).toBe(1);
    expect(getFreePostsRemaining("free", limit)).toBe(0);
    expect(isFreePublishBlocked("free", limit, "publish")).toBe(true);
    expect(isFreePublishBlocked("free", limit, "draft")).toBe(false);
    expect(isFreePublishBlocked("starter", limit, "publish")).toBe(false);
  });

  it("returns a limit-aware block reason", () => {
    expect(freePublishBlockReason("free", limit, "publish")).toBe(
      `You've used your ${limit} free posts. Subscribe to continue posting.`,
    );
  });
});
