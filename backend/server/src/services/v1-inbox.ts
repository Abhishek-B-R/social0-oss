/**
 * `/v1` inbox (comments + DMs) for API keys (CLI / MCP).
 *
 * Reuses the dashboard inbox core with the personal (main) pool, matching
 * `v1-accounts.ts` — workspace-scoped accounts stay dashboard-only. Responses
 * are snake_case to match the rest of `/v1`.
 */

import {
  getInboxDmThreadForScope,
  hideInboxCommentForScope,
  likeInboxCommentForScope,
  listInboxAccountsForScope,
  listInboxCommentsForScope,
  listInboxDmsForScope,
  replyToInboxCommentForScope,
  replyToInboxDmForScope,
  type InboxScope,
} from "./inbox.js";
import type {
  InboxAttachment,
  InboxComment,
  InboxDmMessage,
  InboxDmThread,
  InboxFetchError,
  InboxNotice,
  InboxReconnectHint,
  InboxThread,
} from "../lib/inbox/types.js";

/** API keys address the personal pool only (same rule as `/v1/accounts`). */
function scopeFor(userId: string): InboxScope {
  return { resourceUserId: userId, workspaceId: null };
}

export type V1InboxListQuery = {
  account_id?: string;
  platform?: string;
  range?: string;
  since?: string;
  until?: string;
  before?: string;
  limit?: number;
  fresh?: boolean;
};

function attachment(a: InboxAttachment | null | undefined) {
  if (!a) return null;
  return {
    type: a.type,
    url: a.url,
    thumbnail_url: a.thumbnailUrl ?? null,
  };
}

function comment(c: InboxComment) {
  return {
    id: c.id,
    platform: c.platform,
    account_id: c.accountId,
    account_username: c.accountLabel,
    post_id: c.postId,
    publication_id: c.publicationId,
    platform_post_id: c.platformPostId,
    platform_post_url: c.platformPostUrl,
    post_snippet: c.postSnippet,
    author_name: c.authorName,
    author_handle: c.authorHandle,
    text: c.text,
    attachment: attachment(c.attachment),
    created_at: c.createdAt,
    like_count: c.likeCount ?? null,
    liked_by_me: c.likedByMe ?? null,
    parent_id: c.parentId,
    can_reply: c.canReply,
    is_own: c.isOwn ?? false,
  };
}

function thread(t: InboxThread) {
  return {
    comment: comment(t.comment),
    replies: t.replies.map(comment),
    // Cheap triage signal for scripts: "has the account answered yet?".
    answered: t.replies.some((r) => r.isOwn) || Boolean(t.comment.isOwn),
  };
}

function reconnect(hints: InboxReconnectHint[]) {
  return hints.map((h) => ({
    account_id: h.accountId,
    platform: h.platform,
    username: h.username,
    missing_scopes: h.missingScopes,
  }));
}

function fetchErrors(errors: InboxFetchError[]) {
  return errors.map((e) => ({
    account_id: e.accountId,
    platform: e.platform,
    error: e.error,
  }));
}

function notices(list: InboxNotice[]) {
  return list.map((n) => ({ platform: n.platform, message: n.message }));
}

function dmThread(t: InboxDmThread) {
  return {
    conversation_id: t.conversationId,
    platform: t.platform,
    account_id: t.accountId,
    account_username: t.accountLabel,
    peer_id: t.peerId,
    peer_name: t.peerName,
    peer_handle: t.peerHandle,
    peer_avatar_url: t.peerAvatarUrl ?? null,
    last_message_at: t.lastMessageAt,
    snippet: t.snippet,
    can_reply: t.canReply,
    media_kinds: t.mediaKinds ?? [],
  };
}

function dmMessage(m: InboxDmMessage) {
  return {
    id: m.id,
    text: m.text,
    created_at: m.createdAt,
    is_own: m.isOwn,
    author_id: m.authorId ?? null,
    author_name: m.authorName,
    author_handle: m.authorHandle,
    attachment: attachment(m.attachment),
  };
}

export async function v1ListInboxAccounts(
  userId: string,
  mode: "comments" | "dms",
) {
  const rows = await listInboxAccountsForScope(scopeFor(userId), { mode });
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    username: r.username,
    profile_image_url: r.profileImageUrl,
    missing_scopes: r.missingScopes,
  }));
}

export async function v1ListInboxComments(
  userId: string,
  query: V1InboxListQuery,
) {
  const data = await listInboxCommentsForScope(scopeFor(userId), {
    accountId: query.account_id,
    platform: query.platform,
    range: query.range,
    since: query.since,
    until: query.until,
    before: query.before,
    limit: query.limit,
    fresh: query.fresh,
  });
  return {
    range: data.range,
    since: data.since,
    until: data.until,
    fetched_at: data.fetchedAt,
    threads: data.threads.map(thread),
    has_more: data.hasMore,
    // Feed back into `before=` to page older publications.
    next_before: data.nextBefore,
    sampled: data.sampled,
    sample_limit: data.sampleLimit,
    unsupported: data.unsupported,
    accounts_needing_reconnect: reconnect(data.accountsNeedingReconnect),
    fetch_errors: fetchErrors(data.fetchErrors),
    notices: notices(data.notices),
  };
}

export async function v1ListInboxDms(userId: string, query: V1InboxListQuery) {
  const data = await listInboxDmsForScope(scopeFor(userId), {
    accountId: query.account_id,
    range: query.range,
    since: query.since,
    until: query.until,
    before: query.before,
    limit: query.limit,
    fresh: query.fresh,
  });
  return {
    range: data.range,
    since: data.since,
    until: data.until,
    fetched_at: data.fetchedAt,
    conversations: data.threads.map(dmThread),
    has_more: data.hasMore,
    next_before: data.nextBefore,
    sampled: data.sampled,
    sample_limit: data.sampleLimit,
    unsupported: data.unsupported,
    accounts_needing_reconnect: reconnect(data.accountsNeedingReconnect),
    fetch_errors: fetchErrors(data.fetchErrors),
    notices: notices(data.notices),
  };
}

export async function v1GetInboxDmThread(
  userId: string,
  input: { account_id: string; conversation_id: string; peer_id?: string; fresh?: boolean },
): Promise<
  | {
      ok: true;
      data: {
        conversation_id: string;
        conversation: ReturnType<typeof dmThread>;
        messages: ReturnType<typeof dmMessage>[];
        fetched_at: string;
      };
    }
  | { ok: false; error: string }
> {
  const result = await getInboxDmThreadForScope(scopeFor(userId), {
    accountId: input.account_id,
    conversationId: input.conversation_id,
    peerId: input.peer_id,
    fresh: input.fresh,
  });
  if ("error" in result) return { ok: false, error: result.error };
  return {
    ok: true,
    data: {
      conversation_id: result.conversationId,
      conversation: dmThread(result.thread),
      messages: result.messages.map(dmMessage),
      fetched_at: result.fetchedAt,
    },
  };
}

export async function v1ReplyToInboxComment(
  userId: string,
  input: {
    publication_id: string;
    comment_id: string;
    text?: string;
    media_id?: string;
  },
) {
  return replyToInboxCommentForScope(scopeFor(userId), {
    publicationId: input.publication_id,
    commentId: input.comment_id,
    text: input.text,
    mediaId: input.media_id,
  });
}

export async function v1LikeInboxComment(
  userId: string,
  input: { publication_id: string; comment_id: string; unlike?: boolean },
) {
  return likeInboxCommentForScope(scopeFor(userId), {
    publicationId: input.publication_id,
    commentId: input.comment_id,
    unlike: input.unlike,
  });
}

export async function v1HideInboxComment(
  userId: string,
  input: { publication_id: string; comment_id: string },
) {
  return hideInboxCommentForScope(scopeFor(userId), {
    publicationId: input.publication_id,
    commentId: input.comment_id,
  });
}

export async function v1ReplyToInboxDm(
  userId: string,
  input: {
    account_id: string;
    conversation_id: string;
    peer_id?: string;
    text?: string;
    media_id?: string;
  },
) {
  return replyToInboxDmForScope(scopeFor(userId), {
    accountId: input.account_id,
    conversationId: input.conversation_id,
    peerId: input.peer_id,
    text: input.text,
    mediaId: input.media_id,
  });
}
