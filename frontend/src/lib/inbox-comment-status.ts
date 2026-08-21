/** Comment inbox filters: unanswered / answered / all. */

export type InboxCommentStatusFilter = "all" | "unanswered" | "answered";

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

export function isInboxThreadAnswered(thread: InboxStatusThread): boolean {
  // Own root (e.g. reply-as-post) is not "answered" — only an own reply is.
  return thread.replies.some((r) => r.isOwn);
}

export function inboxThreadMatchesFilter(
  thread: InboxStatusThread,
  filter: InboxCommentStatusFilter,
): boolean {
  if (filter === "unanswered") return !isInboxThreadAnswered(thread);
  if (filter === "answered") return isInboxThreadAnswered(thread);
  return true;
}

/** Threads always render whole; the filter decides which threads show at all. */
export function visibleInboxComments<T extends InboxStatusComment>(
  flat: Array<{ comment: T; depth: number }>,
  filter: InboxCommentStatusFilter,
): Array<{ comment: T; depth: number }> {
  if (filter === "all") return flat;
  const answered = flat.some((n) => n.comment.isOwn && n.depth > 0);
  if (filter === "answered") return answered ? flat : [];
  return answered ? [] : flat;
}
