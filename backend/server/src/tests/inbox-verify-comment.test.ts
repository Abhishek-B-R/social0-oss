import { describe, expect, it } from "vitest";
import {
  commentIdsInFetch,
  commentInFetchResult,
} from "../lib/inbox/verify-comment.js";
import type { InboxComment } from "../lib/inbox/types.js";

function comment(id: string): InboxComment {
  return {
    id,
    platform: "instagram",
    accountId: "acc",
    accountLabel: "creator",
    postId: "post",
    publicationId: "pub",
    platformPostId: "media",
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

describe("verifyCommentOnPublication helpers", () => {
  it("collects comment ids from a fetch result", () => {
    expect(commentIdsInFetch([comment("a"), comment("b")])).toEqual(
      new Set(["a", "b"]),
    );
  });

  it("matches ids present in fetch results", () => {
    const result = {
      comments: [comment("c1"), comment("c2")],
      status: "ok" as const,
    };
    expect(commentInFetchResult(result, "c2")).toBe(true);
    expect(commentInFetchResult(result, "other")).toBe(false);
  });
});
