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

export interface PostAgainResult {
  post_id: string;
  tracking_id: string | null;
  stream_url: string | null;
  warning?: string;
}

export interface AutoPlugPayload {
  metric: "likes" | "retweets";
  threshold: number;
  message: string;
  account_id?: string;
}

export interface AutoRepostPayload {
  interval_hours?: number;
  max_reposts?: number;
  message?: string | null;
  active?: boolean;
}

export interface PostEvent {
  id: string;
  phase: string;
  platform: string | null;
  message: string | null;
  created_at: string;
}

/** Deletes draft/scheduled posts only; the rest come back in `failed`. */
export async function bulkDeletePosts(
  ids: string[],
): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
  return getClient().post("/posts/bulk-delete", { ids });
}

export async function duplicatePost(postId: string): Promise<{ id: string }> {
  return getClient().post(`/posts/${postId}/duplicate`, undefined, { idempotencyKey: randomUUID() });
}

/** Republish a published/partial post as a new post (retrying failed accounts is `publishPost`). */
export async function postAgain(postId: string): Promise<PostAgainResult> {
  return getClient().post(`/posts/${postId}/post-again`, undefined, { idempotencyKey: randomUUID() });
}

export async function setAutoPlug(
  postId: string,
  payload: AutoPlugPayload,
): Promise<{ post_id: string; auto_plug: string }> {
  return getClient().put(`/posts/${postId}/auto-plug`, payload);
}

export async function cancelAutoPlug(postId: string): Promise<void> {
  await getClient().delete(`/posts/${postId}/auto-plug`);
}

export async function setAutoRepost(
  postId: string,
  payload: AutoRepostPayload,
): Promise<{ post_id: string; schedule_id: string }> {
  return getClient().put(`/posts/${postId}/auto-repost`, payload);
}

export async function disableAutoRepost(postId: string): Promise<void> {
  await getClient().delete(`/posts/${postId}/auto-repost`);
}

export async function getPostEvents(postId: string): Promise<{ postId: string; events: PostEvent[] }> {
  return getClient().get(`/posts/${postId}/events`);
}
