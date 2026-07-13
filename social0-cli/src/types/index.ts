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

export type OutputFormat = "table" | "json" | "yaml";

export interface ConnectedAccount {
  id: string;
  platform: Platform | string;
  username: string | null;
  profile_image_url: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  token_status: "active" | "expired" | "unknown";
  created_at: string | null;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  plan: string;
  timezone: string;
  created_at: string | null;
  api_key: {
    id: string;
    name: string;
    prefix: string;
  } | null;
}

export interface PostSummary {
  id: string;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  media_ids: string[];
}

export interface PostDetail extends PostSummary {
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  platforms: Array<{
    publication_id: string;
    connected_account_id: string;
    platform: string;
    status: string;
    platform_post_id: string | null;
    platform_post_url: string | null;
    published_at: string | null;
    error: string | null;
  }>;
}

export interface ListPostsResponse {
  data: PostSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface MediaUploadResult {
  id: string;
  url: string;
}

export interface PublishNowResult {
  post_id?: string;
  tracking_id: string;
  status: string;
  stream_url?: string;
}

export interface ScheduleResult {
  post_id: string;
  scheduled_at: string;
  status: "scheduled";
}

export interface JobStatusResponse {
  tracking_id: string;
  post_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "partial";
  total: number;
  completed: number;
  failed: number;
  platform_statuses: Array<{
    platform: string;
    connected_account_id: string | null;
    phase: string;
    message: string | null;
    error: string | null;
  }>;
  errors: Array<{
    platform: string;
    connected_account_id: string | null;
    message: string;
  }>;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ApiErrorBody {
  error?: string | { code?: string; message?: string; issues?: unknown };
  code?: string;
  message?: string;
}

export interface CliConfig {
  apiUrl: string;
  defaultWorkspace?: string;
  defaultTimezone: string;
  defaultPlatform?: string;
  outputFormat: OutputFormat;
}

export interface LinkedProjectConfig {
  workspace?: string;
  defaultPlatforms?: string[];
  outputFormat?: OutputFormat;
}

export interface GlobalOptions {
  json?: boolean;
  yaml?: boolean;
  table?: boolean;
  verbose?: boolean;
  apiUrl?: string;
}

export interface AccountAlias {
  alias: number;
  account: ConnectedAccount;
}
