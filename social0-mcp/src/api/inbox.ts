import { apiClient } from "./client.js";
import type {
  AnalyticsAccount,
  InboxCommentList,
  InboxDmList,
  InboxDmThread,
  InboxListQuery,
  InboxMutationResult,
} from "../types/index.js";

function listQuery(query: InboxListQuery): string {
  const params = new URLSearchParams();
  if (query.range) params.set("range", query.range);
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);
  if (query.account_id) params.set("account_id", query.account_id);
  if (query.platform) params.set("platform", query.platform);
  if (query.before) params.set("before", query.before);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.fresh) params.set("fresh", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function listInboxAccounts(
  mode: "comments" | "dms",
): Promise<AnalyticsAccount[]> {
  const response = await apiClient.get<{ data: AnalyticsAccount[] }>(
    `/inbox/accounts?mode=${mode}`,
  );
  return response.data;
}

export async function listComments(
  query: InboxListQuery = {},
): Promise<InboxCommentList> {
  return apiClient.get<InboxCommentList>(`/inbox/comments${listQuery(query)}`);
}

export async function replyToComment(
  commentId: string,
  body: { publication_id: string; text?: string; media_id?: string },
): Promise<InboxMutationResult> {
  return apiClient.post<InboxMutationResult>(
    `/inbox/comments/${encodeURIComponent(commentId)}/reply`,
    body,
  );
}

export async function likeComment(
  commentId: string,
  body: { publication_id: string; unlike?: boolean },
): Promise<InboxMutationResult> {
  return apiClient.post<InboxMutationResult>(
    `/inbox/comments/${encodeURIComponent(commentId)}/like`,
    body,
  );
}

export async function hideComment(
  commentId: string,
  body: { publication_id: string },
): Promise<InboxMutationResult> {
  return apiClient.post<InboxMutationResult>(
    `/inbox/comments/${encodeURIComponent(commentId)}/hide`,
    body,
  );
}

export async function listDms(
  query: InboxListQuery = {},
): Promise<InboxDmList> {
  return apiClient.get<InboxDmList>(`/inbox/dms${listQuery(query)}`);
}

export async function getDmThread(
  conversationId: string,
  query: { account_id: string; peer_id?: string; fresh?: boolean },
): Promise<InboxDmThread> {
  const params = new URLSearchParams({ account_id: query.account_id });
  if (query.peer_id) params.set("peer_id", query.peer_id);
  if (query.fresh) params.set("fresh", "1");
  return apiClient.get<InboxDmThread>(
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
  return apiClient.post<InboxMutationResult>(
    `/inbox/dms/${encodeURIComponent(conversationId)}/reply`,
    body,
  );
}
