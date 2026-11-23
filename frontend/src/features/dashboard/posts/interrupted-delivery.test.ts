import { describe, expect, it } from "vitest";
import { deliveryProblem } from "./posts-model";
import { errorKindCopy } from "../home/home-format";

/**
 * A delivery interrupted mid-send may already be live. It used to fall into
 * the generic "didn't accept the post this time, retry in a moment" copy,
 * which invites the blind retry that posts it twice.
 */
describe("interrupted deliveries", () => {
  it("says the network may already have the post instead of 'retry in a moment'", () => {
    const problem = deliveryProblem({
      platform: "bluesky",
      lastError: "Publishing was interrupted before the platform confirmed.",
      errorKind: "interrupted",
    });
    expect(problem.headline).toBe("Bluesky may already have this post.");
    expect(problem.hint).toMatch(/Check Bluesky, and retry only if the post isn't there/);
    expect(problem.hint).not.toMatch(/temporary/i);
  });

  it("explains it on Home too", () => {
    expect(errorKindCopy("interrupted")).toMatch(/may already be live/);
  });
});
