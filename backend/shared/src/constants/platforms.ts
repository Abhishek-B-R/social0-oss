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

/** Platforms whose OAuth tokens do not expire (BYOK or non-expiring credentials). */
export const NEVER_EXPIRES_PLATFORMS = new Set<string>(["bluesky", "twitter_x"]);
