import { idempotencyKeyFor } from "../lib/idempotency.js";
import type { ListPostsResponse, PostDetail, PostSummary, ScheduleResult } from "../types/index.js";
import { apiClient } from "./client.js";

export interface CreatePostPayload {
  content: string;
  platforms: string[];
  media?: string[];
  metadata?: Record<string, unknown>;
  platform_options?: Record<string, unknown>;
}

export interface UpdatePostPayload {
  content?: string;
  platforms?: string[];
  media?: string[];
  metadata?: Record<string, unknown>;
  platform_options?: Record<string, unknown>;
}

export interface ListPostsParams {
  status?: string;
  platform?: string;
  connected_account_id?: string;
  search?: string;
  limit?: number;
  page?: number;
}

export interface SchedulePostPayload {
  scheduledAt: string;
  timezone?: string;
}

function buildQuery(params: ListPostsParams): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.platform) query.set("platform", params.platform);
  if (params.connected_account_id) {
    query.set("connected_account_id", params.connected_account_id);
  }
  if (params.search) query.set("search", params.search);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.page !== undefined) query.set("page", String(params.page));
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Every create/publish call sends an Idempotency-Key: the caller's, or one
 * derived from the request (see `idempotencyKeyFor`), so a retried tool call
 * replays the first result instead of posting again.
 */
export async function createPost(
  payload: CreatePostPayload,
  idempotencyKey?: string,
): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>("/posts", payload, {
    idempotencyKey: idempotencyKeyFor("create_draft", payload, idempotencyKey),
  });
}

export async function updatePost(postId: string, payload: UpdatePostPayload): Promise<PostDetail> {
  return apiClient.patch<PostDetail>(`/posts/${postId}`, payload);
}

export async function deletePost(postId: string): Promise<void> {
  await apiClient.delete(`/posts/${postId}`);
}

export async function listPosts(params: ListPostsParams = {}): Promise<ListPostsResponse> {
  return apiClient.get<ListPostsResponse>(`/posts${buildQuery(params)}`);
}

export async function getPost(postId: string): Promise<PostDetail> {
  return apiClient.get<PostDetail>(`/posts/${postId}`);
}

export async function publishPost(
  postId: string,
  idempotencyKey?: string,
): Promise<{
  tracking_id: string;
  status: string;
  stream_url: string;
}> {
  return apiClient.post(`/posts/${postId}/publish`, undefined, {
    idempotencyKey: idempotencyKeyFor("publish_post", { post_id: postId }, idempotencyKey),
  });
}

export async function schedulePost(
  postId: string,
  payload: SchedulePostPayload,
): Promise<{ post_id: string; scheduled_at: string; status: "scheduled" }> {
  return apiClient.post(`/posts/${postId}/schedule`, payload);
}

export async function publishNow(
  payload: CreatePostPayload,
  idempotencyKey?: string,
): Promise<{
  post_id: string;
  tracking_id: string;
  status: string;
  stream_url: string;
}> {
  return apiClient.post("/posts/publish", payload, {
    idempotencyKey: idempotencyKeyFor("publish_now", payload, idempotencyKey),
  });
}

export async function scheduleContent(
  payload: CreatePostPayload & SchedulePostPayload,
  idempotencyKey?: string,
): Promise<ScheduleResult> {
  return apiClient.post("/posts/schedule", payload, {
    idempotencyKey: idempotencyKeyFor("schedule_content", payload, idempotencyKey),
  });
}

export type { PostSummary };

export async function bulkDeletePosts(
  ids: string[],
): Promise<{ deleted: number; failed: { id: string; error: string }[] }> {
  return apiClient.post("/posts/bulk-delete", { ids });
}

export async function duplicatePost(postId: string, idempotencyKey?: string): Promise<{ id: string }> {
  return apiClient.post(`/posts/${postId}/duplicate`, undefined, {
    idempotencyKey: idempotencyKeyFor("duplicate_post", { post_id: postId }, idempotencyKey),
  });
}

export async function postAgain(
  postId: string,
  idempotencyKey?: string,
): Promise<{ post_id: string; tracking_id: string | null; stream_url: string | null; warning?: string }> {
  return apiClient.post(`/posts/${postId}/post-again`, undefined, {
    idempotencyKey: idempotencyKeyFor("post_again", { post_id: postId }, idempotencyKey),
  });
}

export interface AutoPlugPayload {
  metric: "likes" | "retweets";
  threshold: number;
  message: string;
  account_id?: string;
}

export async function setAutoPlug(postId: string, payload: AutoPlugPayload): Promise<Record<string, unknown>> {
  return apiClient.put(`/posts/${postId}/auto-plug`, payload);
}

export async function cancelAutoPlug(postId: string): Promise<void> {
  await apiClient.delete(`/posts/${postId}/auto-plug`);
}

export interface AutoRepostPayload {
  interval_hours?: number;
  max_reposts?: number;
  message?: string | null;
  active?: boolean;
}

export async function setAutoRepost(
  postId: string,
  payload: AutoRepostPayload,
): Promise<{ post_id: string; schedule_id: string }> {
  return apiClient.put(`/posts/${postId}/auto-repost`, payload);
}

export async function cancelAutoRepost(postId: string): Promise<void> {
  await apiClient.delete(`/posts/${postId}/auto-repost`);
}

export async function getPostEvents(postId: string): Promise<Record<string, unknown>> {
  return apiClient.get(`/posts/${postId}/events`);
}
