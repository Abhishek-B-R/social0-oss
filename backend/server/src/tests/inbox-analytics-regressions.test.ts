/**
 * Regressions for the live analytics / inbox layer.
 * Each case here is a bug that shipped: keep them red-if-reverted.
 */

import { describe, expect, it } from "vitest";
import { mapPool } from "../lib/map-pool.js";
import {
  dmListCacheSuffix,
  olderThanDmCursor,
} from "../lib/inbox/page-param.js";
import { toInboxThreads, type InboxComment } from "../lib/inbox/types.js";
import { addZonedCalendarDays, calendarDayKey } from "../lib/date-window.js";

function comment(
  partial: Partial<InboxComment> & Pick<InboxComment, "id">,
): InboxComment {
  return {
    platform: "bluesky",
    accountId: "acc",
    accountLabel: "me",
    postId: "post",
    publicationId: "pub",
    platformPostId: "at://post",
    platformPostUrl: null,
    postSnippet: "hello",
    postContent: "hello",
    authorName: "Ada",
    authorHandle: "ada",
    text: "hi",
    createdAt: "2026-01-02T00:00:00.000Z",
    parentId: null,
    canReply: true,
    ...partial,
  };
}

describe("mapPool concurrency guard", () => {
  it("still runs every item when concurrency is 0", async () => {
    const results = await mapPool([1, 2, 3], 0, async (n) => n * 2);
    expect(results).toEqual([2, 4, 6]);
  });

  it("still runs every item when concurrency is NaN", async () => {
    const results = await mapPool([1, 2], Number.NaN, async (n) => n + 1);
    expect(results).toEqual([2, 3]);
  });
});

describe("DM pagination cursor", () => {
  const threads = [
    { conversationId: "a", lastMessageAt: "2026-03-03T00:00:00.000Z" },
    { conversationId: "b", lastMessageAt: "2026-03-02T00:00:00.000Z" },
    { conversationId: "c", lastMessageAt: "2026-03-01T00:00:00.000Z" },
  ];

  it("returns everything without a cursor", () => {
    expect(olderThanDmCursor(threads, undefined)).toHaveLength(3);
  });

  it("excludes the cursor row so pages never repeat their tail", () => {
    const page1 = olderThanDmCursor(threads, undefined).slice(0, 2);
    const cursor = Date.parse(page1[1]!.lastMessageAt);
    const page2 = olderThanDmCursor(threads, cursor);
    expect(page2.map((t) => t.conversationId)).toEqual(["c"]);
  });

  it("drops rows with no usable timestamp", () => {
    const withNull = [...threads, { conversationId: "d", lastMessageAt: null }];
    const out = olderThanDmCursor(withNull, Date.parse("2026-03-03T00:00:00.000Z"));
    expect(out.map((t) => t.conversationId)).toEqual(["b", "c"]);
  });
});

describe("thread nesting is cycle-safe", () => {
  it("keeps cyclic comments visible as top-level threads", () => {
    const a = comment({ id: "a", parentId: "b" });
    const b = comment({ id: "b", parentId: "a" });
    const threads = toInboxThreads([a, b]);
    const shown = new Set(
      threads.flatMap((t) => [t.comment.id, ...t.replies.map((r) => r.id)]),
    );
    expect(shown).toEqual(new Set(["a", "b"]));
  });

  it("still nests a normal reply under its root", () => {
    const root = comment({ id: "root" });
    const reply = comment({ id: "reply", parentId: "root" });
    const threads = toInboxThreads([root, reply]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.replies.map((r) => r.id)).toEqual(["reply"]);
  });
});

describe("analytics series day stepping", () => {
  it("advances one calendar day across a DST spring-forward", () => {
    // 2026-03-08 is the US spring-forward date; a 24h step in server-local
    // time would land back on the same calendar day in America/New_York.
    const tz = "America/New_York";
    const start = new Date("2026-03-08T05:00:00.000Z");
    const next = addZonedCalendarDays(start, 1, tz);
    expect(calendarDayKey(start, tz)).toBe("2026-03-08");
    expect(calendarDayKey(next, tz)).toBe("2026-03-09");
  });

  it("produces one key per day with no repeats over a DST week", () => {
    const tz = "America/New_York";
    let cursor = new Date("2026-03-05T05:00:00.000Z");
    const keys: string[] = [];
    for (let i = 0; i < 7; i++) {
      keys.push(calendarDayKey(cursor, tz));
      cursor = addZonedCalendarDays(cursor, 1, tz);
    }
    expect(new Set(keys).size).toBe(7);
    expect(keys[0]).toBe("2026-03-05");
    expect(keys[6]).toBe("2026-03-11");
  });
});

describe("DM list cache key", () => {
  const since = new Date("2026-03-01T05:00:00.000Z");
  const tz = "America/New_York";

  it("is stable while the live head clock moves", () => {
    const a = dmListCacheSuffix({
      since,
      untilForFetch: new Date("2026-03-04T14:00:00.000Z"),
      hasCursor: false,
      timeZone: tz,
    });
    const b = dmListCacheSuffix({
      since,
      untilForFetch: new Date("2026-03-04T14:00:37.512Z"),
      hasCursor: false,
      timeZone: tz,
    });
    expect(a).toBe(b);
  });

  it("separates the live head from a cursor page", () => {
    const until = new Date("2026-03-04T14:00:00.000Z");
    expect(
      dmListCacheSuffix({ since, untilForFetch: until, hasCursor: false, timeZone: tz }),
    ).not.toBe(
      dmListCacheSuffix({ since, untilForFetch: until, hasCursor: true, timeZone: tz }),
    );
  });

  it("keeps distinct cursor pages distinct", () => {
    const a = dmListCacheSuffix({
      since,
      untilForFetch: new Date("2026-03-04T14:00:00.000Z"),
      hasCursor: true,
      timeZone: tz,
    });
    const b = dmListCacheSuffix({
      since,
      untilForFetch: new Date("2026-03-03T14:00:00.000Z"),
      hasCursor: true,
      timeZone: tz,
    });
    expect(a).not.toBe(b);
  });

  it("separates windows with a different start", () => {
    const until = new Date("2026-03-04T14:00:00.000Z");
    expect(
      dmListCacheSuffix({ since, untilForFetch: until, hasCursor: false, timeZone: tz }),
    ).not.toBe(
      dmListCacheSuffix({
        since: new Date("2026-02-01T05:00:00.000Z"),
        untilForFetch: until,
        hasCursor: false,
        timeZone: tz,
      }),
    );
  });
});
