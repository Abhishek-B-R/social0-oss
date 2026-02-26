/**
 * Social0 supported platforms (see PROJECT_STATUS.md).
 * OAuth: LinkedIn, Instagram, YouTube, Pinterest, TikTok, X, Threads, Facebook.
 * BYOK: Bluesky.
 */
export const SUPPORTED_PLATFORMS = [
  "linkedin",
  "facebook",
  "instagram",
  "youtube",
  "pinterest",
  "tiktok",
  "twitter", // X (Twitter)
  "threads",
  "bluesky",
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];
