/** Shared types for posts list (safe to import from client components — no DB). */

export type PublicationRow = {
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
};

export type StatusFilter = "draft" | "scheduled" | "published" | null;

export type PostsListParams = {
  userId: string;
  statusFilter?: StatusFilter;
  sort?: "newest" | "oldest";
  platform?: string | null;
  time?: string | null;
  account?: string | null;
  /** 1-based page number; used with limit/offset for pagination */
  page?: number;
  limit?: number;
  offset?: number;
};
