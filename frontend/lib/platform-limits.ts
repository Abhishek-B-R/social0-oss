export const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  twitter_x: 280,
  bluesky: 300,
  threads: 500,
  instagram: 2200,
  pinterest: 500,
  tiktok: 4000,
  linkedin: 3000,
  facebook: 63206,
  youtube: 5000,
};

export const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  twitter_x: "X(Twitter)",
  bluesky: "Bluesky",
  threads: "Threads",
  instagram: "Instagram",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  youtube: "YouTube",
};

export function getLimitForAccount(account: {
  platform: string;
  isTwitterPremium?: boolean | null;
}): number {
  if (account.platform === "twitter_x") {
    return account.isTwitterPremium ? 25000 : 280;
  }
  return PLATFORM_CHAR_LIMITS[account.platform] ?? 63206;
}

export function getMostRestrictiveLimit(
  accounts: { platform: string; isTwitterPremium?: boolean | null }[],
): number {
  if (accounts.length === 0) return 63206;
  return Math.min(...accounts.map(getLimitForAccount));
}

export function truncateCaptionForPlatform(
  caption: string,
  platform: string,
  isTwitterPremium = false,
): string {
  const limit = getLimitForAccount({
    platform,
    isTwitterPremium: isTwitterPremium ?? false,
  });
  if (caption.length <= limit) return caption;
  const truncated = caption.substring(0, limit - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  return truncated.substring(0, lastSpace > 0 ? lastSpace : limit - 3) + "...";
}
