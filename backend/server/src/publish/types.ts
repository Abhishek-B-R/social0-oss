import type { SupportedPlatform } from "@social0/shared";

export type PublishContext = {
  postId: string;
  userId: string;
  publicationId: string;
  connectedAccountId: string;
  platform: SupportedPlatform;
};

export type PublishResult = {
  success: boolean;
  platformPostId?: string;
  platformUrl?: string;
  error?: string;
};
