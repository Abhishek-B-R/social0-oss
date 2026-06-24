/** Job payloads — keep in sync with @social0/shared */

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

export type PublishPostJob = {
  postId: string;
  userId: string;
  trackingId?: string;
  connectedAccountIds?: string[];
};

export type PublishPlatformJob = {
  postId: string;
  userId: string;
  trackingId?: string;
  publicationId: string;
  connectedAccountId: string;
  platform: SupportedPlatform;
};

export type PublishJobEnvelope =
  | { kind: "orchestrator"; job: PublishPostJob }
  | { kind: "platform"; job: PublishPlatformJob };

export type PublishTarget = {
  publicationId: string;
  connectedAccountId: string;
  platform: SupportedPlatform;
};
