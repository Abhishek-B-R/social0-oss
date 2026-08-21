import { describe, expect, it } from "vitest";
import {
  inboxGetNextPageParam,
  nextInboxPageParam,
} from "./inbox-page-param";

describe("nextInboxPageParam", () => {
  it("stops on empty pages even if API claims hasMore", () => {
    expect(
      nextInboxPageParam({
        hasMore: true,
        nextBefore: "2026-08-10T00:00:00.000Z",
        since: "2026-08-12T00:00:00.000Z",
        until: "2026-08-19T00:00:00.000Z",
        itemCount: 0,
      }),
    ).toBeUndefined();
  });

  it("stops when window is complete", () => {
    expect(
      nextInboxPageParam({
        hasMore: false,
        nextBefore: null,
        since: "2026-08-12T00:00:00.000Z",
        until: "2026-08-19T00:00:00.000Z",
        itemCount: 12,
      }),
    ).toBeUndefined();
  });
});

describe("inboxGetNextPageParam", () => {
  it("caps pages so sticky hasMore cannot run forever", () => {
    expect(
      inboxGetNextPageParam(
        {
          hasMore: true,
          nextBefore: "x",
          since: "a",
          until: "b",
          threads: { length: 3 },
        },
        [],
        undefined,
        Array(12).fill(null),
      ),
    ).toBeUndefined();
  });
});
