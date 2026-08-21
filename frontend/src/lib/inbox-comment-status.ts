/** Comment inbox filters: unread / unanswered / answered. Unread ids are local. */

export type InboxCommentStatusFilter =
  | "all"
  | "unread"
  | "unanswered"
  | "answered";

export const INBOX_LIKE_PLATFORMS = [
  "facebook",
  "instagram",
  "twitter_x",
  "bluesky",
  "threads",
  "youtube",
  "linkedin",
] as const;

export function inboxCommentLikeSupported(platform: string): boolean {
  return (INBOX_LIKE_PLATFORMS as readonly string[]).includes(platform);
}

export type InboxStatusComment = {
  id: string;
  parentId?: string | null;
  isOwn?: boolean;
};

export type InboxStatusThread<T extends InboxStatusComment = InboxStatusComment> = {
  comment: T;
  replies: T[];
};

export function isInboxCommentUnread(
  comment: InboxStatusComment,
  seen: { seeded: boolean; ids: ReadonlySet<string> },
): boolean {
  if (comment.isOwn) return false;
  if (!seen.seeded) return true;
  return !seen.ids.has(comment.id);
}

export function isInboxThreadAnswered(thread: InboxStatusThread): boolean {
  return Boolean(thread.comment.isOwn) || thread.replies.some((r) => r.isOwn);
}

export function isInboxThreadUnread(
  thread: InboxStatusThread,
  seen: { seeded: boolean; ids: ReadonlySet<string> },
): boolean {
  if (isInboxCommentUnread(thread.comment, seen)) return true;
  return thread.replies.some((r) => isInboxCommentUnread(r, seen));
}

export function inboxThreadMatchesFilter(
  thread: InboxStatusThread,
  filter: InboxCommentStatusFilter,
  seen: { seeded: boolean; ids: ReadonlySet<string> },
): boolean {
  if (filter === "unanswered") return !isInboxThreadAnswered(thread);
  if (filter === "answered") return isInboxThreadAnswered(thread);
  if (filter === "unread") return isInboxThreadUnread(thread, seen);
  return true;
}

/** Keep unread comments, their ancestors, and our replies sitting under them. */
export function visibleInboxComments<T extends InboxStatusComment>(
  flat: Array<{ comment: T; depth: number }>,
  filter: InboxCommentStatusFilter,
  seen: { seeded: boolean; ids: ReadonlySet<string> },
): Array<{ comment: T; depth: number }> {
  if (filter === "all") return flat;
  if (filter === "unanswered" || filter === "answered") {
    const answered = flat.some(
      (n) => n.comment.isOwn && n.depth > 0,
    );
    if (filter === "answered") return answered ? flat : [];
    return answered ? [] : flat;
  }

  const keep = new Set<string>();
  for (let i = 0; i < flat.length; i++) {
    const node = flat[i];
    if (!node || !isInboxCommentUnread(node.comment, seen)) continue;
    keep.add(node.comment.id);
    let depth = node.depth;
    for (let j = i - 1; j >= 0 && depth > 0; j--) {
      const prev = flat[j];
      if (!prev) continue;
      if (prev.depth === depth - 1) {
        keep.add(prev.comment.id);
        depth -= 1;
      }
    }
  }
  for (const node of flat) {
    if (
      node.comment.isOwn &&
      node.comment.parentId &&
      keep.has(node.comment.parentId)
    ) {
      keep.add(node.comment.id);
    }
  }
  return flat.filter((n) => keep.has(n.comment.id));
}
