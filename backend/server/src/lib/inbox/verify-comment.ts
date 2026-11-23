/**
 * Bind inbox comment mutations to comments on a Social0-published post.
 * Fetches live (cached first) and rejects commentIds not on the publication thread.
 */

import {
  PlatformApiCooldownError,
  withPlatformReadCache,
  type PlatformReadResult,
} from "../platform-api-cache.js";
import {
  fetchPublicationComments,
  type CommentFetchInput,
  type CommentFetchResult,
} from "./fetch-comments.js";
import { INBOX_MAX_PAGES } from "./page-param.js";
import type { InboxComment } from "./types.js";

export function commentIdsInFetch(comments: InboxComment[]): Set<string> {
  return new Set(comments.map((c) => c.id));
}

export function commentInFetchResult(
  result: CommentFetchResult,
  commentId: string,
): boolean {
  return commentIdsInFetch(result.comments).has(commentId);
}

/** Cache suffix for full-thread verify fetches (no date window in the key). */
function inboxCommentThreadCacheSuffix(publicationId: string): string {
  return `thread:${publicationId}`;
}

/** Shown when the platform (or our outbound budget) says "not now". */
export function verifyRateLimitedMessage(retryAt?: number, now = Date.now()): string {
  const seconds = retryAt ? Math.ceil((retryAt - now) / 1000) : 0;
  if (seconds > 90) {
    return `This network is limiting requests right now. Try again in about ${Math.ceil(seconds / 60)} minutes.`;
  }
  return "This network is limiting requests right now. Try again in a minute.";
}

async function fetchCommentsForVerify(
  input: CommentFetchInput,
  fresh: boolean,
): Promise<PlatformReadResult<CommentFetchResult>> {
  return withPlatformReadCache({
    platform: input.platform,
    accountId: input.accountId,
    kind: "inbox_comments",
    suffix: inboxCommentThreadCacheSuffix(input.publicationId),
    fresh,
    // Own per-account budget: the inbox page that showed this comment has
    // just spent the list budget, and a reply must not be refused for it.
    purpose: "verify",
    // The retry pass must actually reach the platform. Under the default
    // soft-fresh floor a thread cached moments ago was served straight back,
    // so a comment posted since that read looked like it was not on the post
    // and the reply was rejected.
    ...(fresh ? { softFreshMinAgeMs: 0 } : {}),
    fetch: () =>
      fetchPublicationComments({
        ...input,
        maxGraphPages: INBOX_MAX_PAGES,
      }),
  });
}

export async function verifyCommentOnPublication(
  input: CommentFetchInput,
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!commentId.trim() || commentId.startsWith("optimistic-")) {
    return { ok: false, error: "Invalid comment id." };
  }
  if (!input.platformPostId?.trim()) {
    return { ok: false, error: "Publication has no platform post id." };
  }

  for (const fresh of [false, true] as const) {
    let read: PlatformReadResult<CommentFetchResult>;
    try {
      read = await fetchCommentsForVerify(input, fresh);
    } catch (e) {
      if (e instanceof PlatformApiCooldownError) {
        return { ok: false, error: verifyRateLimitedMessage(e.retryAt) };
      }
      throw e;
    }
    const result = read.data;
    if (commentInFetchResult(result, commentId)) {
      return { ok: true };
    }
    if (result.status === "scope_missing") {
      return {
        ok: false,
        error: "Reconnect this account to reply to comments.",
      };
    }
    if (result.status === "unsupported") {
      return {
        ok: false,
        error: `Comments are not supported for ${input.platform} yet.`,
      };
    }
    if (result.status === "error" && !result.comments.length) {
      return {
        ok: false,
        error: result.error ?? "Could not verify comment on this post.",
      };
    }
    // A saved copy served because of a rate limit cannot prove the comment is
    // missing, and a second pass would only hit the same limit.
    if (read.rateLimited) {
      return { ok: false, error: verifyRateLimitedMessage() };
    }
    // That was already a live read: a second call cannot see more and only
    // spends another token.
    if (!read.fromCache) break;
  }

  return {
    ok: false,
    error: "Comment does not belong to this publication.",
  };
}
