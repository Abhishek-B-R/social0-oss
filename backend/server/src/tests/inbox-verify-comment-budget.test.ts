/**
 * Reply / like / hide verification must not fail with a raw "rate limited"
 * error right after the inbox loads: it spends its own per-account budget,
 * turns a cooldown into a clear "try again" message, and does not spend a
 * second platform call after a live read already missed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const withPlatformReadCache = vi.fn();

vi.mock("../lib/platform-api-cache.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/platform-api-cache.js")>();
  return {
    ...actual,
    withPlatformReadCache: (opts: unknown) => withPlatformReadCache(opts),
  };
});

const { verifyCommentOnPublication, verifyRateLimitedMessage } = await import(
  "../lib/inbox/verify-comment.js"
);
const { PlatformApiCooldownError } = await import("../lib/platform-api-cache.js");

const input = {
  platform: "youtube",
  platformPostId: "video",
  platformPostUrl: null,
  platformUserId: "chan",
  accessToken: "token",
  accountId: "acc",
  accountLabel: "creator",
  postId: "post",
  publicationId: "pub",
  postSnippet: "hi",
  postContent: "hi",
};

function comment(id: string) {
  return {
    id,
    platform: "youtube",
    accountId: "acc",
    accountLabel: "creator",
    postId: "post",
    publicationId: "pub",
    platformPostId: "video",
    platformPostUrl: null,
    postSnippet: "hi",
    postContent: "hi",
    authorName: "User",
    authorHandle: "user",
    text: "hello",
    createdAt: null,
    parentId: null,
    canReply: true,
  };
}

beforeEach(() => {
  withPlatformReadCache.mockReset();
});

describe("verifyCommentOnPublication budget", () => {
  it("spends the verify budget, not the inbox list budget", async () => {
    withPlatformReadCache.mockResolvedValue({
      data: { comments: [comment("c1")], status: "ok" },
      fromCache: false,
    });
    await expect(verifyCommentOnPublication(input, "c1")).resolves.toEqual({ ok: true });
    expect(withPlatformReadCache).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "verify", kind: "inbox_comments" }),
    );
  });

  it("turns a cooldown into a 'try again' message instead of throwing", async () => {
    withPlatformReadCache.mockRejectedValue(
      new PlatformApiCooldownError("youtube", Date.now() + 60_000, "local_budget"),
    );
    const result = await verifyCommentOnPublication(input, "c1");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/try again/i);
    expect(!result.ok && result.error).not.toMatch(/Platform youtube is rate limited/);
  });

  it("does not spend a second platform call after a live read missed", async () => {
    withPlatformReadCache.mockResolvedValue({
      data: { comments: [comment("other")], status: "ok" },
      fromCache: false,
    });
    const result = await verifyCommentOnPublication(input, "c1");
    expect(result).toEqual({
      ok: false,
      error: "Comment does not belong to this publication.",
    });
    expect(withPlatformReadCache).toHaveBeenCalledTimes(1);
  });

  it("re-reads fresh when the first answer came from cache", async () => {
    withPlatformReadCache
      .mockResolvedValueOnce({
        data: { comments: [comment("other")], status: "ok" },
        fromCache: true,
        cachedAt: Date.now() - 30_000,
      })
      .mockResolvedValueOnce({
        data: { comments: [comment("c1")], status: "ok" },
        fromCache: false,
      });
    await expect(verifyCommentOnPublication(input, "c1")).resolves.toEqual({ ok: true });
    expect(withPlatformReadCache).toHaveBeenLastCalledWith(
      expect.objectContaining({ fresh: true, softFreshMinAgeMs: 0 }),
    );
  });

  it("a stale copy served under a rate limit does not reject the comment", async () => {
    withPlatformReadCache.mockResolvedValue({
      data: { comments: [comment("other")], status: "ok" },
      fromCache: true,
      rateLimited: true,
    });
    const result = await verifyCommentOnPublication(input, "c1");
    expect(!result.ok && result.error).toMatch(/try again/i);
    expect(withPlatformReadCache).toHaveBeenCalledTimes(1);
  });

  it("says minutes when the cooldown is long", () => {
    const now = 1_000_000;
    expect(verifyRateLimitedMessage(now + 5 * 60_000, now)).toMatch(/about 5 minutes/);
    expect(verifyRateLimitedMessage(now + 30_000, now)).toMatch(/a minute/);
  });
});
