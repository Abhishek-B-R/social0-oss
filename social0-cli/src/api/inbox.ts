import type {
  AnalyticsAccount,
  InboxCommentList,
  InboxDmList,
  InboxDmThread,
  InboxListQuery,
  InboxMutationResult,
} from "../types/index.js";
import { getClient } from "./client.js";
import { inboxQueryString } from "./query.js";

export async function listInboxAccounts(
  mode: "comments" | "dms" = "comments",
): Promise<AnalyticsAccount[]> {
  const response = await getClient().get<{ data: AnalyticsAccount[] }>(
    `/inbox/accounts?mode=${mode}`,
  );
  return response.data;
}

export async function listInboxComments(
  query: InboxListQuery = {},
): Promise<InboxCommentList> {
  return getClient().get<InboxCommentList>(`/inbox/comments${inboxQueryString(query)}`);
}

export async function replyToComment(
  commentId: string,
  body: { publication_id: string; text?: string; media_id?: string },
): Promise<InboxMutationResult> {
  return getClient().post<InboxMutationResult>(
    `/inbox/comments/${encodeURIComponent(commentId)}/reply`,
    body,
  );
}

export async function likeComment(
  commentId: string,
  body: { publication_id: string; unlike?: boolean },
): Promise<InboxMutationResult> {
  return getClient().post<InboxMutationResult>(
    `/inbox/comments/${encodeURIComponent(commentId)}/like`,
    body,
  );
}

export async function hideComment(
  commentId: string,
  body: { publication_id: string },
): Promise<InboxMutationResult> {
  return getClient().post<InboxMutationResult>(
    `/inbox/comments/${encodeURIComponent(commentId)}/hide`,
    body,
  );
}

export async function listInboxDms(
  query: InboxListQuery = {},
): Promise<InboxDmList> {
  return getClient().get<InboxDmList>(`/inbox/dms${inboxQueryString(query)}`);
}

export async function getInboxDmThread(
  conversationId: string,
  query: { accountId: string; peerId?: string; fresh?: boolean },
): Promise<InboxDmThread> {
  const params = new URLSearchParams({ account_id: query.accountId });
  if (query.peerId) params.set("peer_id", query.peerId);
  if (query.fresh) params.set("fresh", "1");
  return getClient().get<InboxDmThread>(
    `/inbox/dms/${encodeURIComponent(conversationId)}?${params.toString()}`,
  );
}

export async function replyToDm(
  conversationId: string,
  body: {
    account_id: string;
    peer_id?: string;
    text?: string;
    media_id?: string;
  },
): Promise<InboxMutationResult> {
  return getClient().post<InboxMutationResult>(
    `/inbox/dms/${encodeURIComponent(conversationId)}/reply`,
    body,
  );
}
