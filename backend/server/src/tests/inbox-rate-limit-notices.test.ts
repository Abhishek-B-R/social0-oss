import { describe, expect, it } from "vitest";
import {
  noteFetchNotice,
  retryNotice,
  staleNotice,
} from "../lib/inbox/fetch-errors.js";
import { PlatformApiCooldownError } from "../lib/platform-api-cache.js";
import type { InboxNotice } from "../lib/inbox/types.js";

describe("rate-limit inbox notices", () => {
  it("marks saved data as stale with the time it was fetched", () => {
    const n = staleNotice("twitter_x", "comments", Date.UTC(2026, 9, 20, 6, 0));
    expect(n.kind).toBe("stale");
    expect(n.cachedAt).toBe("2026-10-20T06:00:00.000Z");
    expect(n.message).not.toMatch(/refresh/i);
  });

  it("retry notices carry retryAt and never ask the user to refresh", () => {
    const n = retryNotice("twitter_x", "DMs", Date.UTC(2026, 9, 20, 6, 5));
    expect(n.kind).toBe("retry");
    expect(n.retryAt).toBe("2026-10-20T06:05:00.000Z");
    expect(n.message).not.toMatch(/refresh/i);
  });

  it("collapses one notice per network, keeping oldest saved time and latest retry", () => {
    const list: InboxNotice[] = [];
    noteFetchNotice(list, staleNotice("twitter_x", "comments", Date.UTC(2026, 9, 20, 6, 10)));
    noteFetchNotice(list, staleNotice("twitter_x", "comments", Date.UTC(2026, 9, 20, 5, 50)));
    expect(list).toHaveLength(1);
    expect(list[0]!.cachedAt).toBe("2026-10-20T05:50:00.000Z");

    noteFetchNotice(list, retryNotice("bluesky", "comments", Date.UTC(2026, 9, 20, 6, 1)));
    noteFetchNotice(list, retryNotice("bluesky", "comments", Date.UTC(2026, 9, 20, 6, 3)));
    expect(list).toHaveLength(2);
    expect(list[1]!.retryAt).toBe("2026-10-20T06:03:00.000Z");
  });

  it("cooldown errors say whether the network or our own budget refused", () => {
    expect(new PlatformApiCooldownError("twitter_x", 0).reason).toBe("platform_429");
    expect(new PlatformApiCooldownError("twitter_x", 0, "local_budget").reason).toBe("local_budget");
  });
});
