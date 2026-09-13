import { describe, expect, it } from "vitest";
import { livePlatformIds } from "../lib/live-platforms.js";

describe("live-platforms inboxComments", () => {
  it("excludes platforms with no public comments API", () => {
    const live = livePlatformIds("inboxComments");
    expect(live).not.toContain("tiktok");
    expect(live).not.toContain("pinterest");
  });

  it("enables Facebook and Threads after App Review, not Instagram", () => {
    const comments = livePlatformIds("inboxComments");
    const analytics = livePlatformIds("analytics");
    expect(comments).toContain("facebook");
    expect(comments).toContain("threads");
    expect(comments).not.toContain("instagram");
    expect(analytics).toContain("facebook");
    expect(analytics).toContain("threads");
    expect(analytics).not.toContain("instagram");
  });
});
