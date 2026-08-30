import { describe, expect, it } from "vitest";
import { LIVE_PLATFORMS } from "../lib/live-platforms.js";
import { INBOX_UNSUPPORTED } from "../lib/inbox/types.js";

describe("live-platforms inboxComments", () => {
  it("does not mark unsupported inbox comment platforms as live", () => {
    for (const platform of INBOX_UNSUPPORTED) {
      expect(LIVE_PLATFORMS.inboxComments[platform as keyof typeof LIVE_PLATFORMS.inboxComments]).not.toBe(
        true,
      );
    }
  });
});
