/** Shared types for posts list (safe to import from client components - no DB). */

export type PublicationRow = {
  publicationId: string;
  connectedAccountId: string | null;
  status: string | null;
  platformPostUrl: string | null;
  platformPostId: string | null;
  platform: string;
  lastError: string | null;
  profileImageUrl: string | null;
  platformUsername: string | null;
  platformUserId?: string | null;
  isTwitterPremium: boolean | null;
  publishedAt: Date | null;
  platformMetadata?: Record<string, unknown> | null;
  /** Connected account `token_status` (active | expired | unknown). */
  tokenStatus?: string | null;
};

/**
 * List status filter.
 * - "published": published only (legacy "posted" tab).
 * - "published_or_partial": everything that went out somewhere.
 * - "needs_review": drafts created by an API key or MCP host.
 * - "user_draft": drafts that are not awaiting review (made in the dashboard).
 */
export type StatusFilter =
  | "draft"
  | "scheduled"
  | "published"
  | "published_or_partial"
  | "failed"
  | "needs_review"
  | "user_draft"
  | null;

export type PostsListParams = {
  userId: string;
  /** Null = Main pool; set filters to that workspace. */
  workspaceId?: string | null;
  statusFilter?: StatusFilter;
  sort?: "newest" | "oldest";
  platform?: string | null;
  time?: string | null;
  account?: string | null;
  /** Case-insensitive caption search. */
  query?: string | null;
  /** 1-based page number; used with limit/offset for pagination */
  page?: number;
  limit?: number;
  offset?: number;
};
