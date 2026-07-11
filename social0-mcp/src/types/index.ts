export const SUPPORTED_PLATFORMS = [
  "linkedin",
  "facebook",
  "instagram",
  "youtube",
  "pinterest",
  "tiktok",
  "twitter_x",
  "threads",
  "bluesky",
] as const;

export type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed";

export interface ConnectedAccount {
  id: string;
  platform: Platform | string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean;
  isTwitterPremium: boolean;
  tokenExpiresAt: string | null;
  tokenStatus: "active" | "expired" | "unknown";
  platformMetadata: Record<string, unknown>;
}

export interface PostDto {
  id: string;
  caption: string;
  status: PostStatus;
  scheduled_at: string | null;
  platform_configurations: Record<string, unknown> | null;
  social_accounts: string[];
  account_configurations: Record<string, unknown> | null;
  media: string[] | null;
  created_at: string;
  updated_at: string;
  is_draft: boolean;
}

export interface ListPostsMeta {
  total: number;
  offset: number;
  limit: number;
  next: string | null;
}

export interface ListPostsResponse {
  data: PostDto[];
  meta: ListPostsMeta;
}

export interface MediaUploadResult {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  url: string;
}

export interface PublishNowResult {
  trackingId: string;
  jobId: string;
  status: "queued";
  backend?: string;
  enqueued?: number;
  queue: string;
  streamUrl: string;
}

export interface ScheduleResult {
  status: "scheduled";
  postId: string;
  scheduledAt: string;
  jobId: string;
  backend?: string;
  message: string;
}

export interface JobProgressEvent {
  trackingId: string;
  postId: string;
  userId: string;
  phase: string;
  platform?: Platform;
  connectedAccountId?: string;
  message?: string;
  progress?: {
    completed: number;
    failed: number;
    total: number;
  };
  ts: string;
}

export interface JobProgressSnapshot {
  trackingId: string;
  postId: string;
  userId: string;
  status: "queued" | "processing" | "completed" | "failed";
  total: number;
  completed: number;
  failed: number;
  events: JobProgressEvent[];
  updatedAt: string;
}

export interface PlatformSuggestion {
  platform: Platform;
  recommended: boolean;
  reason: string;
}

export interface ApiErrorBody {
  error?: string | Record<string, unknown>;
  code?: string;
  route?: string;
  message?: string;
}
