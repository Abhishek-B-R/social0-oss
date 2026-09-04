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
  username: string | null;
  profile_image_url: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  token_status: "active" | "expired" | "unknown";
  created_at: string | null;
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

export interface PlatformSuggestion {
  platform: Platform;
  recommended: boolean;
  reason: string;
}

export interface ApiErrorBody {
  error?: string | { code?: string; message?: string; issues?: unknown };
  code?: string;
  message?: string;
}

/* ------------------------------------------------------------------ *
 * Analytics + inbox (live platform reads via /v1)
 * ------------------------------------------------------------------ */

export const WINDOW_RANGES = ["7d", "14d", "28d", "90d", "365d", "custom"] as const;

export type WindowRange = (typeof WINDOW_RANGES)[number];

export interface AnalyticsWindowQuery {
  range?: WindowRange;
  since?: string;
  until?: string;
  account_id?: string;
  /** Bypass warm cache. Entries younger than 90s are still served from cache. */
  fresh?: boolean;
}

export interface InboxListQuery extends AnalyticsWindowQuery {
  platform?: string;
  /** Cursor from the previous response's `next_before`. */
  before?: string;
  limit?: number;
}

export interface AnalyticsAccount {
  id: string;
  platform: string;
  username: string | null;
  profile_image_url: string | null;
  missing_scopes: string[];
}

export interface MetricSet {
  views: number | null;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  reposts: number | null;
  quotes: number | null;
  saves: number | null;
  clicks: number | null;
  engagement: number;
}

export interface ReconnectHint {
  account_id: string;
  platform: string;
  username: string | null;
  missing_scopes: string[];
}

export interface PublicationMetrics {
  publication_id: string;
  post_id: string;
  platform: string;
  account_id: string | null;
  account_username: string | null;
  platform_post_id: string | null;
  platform_post_url: string | null;
  published_at: string | null;
  status:
    | "ok"
    | "scope_missing"
    | "unsupported"
    | "error"
    | "no_platform_id"
    | "skipped";
  error: string | null;
  missing_scopes: string[];
  metrics: MetricSet;
}

export interface AnalyticsOverview {
  range: WindowRange;
  since: string;
  until: string;
  fetched_at: string;
  sampled: boolean;
  sample_limit: number;
  partial: boolean;
  totals: MetricSet;
  by_platform: Array<{
    platform: string;
    post_count: number;
    metrics: MetricSet;
  }>;
  series: Array<{
    date: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagement: number;
  }>;
  top_posts: Array<{
    post_id: string;
    snippet: string;
    published_at: string | null;
    platforms: string[];
    metrics: MetricSet;
  }>;
  publications: PublicationMetrics[];
  accounts_needing_reconnect: ReconnectHint[];
}

export interface PostAnalytics {
  post_id: string;
  fetched_at: string;
  partial: boolean;
  totals: MetricSet;
  publications: PublicationMetrics[];
  accounts_needing_reconnect: ReconnectHint[];
}

export interface InboxAttachment {
  type: "image" | "video";
  url: string;
  thumbnail_url: string | null;
}

export interface InboxComment {
  id: string;
  platform: string;
  account_id: string;
  account_username: string | null;
  post_id: string;
  publication_id: string;
  platform_post_id: string;
  platform_post_url: string | null;
  post_snippet: string;
  author_name: string;
  author_handle: string | null;
  text: string;
  attachment: InboxAttachment | null;
  created_at: string | null;
  like_count: number | null;
  liked_by_me: boolean | null;
  parent_id: string | null;
  can_reply: boolean;
  is_own: boolean;
}

export interface InboxThread {
  comment: InboxComment;
  replies: InboxComment[];
  answered: boolean;
}

export interface InboxFetchError {
  account_id: string;
  platform: string;
  error: string;
}

export interface InboxNotice {
  platform: string;
  message: string;
}

interface InboxListMeta {
  range: WindowRange;
  since: string;
  until: string;
  fetched_at: string;
  has_more: boolean;
  next_before: string | null;
  sampled: boolean;
  sample_limit: number;
  unsupported: string[];
  accounts_needing_reconnect: ReconnectHint[];
  fetch_errors: InboxFetchError[];
  notices: InboxNotice[];
}

export interface InboxCommentList extends InboxListMeta {
  threads: InboxThread[];
}

export interface InboxConversation {
  conversation_id: string;
  platform: string;
  account_id: string;
  account_username: string | null;
  peer_id: string;
  peer_name: string;
  peer_handle: string | null;
  peer_avatar_url: string | null;
  last_message_at: string | null;
  snippet: string;
  can_reply: boolean;
  media_kinds: Array<"image" | "video">;
}

export interface InboxDmList extends InboxListMeta {
  conversations: InboxConversation[];
}

export interface InboxDmMessage {
  id: string;
  text: string;
  created_at: string | null;
  is_own: boolean;
  author_id: string | null;
  author_name: string;
  author_handle: string | null;
  attachment: InboxAttachment | null;
}

export interface InboxDmThread {
  conversation_id: string;
  conversation: InboxConversation;
  messages: InboxDmMessage[];
  fetched_at: string;
}

export interface InboxMutationResult {
  ok: boolean;
  reply_id?: string;
  message_id?: string;
}
