import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type { Post } from "@/types";

export interface CreatePostInput {
  caption: string;
  connectedAccountIds: string[];
  scheduledAt?: string | null;
  mediaIds?: string[];
  isDraft?: boolean;
}

export interface ListPostsParams {
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * Posts CRUD targets /v1/* — requires backend v1 routes to be implemented.
 */
export const postsService = {
  list(params?: ListPostsParams): Promise<{ posts: Post[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiGet(`/v1/posts${q ? `?${q}` : ""}`);
  },

  get(id: string): Promise<Post> {
    return apiGet<Post>(`/v1/posts/${id}`);
  },

  create(input: CreatePostInput): Promise<Post> {
    return apiPost<Post>("/v1/posts", input);
  },

  update(id: string, input: Partial<CreatePostInput>): Promise<Post> {
    return apiPatch<Post>(`/v1/posts/${id}`, input);
  },

  delete(id: string): Promise<void> {
    return apiDelete(`/v1/posts/${id}`);
  },
};
