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
};
