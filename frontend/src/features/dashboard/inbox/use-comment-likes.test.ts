import { describe, expect, it } from "vitest";
import type { InboxComment } from "@/api/inbox";
import { commentLikeView, type CommentLikeOverride } from "./use-comment-likes";

function comment(extra: Partial<InboxComment> = {}): InboxComment {
  return {
    id: "c1",
    platform: "twitter_x",
    accountId: "acc-1",
    accountLabel: null,
    postId: "post-1",
    publicationId: "pub-1",
    platformPostId: "x-1",
    platformPostUrl: null,
    postSnippet: "",
    postContent: "",
    authorName: "Alice",
    authorHandle: null,
    text: "hi",
    createdAt: null,
    parentId: null,
    canReply: true,
    likeCount: 3,
    ...extra,
  };
}

const liked: CommentLikeOverride = { liked: true, count: 4, baseCount: 3, baseLiked: undefined };

describe("commentLikeView", () => {
  it("keeps the like while the server copy is the stale one it was made against", () => {
    expect(commentLikeView(comment(), liked)).toEqual({ liked: true, count: 4 });
  });

  it("trusts a newer server count but keeps liked when the platform sends no flag", () => {
    expect(commentLikeView(comment({ likeCount: 4 }), liked)).toEqual({ liked: true, count: 4 });
  });

  it("trusts an explicit server liked flag once it changes", () => {
    const fb: CommentLikeOverride = { liked: true, count: 4, baseCount: 3, baseLiked: false };
    expect(commentLikeView(comment({ likedByMe: true, likeCount: 4 }), fb)).toEqual({
      liked: true,
      count: 4,
    });
  });

  it("falls back to the server copy without an override", () => {
    expect(commentLikeView(comment({ likedByMe: true }), undefined)).toEqual({
      liked: true,
      count: 3,
    });
  });
});
