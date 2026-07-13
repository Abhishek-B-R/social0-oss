/** Shared types for this post form. */

export type PlatformCaptionState = {
  overridden: boolean;
  value: string;
};

export type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  isTwitterPremium?: boolean;
  tokenExpired?: boolean;
  platformMetadata?: Record<string, unknown>;
};

export type ImageFile = {
  file?: File;
  preview: string;
  order: number;
  existingId?: string;
};

