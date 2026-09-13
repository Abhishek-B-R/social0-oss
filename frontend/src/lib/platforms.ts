// Order: color groups - blues → reds → gradient → blacks (visually consistent everywhere)

export const PLATFORMS = [
  { id: "linkedin", name: "LinkedIn", icon: null },
  { id: "facebook", name: "Facebook", icon: null },
  { id: "bluesky", name: "Bluesky", icon: null },
  { id: "youtube", name: "YouTube", icon: null },
  { id: "pinterest", name: "Pinterest", icon: null },
  { id: "instagram", name: "Instagram", icon: null },
  { id: "tiktok", name: "TikTok", icon: null },
  { id: "twitter_x", name: "X (Twitter)", icon: null },
  { id: "threads", name: "Threads", icon: null },
] as const;

export type Platform = (typeof PLATFORMS)[number]["id"];

export const PLATFORM_LABEL: Record<string, string> = {
  ...Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name])),
  twitter_x: "X",
};

/** BYOK + Twitter: never show "expired" in UI. */
export const NEVER_EXPIRES_PLATFORMS = new Set<string>(["bluesky", "twitter_x"]);
