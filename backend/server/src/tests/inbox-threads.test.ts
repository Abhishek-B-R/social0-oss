import { describe, expect, it } from "vitest";
import {
  missingDmScopes,
  missingInboxScopes,
  peerFromParticipants,
  toInboxThreads,
  youtubeAuthorChannelId,
  type InboxComment,
} from "../lib/inbox/types.js";

function comment(partial: Partial<InboxComment> & Pick<InboxComment, "id">): InboxComment {
  return {
    platform: "instagram",
    accountId: "acc",
    accountLabel: "me",
    postId: "post",
    publicationId: "pub",
    platformPostId: "media",
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

describe("missingInboxScopes", () => {
  it("treats empty stored scopes as missing for Instagram/Facebook", () => {
    expect(missingInboxScopes("instagram", null)).toEqual([
      "instagram_business_manage_comments",
    ]);
    expect(missingInboxScopes("facebook", "")).toEqual([
      "pages_manage_engagement",
    ]);
  });

  it("does not nag platforms that need no extra scopes", () => {
    expect(missingInboxScopes("twitter_x", null)).toEqual([]);
    expect(missingInboxScopes("youtube", "")).toEqual([]);
  });
});

describe("missingDmScopes", () => {
  it("treats empty stored scopes as missing for Instagram/Facebook messaging", () => {
    expect(missingDmScopes("instagram", null)).toEqual([
      "instagram_business_manage_messages",
    ]);
    expect(missingDmScopes("facebook", "")).toEqual(["pages_messaging"]);
  });

  it("does not nag X, Bluesky, or TikTok for extra OAuth strings", () => {
    expect(missingDmScopes("twitter_x", null)).toEqual([]);
    expect(missingDmScopes("bluesky", "")).toEqual([]);
    expect(missingDmScopes("tiktok", null)).toEqual([]);
  });
});

describe("peerFromParticipants", () => {
  it("picks the other person, not the connected account", () => {
    const peer = peerFromParticipants(
      [
        { id: "page", name: "My Page" },
        { id: "user-1", name: "Ada", username: "ada" },
      ],
      "page",
    );
    expect(peer).toEqual({
      id: "user-1",
      name: "Ada",
      handle: "ada",
      avatarUrl: null,
    });
  });
});

describe("toInboxThreads", () => {
  it("nests replies and keeps orphans as top-level", () => {
    const threads = toInboxThreads([
      comment({
        id: "child",
        parentId: "parent",
        text: "reply",
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
      comment({
        id: "parent",
        text: "top",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      comment({
        id: "orphan",
        parentId: "missing",
        text: "lost parent",
        createdAt: "2026-01-04T00:00:00.000Z",
      }),
    ]);
    expect(threads.map((t) => t.comment.id)).toEqual(["orphan", "parent"]);
    expect(threads[1]?.replies.map((r) => r.id)).toEqual(["child"]);
  });

  it("flattens reply-to-reply under the conversation root", () => {
    const threads = toInboxThreads([
      comment({ id: "root", createdAt: "2026-01-01T00:00:00.000Z" }),
      comment({
        id: "r1",
        parentId: "root",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
      comment({
        id: "r2",
        parentId: "r1",
        text: "your reply",
        isOwn: true,
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.replies.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("youtubeAuthorChannelId", () => {
  it("unwraps { value } and ignores empty", () => {
    expect(youtubeAuthorChannelId({ value: "UC123" })).toBe("UC123");
    expect(youtubeAuthorChannelId("UC123")).toBe("UC123");
    expect(youtubeAuthorChannelId({ value: "" })).toBeNull();
    expect(youtubeAuthorChannelId(null)).toBeNull();
  });
});
