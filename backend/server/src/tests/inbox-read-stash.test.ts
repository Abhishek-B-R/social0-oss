/**
 * The stash (last good copy served while a platform or our outbound budget
 * says "not now") must survive a day rollover and a new post.
 *
 * It used to sit next to the fresh key, and inbox fresh keys carry the date
 * window (`since` moves at local midnight) and, for X, a hash of the posts on
 * the page. After midnight or a new tweet every account read a key with no
 * cache and no stash, so a busy budget showed an empty list with a retry
 * notice instead of the saved comments.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentFetchResult } from "../lib/inbox/fetch-comments.js";

const { store, limiter } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  limiter: { allowed: true },
}));

// In-memory stand-in for Upstash: the stash only lives in Redis.
vi.mock("../lib/redis.js", () => ({
  redis: {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, typeof value === "string" ? value : JSON.stringify(value));
      return "OK";
    },
  },
}));
vi.mock("../lib/ratelimit.js", () => ({
  // Any non-null limiter: the mocked enforceRateLimit decides.
  slidingWindowLimiter: () => ({}),
  enforceRateLimit: async () => ({ allowed: limiter.allowed }),
}));

const { withPlatformReadCache, PlatformApiCooldownError } = await import(
  "../lib/platform-api-cache.js"
);
const {
  DM_LIST_STASH,
  X_COMMENT_BATCH_STASH,
  mergeDmListReads,
  mergeXCommentBatches,
  publicationCommentsStash,
} = await import("../lib/inbox/read-stash.js");

type Comments = CommentFetchResult;

beforeEach(() => {
  limiter.allowed = true;
});

describe("stable stash keys", () => {
  it("serves a publication's saved comments after the window moves", async () => {
    const accountId = "yt-stash-1";
    const saved = { comments: [{ id: "c1" }], status: "ok" } as unknown as Comments;
    await withPlatformReadCache({
      platform: "youtube",
      accountId,
      kind: "inbox_comments",
      suffix: "pub-1:2026-10-20T00:00:00.000Z",
      stash: publicationCommentsStash("pub-1"),
      fetch: async () => saved,
    });

    // Next day: new `since`, so a new fresh key, and the budget is busy.
    limiter.allowed = false;
    const fetch = vi.fn(async () => saved);
    const out = await withPlatformReadCache({
      platform: "youtube",
      accountId,
      kind: "inbox_comments",
      suffix: "pub-1:2026-10-21T00:00:00.000Z",
      stash: publicationCommentsStash("pub-1"),
      fetch,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(out.rateLimited).toBe(true);
    expect(out.data).toEqual(saved);
  });

  it("without a stable stash the moved key still has nothing to fall back on", async () => {
    const accountId = "yt-stash-legacy";
    await withPlatformReadCache({
      platform: "youtube",
      accountId,
      kind: "inbox_comments",
      suffix: "pub-1:2026-10-20T00:00:00.000Z",
      fetch: async () => ({ comments: [{ id: "c1" }], status: "ok" }),
    });
    limiter.allowed = false;
    await expect(
      withPlatformReadCache({
        platform: "youtube",
        accountId,
        kind: "inbox_comments",
        suffix: "pub-1:2026-10-21T00:00:00.000Z",
        fetch: async () => ({ comments: [], status: "ok" }),
      }),
    ).rejects.toBeInstanceOf(PlatformApiCooldownError);
  });

  it("folds X batches from different pages into one per-account stash", async () => {
    const accountId = "x-stash-1";
    const page1 = { "pub-a": { comments: [{ id: "a1" }], status: "ok" as const } };
    const page2 = { "pub-b": { comments: [{ id: "b1" }], status: "ok" as const } };
    for (const [suffix, data] of [
      ["batch:hash1:2026-10-13", page1],
      ["batch:hash2:2026-10-13", page2],
    ] as const) {
      await withPlatformReadCache({
        platform: "twitter_x",
        accountId,
        kind: "inbox_comments",
        suffix,
        stash: X_COMMENT_BATCH_STASH,
        fetch: async () => data as never,
      });
    }

    // A new tweet changes the page hash; the budget is spent.
    limiter.allowed = false;
    const out = await withPlatformReadCache({
      platform: "twitter_x",
      accountId,
      kind: "inbox_comments",
      suffix: "batch:hash3:2026-10-14",
      stash: X_COMMENT_BATCH_STASH,
      fetch: async () => ({}) as never,
    });

    expect(out.rateLimited).toBe(true);
    expect(Object.keys(out.data)).toEqual(["pub-a", "pub-b"]);
  });

  it("keeps DM list reads under one per-account stash", async () => {
    const accountId = "bsky-stash-1";
    const thread = (id: string, at: string) => ({
      conversationId: id,
      platform: "bluesky",
      accountId,
      accountLabel: null,
      peerId: id,
      peerName: `Peer ${id}`,
      peerHandle: id,
      lastMessageAt: at,
      snippet: "",
      canReply: true,
    });
    await withPlatformReadCache({
      platform: "bluesky",
      accountId,
      kind: "inbox_dms",
      suffix: "2026-10-14:live:2026-10-20",
      stash: DM_LIST_STASH,
      fetch: async () => ({
        threads: [thread("t1", "2026-10-20T10:00:00.000Z")],
        status: "ok" as const,
      }),
    });

    limiter.allowed = false;
    const out = await withPlatformReadCache({
      platform: "bluesky",
      accountId,
      kind: "inbox_dms",
      suffix: "2026-10-15:live:2026-10-21",
      stash: DM_LIST_STASH,
      fetch: async () => ({ threads: [], status: "ok" as const }),
    });
    expect(out.rateLimited).toBe(true);
    expect(out.data.threads.map((t) => t.conversationId)).toEqual(["t1"]);
  });
});

describe("stash merges", () => {
  it("X batches: newest read wins per publication and the oldest drop past the cap", () => {
    const r = (id: string) => ({ comments: [{ id }] as never[], status: "ok" as const });
    const merged = mergeXCommentBatches(
      { a: r("old-a"), b: r("b") },
      { a: r("new-a"), c: r("c") },
      2,
    );
    expect(merged).toEqual({ a: r("new-a"), c: r("c") });
  });

  it("DM lists: union by conversation, latest activity first", () => {
    const t = (id: string, at: string) =>
      ({ conversationId: id, lastMessageAt: at }) as never;
    const merged = mergeDmListReads(
      { threads: [t("x", "2026-10-01"), t("y", "2026-10-05")], status: "ok" },
      { threads: [t("x", "2026-10-09"), t("z", "2026-10-03")], status: "ok" },
    );
    expect(
      merged.threads.map((th: { conversationId: string; lastMessageAt: string | null }) => [
        th.conversationId,
        th.lastMessageAt,
      ]),
    ).toEqual([
      ["x", "2026-10-09"],
      ["y", "2026-10-05"],
      ["z", "2026-10-03"],
    ]);
  });
});
