/**
 * Inbox mutation cores (reply / like / hide / DM reply).
 *
 * Reads were covered; these pin the write path: a comment that is not on the
 * named publication is rejected before anything is sent, media must belong
 * to the caller, and the happy path forwards the verified ids to the
 * platform adapter exactly once.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockResolveAccountAccess,
  mockVerifyComment,
  mockVerifyDm,
  mockReplyOnPlatform,
  mockLikeOnPlatform,
  mockHideOnPlatform,
  mockReplyDmOnPlatform,
  mockResolveInboxMedia,
} = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockResolveAccountAccess: vi.fn(),
  mockVerifyComment: vi.fn(),
  mockVerifyDm: vi.fn(),
  mockReplyOnPlatform: vi.fn(),
  mockLikeOnPlatform: vi.fn(),
  mockHideOnPlatform: vi.fn(),
  mockReplyDmOnPlatform: vi.fn(),
  mockResolveInboxMedia: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/workspace/session.js", () => ({
  requireWorkspaceSession: vi.fn(),
}));
vi.mock("../lib/account-access.js", () => ({
  resolveAccountAccess: mockResolveAccountAccess,
}));
vi.mock("../lib/inbox/verify-comment.js", () => ({
  verifyCommentOnPublication: mockVerifyComment,
}));
vi.mock("../lib/inbox/verify-dm.js", () => ({
  verifyDmConversationOnAccount: mockVerifyDm,
}));
vi.mock("../lib/inbox/reply-comment.js", () => ({
  replyOnPlatform: mockReplyOnPlatform,
}));
vi.mock("../lib/inbox/like-comment.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/inbox/like-comment.js")>()),
  likeCommentOnPlatform: mockLikeOnPlatform,
}));
vi.mock("../lib/inbox/hide-comment.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/inbox/hide-comment.js")>()),
  hideCommentOnPlatform: mockHideOnPlatform,
}));
vi.mock("../lib/inbox/reply-dm.js", () => ({
  replyToDmOnPlatform: mockReplyDmOnPlatform,
}));
vi.mock("../lib/inbox/resolve-media.js", () => ({
  resolveInboxMedia: mockResolveInboxMedia,
}));

const {
  hideInboxCommentForScope,
  likeInboxCommentForScope,
  replyToInboxCommentForScope,
  replyToInboxDmForScope,
} = await import("../services/inbox.js");

/** Drizzle-style builder: every method chains, awaiting yields `rows`. */
function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(rows);
      }
      return () => self;
    },
  });
  return self;
}

const ctx = { resourceUserId: "user-1", workspaceId: null };
const PUB = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function publicationRow(platform = "bluesky") {
  return {
    publicationId: PUB,
    platformPostId: "at://did:plc:me/app.bsky.feed.post/abc",
    platformPostUrl: null,
    postId: "post-1",
    content: "hello world",
    publishedAt: new Date("2026-03-01T00:00:00Z"),
    accountId: "acc-1",
    platform,
    platformUserId: "did:plc:me",
    platformUsername: "me.bsky.social",
    encryptedAccessToken: "enc",
    encryptedRefreshToken: null,
  };
}

function dmAccountRow(platform = "bluesky") {
  return {
    id: "acc-1",
    platform,
    platformUserId: "did:plc:me",
    platformUsername: "me.bsky.social",
    profileImageUrl: null,
    scopes: null,
    platformMetadata: null,
    encryptedAccessToken: "enc",
    encryptedRefreshToken: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveAccountAccess.mockResolvedValue({
    accessToken: "token",
    accessSecret: "secret",
  });
});

describe("replyToInboxComment", () => {
  it("validates input before touching the database", async () => {
    expect(await replyToInboxCommentForScope(ctx, {})).toEqual({
      ok: false,
      error: "publicationId required",
    });
    expect(
      await replyToInboxCommentForScope(ctx, { publicationId: PUB, commentId: "c1" }),
    ).toEqual({ ok: false, error: "text or mediaId required" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("rejects a publication outside the caller's scope", async () => {
    mockDb.select.mockReturnValue(selectChain([]));
    const out = await replyToInboxCommentForScope(ctx, {
      publicationId: PUB,
      commentId: "c1",
      text: "hi",
    });
    expect(out).toEqual({ ok: false, error: "Publication not found." });
    expect(mockReplyOnPlatform).not.toHaveBeenCalled();
  });

  it("refuses to send when the comment is not on that publication", async () => {
    mockDb.select.mockReturnValue(selectChain([publicationRow()]));
    mockVerifyComment.mockResolvedValue({
      ok: false,
      error: "Comment is not on this publication.",
    });
    const out = await replyToInboxCommentForScope(ctx, {
      publicationId: PUB,
      commentId: "c-from-another-post",
      text: "hi",
    });
    expect(out).toEqual({ ok: false, error: "Comment is not on this publication." });
    expect(mockVerifyComment).toHaveBeenCalledWith(
      expect.objectContaining({ publicationId: PUB, accountId: "acc-1" }),
      "c-from-another-post",
    );
    expect(mockReplyOnPlatform).not.toHaveBeenCalled();
  });

  it("forwards a verified reply to the platform adapter once", async () => {
    mockDb.select.mockReturnValue(selectChain([publicationRow()]));
    mockVerifyComment.mockResolvedValue({ ok: true });
    mockReplyOnPlatform.mockResolvedValue({ ok: true, replyId: "r-1" });
    const out = await replyToInboxCommentForScope(ctx, {
      publicationId: PUB,
      commentId: "c1",
      text: "thanks!",
    });
    expect(out).toEqual({ ok: true, replyId: "r-1" });
    expect(mockReplyOnPlatform).toHaveBeenCalledTimes(1);
    expect(mockReplyOnPlatform).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "bluesky",
        commentId: "c1",
        text: "thanks!",
        accessToken: "token",
        accessSecret: "secret",
        accountId: "acc-1",
        mediaUrl: null,
      }),
    );
  });

  it("only attaches media the caller owns", async () => {
    mockDb.select.mockReturnValue(selectChain([publicationRow()]));
    mockVerifyComment.mockResolvedValue({ ok: true });
    mockResolveInboxMedia.mockResolvedValue({ error: "Media not found or not ready" });
    const out = await replyToInboxCommentForScope(ctx, {
      publicationId: PUB,
      commentId: "c1",
      text: "look",
      mediaId: "someone-elses-media",
    });
    expect(out).toEqual({ ok: false, error: "Media not found or not ready" });
    expect(mockResolveInboxMedia).toHaveBeenCalledWith("user-1", "someone-elses-media");
    expect(mockReplyOnPlatform).not.toHaveBeenCalled();
  });

  it("turns an adapter exception into a result, never a throw", async () => {
    mockDb.select.mockReturnValue(selectChain([publicationRow()]));
    mockVerifyComment.mockResolvedValue({ ok: true });
    mockReplyOnPlatform.mockRejectedValue(new Error("Request failed with code 500"));
    const out = await replyToInboxCommentForScope(ctx, {
      publicationId: PUB,
      commentId: "c1",
      text: "hi",
    });
    expect(out).toEqual({ ok: false, error: "Request failed with code 500" });
  });
});

describe("likeInboxComment", () => {
  it("rejects platforms without a like API before verifying", async () => {
    mockDb.select.mockReturnValue(selectChain([publicationRow("pinterest")]));
    const out = await likeInboxCommentForScope(ctx, {
      publicationId: PUB,
      commentId: "c1",
    });
    expect(out.ok).toBe(false);
    expect(mockVerifyComment).not.toHaveBeenCalled();
    expect(mockLikeOnPlatform).not.toHaveBeenCalled();
  });

  it("refuses a mismatched comment id", async () => {
    mockDb.select.mockReturnValue(selectChain([publicationRow()]));
    mockVerifyComment.mockResolvedValue({ ok: false, error: "Comment is not on this publication." });
    const out = await likeInboxCommentForScope(ctx, { publicationId: PUB, commentId: "zzz" });
    expect(out).toEqual({ ok: false, error: "Comment is not on this publication." });
    expect(mockLikeOnPlatform).not.toHaveBeenCalled();
  });

  it("passes unlike through to the adapter", async () => {
    mockDb.select.mockReturnValue(selectChain([publicationRow()]));
    mockVerifyComment.mockResolvedValue({ ok: true });
    mockLikeOnPlatform.mockResolvedValue({ ok: true });
    const out = await likeInboxCommentForScope(ctx, {
      publicationId: PUB,
      commentId: "c1",
      unlike: true,
    });
    expect(out).toEqual({ ok: true });
    expect(mockLikeOnPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: "c1", unlike: true, platform: "bluesky" }),
    );
  });
});

describe("hideInboxComment", () => {
  it("is Meta-only and says so without a platform call", async () => {
    mockDb.select.mockReturnValue(selectChain([publicationRow("bluesky")]));
    const out = await hideInboxCommentForScope(ctx, { publicationId: PUB, commentId: "c1" });
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toMatch(/not supported/i);
    expect(mockHideOnPlatform).not.toHaveBeenCalled();
  });

  it("hides a verified comment", async () => {
    mockDb.select.mockReturnValue(selectChain([publicationRow("instagram")]));
    mockVerifyComment.mockResolvedValue({ ok: true });
    mockHideOnPlatform.mockResolvedValue({ ok: true });
    const out = await hideInboxCommentForScope(ctx, { publicationId: PUB, commentId: "c1" });
    expect(out).toEqual({ ok: true });
    expect(mockHideOnPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "instagram", commentId: "c1", accessToken: "token" }),
    );
  });
});

describe("replyToInboxDm", () => {
  it("requires an account the caller owns", async () => {
    mockDb.select.mockReturnValue(selectChain([]));
    const out = await replyToInboxDmForScope(ctx, {
      accountId: "acc-1",
      conversationId: "conv-1",
      text: "hi",
    });
    expect(out).toEqual({ ok: false, error: "Account not found." });
    expect(mockReplyDmOnPlatform).not.toHaveBeenCalled();
  });

  it("refuses a conversation that is not in that account's inbox", async () => {
    mockDb.select.mockReturnValue(selectChain([dmAccountRow()]));
    mockVerifyDm.mockResolvedValue({
      ok: false,
      error: "Conversation is not in this account's inbox.",
    });
    const out = await replyToInboxDmForScope(ctx, {
      accountId: "acc-1",
      conversationId: "not-mine",
      text: "hi",
    });
    expect(out).toEqual({ ok: false, error: "Conversation is not in this account's inbox." });
    expect(mockReplyDmOnPlatform).not.toHaveBeenCalled();
  });

  it("sends into a verified conversation using the verified peer", async () => {
    mockDb.select.mockReturnValue(selectChain([dmAccountRow()]));
    mockVerifyDm.mockResolvedValue({ ok: true, peerId: "did:plc:peer" });
    mockReplyDmOnPlatform.mockResolvedValue({ ok: true, messageId: "m-1" });
    const out = await replyToInboxDmForScope(ctx, {
      accountId: "acc-1",
      conversationId: "conv-1",
      text: "on it",
    });
    expect(out).toEqual({ ok: true, messageId: "m-1" });
    expect(mockVerifyDm).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1", ownerUserId: "user-1", accessToken: "token" }),
      "conv-1",
    );
    expect(mockReplyDmOnPlatform).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        peerId: "did:plc:peer",
        text: "on it",
        accountId: "acc-1",
      }),
    );
  });
});
