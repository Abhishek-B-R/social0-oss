import { config } from "../config.js";
import type { ListPostsResponse, PostDto } from "../types/index.js";
import { apiClient } from "./client.js";

export interface CreatePostPayload {
  caption: string;
  social_accounts: string[];
  scheduled_at?: string | null;
  platform_configurations?: Record<string, unknown> | null;
  account_configurations?: Record<string, unknown> | null;
  media?: string[] | null;
  media_urls?: string[] | null;
  is_draft?: boolean;
}

export interface UpdatePostPayload {
  caption?: string;
  scheduled_at?: string | null;
  platform_configurations?: Record<string, unknown> | null;
  account_configurations?: Record<string, unknown> | null;
  media?: string[] | null;
  social_accounts?: string[];
  is_draft?: boolean;
}

export interface ListPostsParams {
  status?: string;
  platform?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

function buildQuery(params: ListPostsParams): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.platform) query.set("platform", params.platform);
  if (params.search) query.set("search", params.search);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function createPost(payload: CreatePostPayload): Promise<PostDto> {
  return apiClient.post<PostDto>(config.v1Base, "/posts", payload);
}

export async function updatePost(postId: string, payload: UpdatePostPayload): Promise<PostDto> {
  return apiClient.patch<PostDto>(config.v1Base, `/posts/${postId}`, payload);
}

export async function deletePost(postId: string): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(config.v1Base, `/posts/${postId}`);
}

export async function listPosts(params: ListPostsParams = {}): Promise<ListPostsResponse> {
  return apiClient.get<ListPostsResponse>(config.v1Base, `/posts${buildQuery(params)}`);
}

export async function getPost(postId: string): Promise<PostDto> {
  return apiClient.get<PostDto>(config.v1Base, `/posts/${postId}`);
}

export async function publishPostV1(postId: string): Promise<{
  trackingId: string;
  jobId: string;
  status: "queued";
  queue: string;
  streamUrl: string;
}> {
  return apiClient.post(config.v1Base, `/posts/${postId}/publish`);
}
