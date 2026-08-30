/**
 * Bind inbox comment mutations to comments on a Social0-published post.
 * Fetches live (cached first) and rejects commentIds not on the publication thread.
 */

import { withPlatformReadCache } from "../platform-api-cache.js";
import {
  fetchPublicationComments,
  type CommentFetchInput,
  type CommentFetchResult,
} from "./fetch-comments.js";
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

async function fetchCommentsForVerify(
  input: CommentFetchInput,
  fresh: boolean,
): Promise<CommentFetchResult> {
  const cached = await withPlatformReadCache({
    platform: input.platform,
    accountId: input.accountId,
    kind: "inbox_comments",
    suffix: inboxCommentThreadCacheSuffix(input.publicationId),
    fresh,
    fetch: () => fetchPublicationComments(input),
  });
  return cached.data;
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
    const result = await fetchCommentsForVerify(input, fresh);
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
  }

  return {
    ok: false,
    error: "Comment does not belong to this publication.",
  };
}
