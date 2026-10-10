import { describe, expect, it } from "vitest";
import type { InboxDmMessage, InboxDmThread } from "@/api/inbox";
import {
  DM_GROUP_GAP_MS,
  dmDayLabel,
  dmListTimeLabel,
  filterDmThreads,
  flattenDmPages,
  InboxDmThreadLoadError,
  isDmThreadRateLimited,
  layoutDmMessages,
} from "./dm-thread-layout";

function msg(id: string, createdAt: string | null, isOwn: boolean): InboxDmMessage {
  return {
    id,
    text: id,
    createdAt,
    isOwn,
    authorName: isOwn ? "You" : "Ada",
    authorHandle: isOwn ? null : "ada",
  };
}

function thread(partial: Partial<InboxDmThread>): InboxDmThread {
  return {
    conversationId: "c",
    platform: "twitter_x",
    accountId: "a",
    accountLabel: "me",
    peerId: "p",
    peerName: "Peer",
    peerHandle: null,
    lastMessageAt: null,
    snippet: "",
    canReply: true,
    ...partial,
  };
}

describe("layoutDmMessages", () => {
  const now = new Date("2026-10-05T15:00:00");

  it("groups consecutive messages from one side and splits on sender change", () => {
    const items = layoutDmMessages(
      [
        msg("1", "2026-10-05T10:00:00", false),
        msg("2", "2026-10-05T10:01:00", false),
        msg("3", "2026-10-05T10:02:00", true),
        msg("4", "2026-10-05T10:03:00", false),
      ],
      now,
    );
    expect(items.map((i) => i.kind)).toEqual(["day", "group", "group", "group"]);
    const groups = items.filter((i) => i.kind === "group");
    expect(groups.map((g) => g.messages.map((m) => m.id))).toEqual([
      ["1", "2"],
      ["3"],
      ["4"],
    ]);
  });

  it("starts a new group after a long pause from the same sender", () => {
    const start = Date.parse("2026-10-05T10:00:00");
    const items = layoutDmMessages(
      [
        msg("1", new Date(start).toISOString(), true),
        msg("2", new Date(start + DM_GROUP_GAP_MS + 1_000).toISOString(), true),
      ],
      now,
    );
    expect(items.filter((i) => i.kind === "group")).toHaveLength(2);
  });

  it("inserts a separator per calendar day", () => {
    const items = layoutDmMessages(
      [
        msg("1", "2026-10-04T23:58:00", false),
        msg("2", "2026-10-05T00:01:00", false),
      ],
      now,
    );
    const days = items.filter((i) => i.kind === "day");
    expect(days.map((d) => d.label)).toEqual(["Yesterday", "Today"]);
  });

  it("keeps undated messages without inventing a day", () => {
    const items = layoutDmMessages([msg("1", null, true), msg("2", null, true)], now);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("group");
  });
});

describe("flattenDmPages", () => {
  it("orders newest-first pages chronologically and drops boundary duplicates", () => {
    const newest = {
      messages: [msg("3", "2026-10-05T10:03:00", true), msg("4", "2026-10-05T10:04:00", false)],
    };
    const older = {
      messages: [msg("1", "2026-10-05T10:01:00", false), msg("3", "2026-10-05T10:03:00", true)],
    };
    expect(flattenDmPages([newest, older]).map((m) => m.id)).toEqual(["1", "3", "4"]);
    expect(flattenDmPages(undefined)).toEqual([]);
  });
});

describe("labels", () => {
  const now = new Date("2026-10-05T15:00:00");

  it("formats day separators relative to now", () => {
    expect(dmDayLabel(new Date("2026-10-05T01:00:00"), now)).toBe("Today");
    expect(dmDayLabel(new Date("2026-10-04T23:00:00"), now)).toBe("Yesterday");
    expect(dmDayLabel(new Date("2026-10-01T12:00:00"), now)).toBe("Thursday");
    expect(dmDayLabel(new Date("2026-08-01T12:00:00"), now)).toBe("Sat, Aug 1");
    expect(dmDayLabel(new Date("2025-08-01T12:00:00"), now)).toBe("Aug 1, 2025");
  });

  it("formats compact list times", () => {
    expect(dmListTimeLabel("2026-10-05T14:59:30", now)).toBe("now");
    expect(dmListTimeLabel("2026-10-05T14:15:00", now)).toBe("45m");
    expect(dmListTimeLabel("2026-10-05T09:00:00", now)).toBe("6h");
    expect(dmListTimeLabel("2026-10-02T09:00:00", now)).toBe("Fri");
    expect(dmListTimeLabel("2026-07-02T09:00:00", now)).toBe("Jul 2");
    expect(dmListTimeLabel(null, now)).toBe("");
    expect(dmListTimeLabel("not a date", now)).toBe("");
  });
});

describe("filterDmThreads", () => {
  const threads = [
    thread({ conversationId: "1", peerName: "Ada Lovelace", peerHandle: "ada" }),
    thread({ conversationId: "2", peerName: "Grace", snippet: "Compiler question" }),
  ];

  it("matches name, handle and snippet case-insensitively", () => {
    expect(filterDmThreads(threads, "ADA").map((t) => t.conversationId)).toEqual(["1"]);
    expect(filterDmThreads(threads, "compiler").map((t) => t.conversationId)).toEqual(["2"]);
    expect(filterDmThreads(threads, "  ")).toBe(threads);
    expect(filterDmThreads(threads, "zzz")).toEqual([]);
  });
});

describe("InboxDmThreadLoadError", () => {
  it("distinguishes throttling from other failures", () => {
    const limited = new InboxDmThreadLoadError({
      error: "X is limiting requests right now. Try again in about 30s.",
      code: "rate_limited",
      retryAfterSec: 30,
    });
    expect(isDmThreadRateLimited(limited)).toBe(true);
    expect(limited.retryAfterSec).toBe(30);
    expect(
      isDmThreadRateLimited(
        new InboxDmThreadLoadError({ error: "boom", code: "fetch_failed" }),
      ),
    ).toBe(false);
    expect(isDmThreadRateLimited(new Error("rate limited"))).toBe(false);
  });
});
