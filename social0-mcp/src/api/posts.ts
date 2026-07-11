import { randomUUID } from "node:crypto";
import type { ListPostsResponse, PostDetail, PostSummary, ScheduleResult } from "../types/index.js";
import { apiClient } from "./client.js";

export interface CreatePostPayload {
  content: string;
  platforms: string[];
  media?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdatePostPayload {
  content?: string;
  platforms?: string[];
  media?: string[];
  metadata?: Record<string, unknown>;
}

export interface ListPostsParams {
  status?: string;
  platform?: string;
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
  if (params.search) query.set("search", params.search);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.page !== undefined) query.set("page", String(params.page));
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function createPost(payload: CreatePostPayload): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>("/posts", payload);
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

export async function publishPost(postId: string): Promise<{
  tracking_id: string;
  status: string;
  stream_url: string;
}> {
  return apiClient.post(`/posts/${postId}/publish`, undefined, {
    idempotencyKey: randomUUID(),
  });
}

export async function schedulePost(
  postId: string,
  payload: SchedulePostPayload,
): Promise<{ post_id: string; scheduled_at: string; status: "scheduled" }> {
  return apiClient.post(`/posts/${postId}/schedule`, payload);
}

export async function publishNow(payload: CreatePostPayload): Promise<{
  post_id: string;
  tracking_id: string;
  status: string;
  stream_url: string;
}> {
  return apiClient.post("/posts/publish", payload, { idempotencyKey: randomUUID() });
}

export async function scheduleContent(
  payload: CreatePostPayload & SchedulePostPayload,
): Promise<ScheduleResult> {
  return apiClient.post("/posts/schedule", payload);
}

export type { PostSummary };
