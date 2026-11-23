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
