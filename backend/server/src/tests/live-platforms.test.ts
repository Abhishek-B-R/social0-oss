import { describe, expect, it } from "vitest";
import { livePlatformIds } from "../lib/live-platforms.js";

describe("live-platforms inboxComments", () => {
  it("excludes platforms with no public comments API", () => {
    const live = livePlatformIds("inboxComments");
    expect(live).not.toContain("tiktok");
    expect(live).not.toContain("pinterest");
  });
});
