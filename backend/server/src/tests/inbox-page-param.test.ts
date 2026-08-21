import { describe, expect, it } from "vitest";
import {
  inboxGetNextPageParam,
  nextInboxPageParam,
} from "../lib/inbox/page-param.js";

describe("nextInboxPageParam", () => {
  it("pages with before when the current window still has more and items", () => {
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

  it("stops when the selected window is complete", () => {
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

  it("stops on empty pages even if API claims hasMore (budget / filter trap)", () => {
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
});

describe("inboxGetNextPageParam", () => {
  const page = (threads: number, hasMore = true) => ({
    hasMore,
    sampled: hasMore,
    nextBefore: hasMore ? "2026-08-10T00:00:00.000Z" : null,
    since: "2026-08-12T00:00:00.000Z",
    until: "2026-08-19T00:00:00.000Z",
    threads: { length: threads },
  });

  it("stops after the page cap even when hasMore", () => {
    expect(
      inboxGetNextPageParam(page(5), [], undefined, Array(12).fill(null)),
    ).toBeUndefined();
  });

  it("allows another page when under cap with items", () => {
    expect(
      inboxGetNextPageParam(page(5), [], undefined, Array(3).fill(null)),
    ).toEqual({
      range: "custom",
      since: "2026-08-12T00:00:00.000Z",
      until: "2026-08-19T00:00:00.000Z",
      before: "2026-08-10T00:00:00.000Z",
    });
  });
});
