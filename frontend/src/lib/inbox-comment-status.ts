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

export const INBOX_HIDE_PLATFORMS = ["instagram", "facebook"] as const;

export function inboxCommentLikeSupported(platform: string): boolean {
  return (INBOX_LIKE_PLATFORMS as readonly string[]).includes(platform);
}

export function inboxCommentHideSupported(platform: string): boolean {
  return (INBOX_HIDE_PLATFORMS as readonly string[]).includes(platform);
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

export type InboxPostGroup<T extends InboxStatusThread = InboxStatusThread> = {
  publicationId: string;
  threads: T[];
};

/**
 * Which post groups survive the status filter.
 *
 * `threads` is already filtered per thread, so an empty group is the only
 * thing to drop. An earlier version also gated on the group-wide unanswered
 * count, which hid answered threads on any post that still had an unanswered
 * one - the Answered tab silently lost them.
 */
export function inboxPostGroupVisible<T extends InboxStatusThread>(
  group: InboxPostGroup<T>,
  filter: InboxCommentStatusFilter,
  hiddenPublicationIds: ReadonlySet<string>,
): boolean {
  if (group.threads.length === 0) return false;
  if (filter === "unanswered" && hiddenPublicationIds.has(group.publicationId)) {
    return false;
  }
  return true;
}
