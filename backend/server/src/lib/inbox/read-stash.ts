/**
 * Stable stash keys and merges for inbox reads.
 *
 * The fresh cache keys for inbox reads carry the date window (`since` moves at
 * every local midnight) and, for X, a hash of the posts on the page (moves with
 * every new post). The stash is the fallback served when a platform or our own
 * outbound budget says "not now", so it must outlive those changes: it is keyed
 * per publication / per account instead, and callers re-apply their window to
 * whatever it returns.
 */

import type { PlatformReadStash } from "../platform-api-cache.js";
import type { CommentFetchResult } from "./fetch-comments.js";
import type { DmListFetchResult } from "./fetch-dms.js";

/** Publications kept in one account's X comment-batch stash. */
export const X_BATCH_STASH_MAX_PUBLICATIONS = 64;
/** Conversations kept in one account's DM-list stash. */
export const DM_LIST_STASH_MAX_THREADS = 200;

/** Per-publication comment list (every platform but X). */
export function publicationCommentsStash(
  publicationId: string,
): PlatformReadStash<CommentFetchResult> {
  return { suffix: `pub:${publicationId}` };
}

/**
 * Union of X batch results by publication. The newest read wins for a
 * publication it covers; the oldest publications drop off past the cap.
 */
export function mergeXCommentBatches(
  stashed: Record<string, CommentFetchResult>,
  next: Record<string, CommentFetchResult>,
  max = X_BATCH_STASH_MAX_PUBLICATIONS,
): Record<string, CommentFetchResult> {
  const merged = new Map<string, CommentFetchResult>();
  for (const [id, result] of Object.entries(stashed)) {
    if (!(id in next)) merged.set(id, result);
  }
  // Re-inserted last so they count as the most recent when trimming.
  for (const [id, result] of Object.entries(next)) merged.set(id, result);
  const entries = [...merged.entries()];
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - max)));
}

/** One stash per X account, whatever posts the page held. */
export const X_COMMENT_BATCH_STASH: PlatformReadStash<
  Record<string, CommentFetchResult>
> = { suffix: "x-batch", merge: (a, b) => mergeXCommentBatches(a, b) };

/**
 * Union of DM list reads by conversation, newest activity first. Head pages
 * and older pages of the same account all fold into one list; callers filter
 * it by their window and cursor.
 */
export function mergeDmListReads(
  stashed: DmListFetchResult,
  next: DmListFetchResult,
  max = DM_LIST_STASH_MAX_THREADS,
): DmListFetchResult {
  const byId = new Map<string, DmListFetchResult["threads"][number]>();
  for (const t of [...stashed.threads, ...next.threads]) {
    const prev = byId.get(t.conversationId);
    if (!prev || (t.lastMessageAt ?? "") >= (prev.lastMessageAt ?? "")) {
      byId.set(t.conversationId, t);
    }
  }
  const threads = [...byId.values()]
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
    .slice(0, max);
  return { ...next, threads };
}

/** One stash per DM account, whatever window or cursor the page used. */
export const DM_LIST_STASH: PlatformReadStash<DmListFetchResult> = {
  suffix: "dm-list",
  merge: (a, b) => mergeDmListReads(a, b),
};
