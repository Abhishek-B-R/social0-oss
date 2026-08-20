import { describe, expect, it } from "vitest";
import { nextInboxPageParam } from "../lib/inbox/page-param.js";

describe("nextInboxPageParam", () => {
  it("pages with before when the current window still has more", () => {
    expect(
      nextInboxPageParam({
        hasMore: true,
        nextBefore: "2026-08-10T00:00:00.000Z",
        since: "2026-08-12T00:00:00.000Z",
        until: "2026-08-18T00:00:00.000Z",
        itemCount: 40,
      }),
    ).toEqual({
      range: "custom",
      since: "2026-08-12T00:00:00.000Z",
      until: "2026-08-18T00:00:00.000Z",
      before: "2026-08-10T00:00:00.000Z",
    });
  });

  it("walks an older equal-length window when the page is complete", () => {
    const next = nextInboxPageParam({
      hasMore: false,
      nextBefore: null,
      since: "2026-08-12T00:00:00.000Z",
      until: "2026-08-19T00:00:00.000Z",
      itemCount: 12,
    });
    expect(next?.range).toBe("custom");
    expect(next?.until).toBe("2026-08-12T00:00:00.000Z");
    expect(next?.since).toBe("2026-08-05T00:00:00.000Z");
    expect(next?.before).toBeUndefined();
  });

  it("stops when the last page was empty", () => {
    expect(
      nextInboxPageParam({
        hasMore: false,
        since: "2026-08-05T00:00:00.000Z",
        until: "2026-08-12T00:00:00.000Z",
        itemCount: 0,
      }),
    ).toBeUndefined();
  });
});
