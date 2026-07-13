/**
 * Shared types for platform publish implementations.
 */

export type PublishPlatformResult = {
  status: "published" | "failed";
  platformPostUrl?: string | null;
  platformPostId?: string | null;
  publishedAt?: Date | null;
  lastError?: string | null;
  error?: string;
};

export type Pub = {
  publicationId: string;
  connectedAccountId: string;
  platform: string;
  platformUserId: string;
  platformUsername: string | null;
  platformMetadata: Record<string, unknown> | null;
};

export type Post = {
  id: string;
  finalContent: string | null;
  mediaIds: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type TikTokPlatformOptions = {
  autoAddMusic?: boolean;
};

/** Runtime options per platform (not persisted). */
export type PlatformPublishOptions = {
  instagram?: {
    coverImageUrl?: string;
    isTrialReel: boolean;
  };
  tiktok?: TikTokPlatformOptions;
};

export type ThreadPart = { text: string; mediaIds: string[] };
