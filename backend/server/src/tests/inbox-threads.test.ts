import { describe, expect, it } from "vitest";
import {
  inboxRangeToMs,
  isInboxRange,
  missingInboxScopes,
  toInboxThreads,
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

describe("inbox ranges", () => {
  it("accepts 1d/7d/30d/90d and maps to ms", () => {
    expect(isInboxRange("1d")).toBe(true);
    expect(isInboxRange("365d")).toBe(false);
    expect(inboxRangeToMs("1d")).toBe(24 * 60 * 60 * 1000);
    expect(inboxRangeToMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
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
});
