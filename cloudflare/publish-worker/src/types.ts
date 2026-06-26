export type SupportedPlatform =
  | "twitter_x"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "threads"
  | "tiktok"
  | "youtube"
  | "pinterest"
  | "bluesky";

/** One platform publish job - API enqueues directly (no orchestrator). */
export type PublishPlatformJob = {
  postId: string;
  userId: string;
  trackingId?: string;
  publicationId: string;
  connectedAccountId: string;
  platform: SupportedPlatform;
};

export type PublishEnqueueRequest = {
  priority: "now" | "scheduled";
  job: PublishPlatformJob;
};

export type PublishResultItem = {
  platform: string;
  connectedAccountId: string;
  status: "published" | "failed";
  platformPostUrl?: string | null;
  error?: string;
};

export type PublishResult = {
  success: boolean;
  error?: string;
  results: PublishResultItem[];
};
