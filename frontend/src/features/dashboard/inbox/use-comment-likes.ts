import { useCallback, useState } from "react";
import type { InboxComment } from "@/api/inbox";

/**
 * A like or unlike sent from the inbox, plus the server copy it was made
 * against. The server's read cache keeps returning that copy for a few
 * minutes (and X never sends `likedByMe`), so the override wins until the
 * server's numbers move.
 */
export type CommentLikeOverride = {
  liked: boolean;
  count: number;
  /** `likeCount` / `likedByMe` on the comment when the override was made. */
  baseCount: number;
  baseLiked: boolean | undefined;
};

export type CommentLikeView = { liked: boolean; count: number };

export function commentLikeKey(comment: Pick<InboxComment, "publicationId" | "id">): string {
  return `${comment.publicationId}:${comment.id}`;
}

/** What the card shows: the override while the server copy is unchanged. */
export function commentLikeView(
  comment: InboxComment,
  override: CommentLikeOverride | undefined,
): CommentLikeView {
  const serverCount = comment.likeCount ?? 0;
  if (!override) return { liked: Boolean(comment.likedByMe), count: serverCount };
  const serverMoved =
    serverCount !== override.baseCount ||
    (comment.likedByMe !== undefined && comment.likedByMe !== override.baseLiked);
  if (!serverMoved) return { liked: override.liked, count: override.count };
  // Newer server data: trust its count, and its liked flag when it sends one.
  return { liked: comment.likedByMe ?? override.liked, count: serverCount };
}

/**
 * Like state for comments, kept at page level so it survives switching
 * threads (the thread pane remounts per item) and refetches of the list.
 */
export function useCommentLikes() {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, CommentLikeOverride>>(
    () => new Map(),
  );

  /** Record a like/unlike the platform accepted. No-op if already in that state. */
  const recordLike = useCallback((comment: InboxComment, liked: boolean) => {
    setOverrides((prev) => {
      const key = commentLikeKey(comment);
      const current = commentLikeView(comment, prev.get(key));
      if (current.liked === liked) return prev;
      const next = new Map(prev);
      next.set(key, {
        liked,
        count: Math.max(0, current.count + (liked ? 1 : -1)),
        baseCount: comment.likeCount ?? 0,
        baseLiked: comment.likedByMe,
      });
      return next;
    });
  }, []);

  return { likeOverrides: overrides, recordLike };
}
