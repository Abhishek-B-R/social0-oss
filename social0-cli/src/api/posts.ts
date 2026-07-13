import { randomUUID } from "node:crypto";
import type { ListPostsResponse, PostDetail, ScheduleResult } from "../types/index.js";
import { getClient } from "./client.js";

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
  if (params.connected_account_id) query.set("connected_account_id", params.connected_account_id);
  if (params.search) query.set("search", params.search);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.page !== undefined) query.set("page", String(params.page));
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function createPost(payload: CreatePostPayload): Promise<{ id: string }> {
  return getClient().post<{ id: string }>("/posts", payload);
}

export async function updatePost(postId: string, payload: UpdatePostPayload): Promise<PostDetail> {
  return getClient().patch<PostDetail>(`/posts/${postId}`, payload);
}

export async function deletePost(postId: string): Promise<void> {
  await getClient().delete(`/posts/${postId}`);
}

export async function listPosts(params: ListPostsParams = {}): Promise<ListPostsResponse> {
  return getClient().get<ListPostsResponse>(`/posts${buildQuery(params)}`);
}

export async function getPost(postId: string): Promise<PostDetail> {
  return getClient().get<PostDetail>(`/posts/${postId}`);
}

export async function publishPost(postId: string): Promise<{
  tracking_id: string;
  status: string;
  stream_url: string;
}> {
  return getClient().post(`/posts/${postId}/publish`, undefined, {
    idempotencyKey: randomUUID(),
  });
}

export async function schedulePost(
  postId: string,
  payload: SchedulePostPayload,
): Promise<{ post_id: string; scheduled_at: string; status: "scheduled" }> {
  return getClient().post(`/posts/${postId}/schedule`, payload);
}

export async function publishNow(payload: CreatePostPayload): Promise<{
  post_id: string;
  tracking_id: string;
  status: string;
  stream_url: string;
}> {
  return getClient().post("/posts/publish", payload, { idempotencyKey: randomUUID() });
}

export async function scheduleContent(
  payload: CreatePostPayload & SchedulePostPayload,
): Promise<ScheduleResult> {
  return getClient().post("/posts/schedule", payload);
}
