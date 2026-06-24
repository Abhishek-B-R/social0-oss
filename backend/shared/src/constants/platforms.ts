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

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];
