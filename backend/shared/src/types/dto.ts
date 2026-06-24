/**
 * DTOs aligned with frontend / legacy v1 API.
 * Business logic lives in worker; server validates and enqueues.
 */

import type { SupportedPlatform } from "../constants/platforms.js";

export type { SupportedPlatform };

export interface PaginationMeta {
  total: number;
  offset: number;
  limit: number;
  next: string | null;
}

export interface MediaObjectDto {
  isDeleted: boolean;
  url: string | null;
  size_bytes: number | null;
  name: string | null;
}

export interface MediaDto {
  id: string;
  mime_type: string | null;
  object: MediaObjectDto;
}

export interface CreateUploadUrlDto {
  name: string;
  mime_type: "image/png" | "image/jpeg" | "video/mp4" | "video/quicktime";
  size_bytes: number;
}

export interface CreateUploadUrlResponseDto {
  media_id: string;
  upload_url: string;
  name: string;
}

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "partial";

export interface PostDto {
  id: string;
  caption: string;
  status: PostStatus;
  scheduled_at: string | null;
  platform_configurations: Record<string, unknown> | null;
  social_accounts: number[];
  account_configurations: Record<string, unknown> | null;
  media: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  is_draft: boolean;
}

export interface CreatePostDto {
  caption: string;
  social_accounts: number[];
  scheduled_at?: string | null;
  platform_configurations?: Record<string, unknown> | null;
  account_configurations?: Record<string, unknown> | null;
  media?: string[] | null;
  media_urls?: string[] | null;
  is_draft?: boolean | null;
}

export interface UpdatePostDto {
  caption?: string;
  scheduled_at?: string | null;
  platform_configurations?: Record<string, unknown> | null;
  account_configurations?: Record<string, unknown> | null;
  media?: string[] | null;
  social_accounts?: number[];
  is_draft?: boolean | null;
}

export interface PostResultDto {
  id: string;
  post_id: string;
  success: boolean;
  social_account_id: number;
  error: Record<string, unknown> | null;
  platform_data: {
    id?: string;
    url?: string;
    username?: string;
  } | null;
}

export interface SocialAccountDto {
  id: number;
  platform: SupportedPlatform | string;
  username: string;
}

export interface DeleteEntityResponseDto {
  success: boolean;
}

export interface ListResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
