export const PLATFORMS = [
  { id: "linkedin", name: "LinkedIn" },
  { id: "facebook", name: "Facebook" },
  { id: "bluesky", name: "Bluesky" },
  { id: "youtube", name: "YouTube" },
  { id: "pinterest", name: "Pinterest" },
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
  { id: "twitter_x", name: "X (Twitter)" },
  { id: "threads", name: "Threads" },
] as const;

export type Platform = (typeof PLATFORMS)[number]["id"];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

export function platformLabel(id: Platform): string {
  return PLATFORMS.find((p) => p.id === id)?.name ?? id;
}

export function connectUrl(platform: Platform, reauth = false): string {
  const base = `/api/connect/${platform}`;
  return reauth ? `${base}/reauth` : base;
}
