const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Video duration (seconds) and size limits per platform. Used to warn and disable accounts when video exceeds limit. */
export const VIDEO_LIMITS: Record<
  string,
  {
    maxDuration: number;
    maxDurationPremium?: number;
    /** If set, video over this duration gets a soft warning only (account not disabled). E.g. Instagram 3min = algorithm won't push to new audiences. */
    softWarnDuration?: number;
    maxSize: number;
    formats: string[];
  }
> = {
  twitter_x: {
    maxDuration: 140, // 2min 20s — free accounts only
    maxDurationPremium: 600, // 10min — Premium accounts
    maxSize: 512 * MB,
    formats: ["mp4", "mov"],
  },
  instagram: {
    maxDuration: 1200, // 20min — hard API limit (Dec 2025)
    softWarnDuration: 180, // 3min — accepted but algorithm won't push to new audiences
    maxSize: 250 * MB,
    formats: ["mp4", "mov"],
  },
  tiktok: {
    maxDuration: 600, // 10min
    maxSize: 287.6 * MB,
    formats: ["mp4", "mov"],
  },
  youtube: {
    maxDuration: 300, // 5min — platform cap; ≤3min vertical → Shorts, 3–5min → regular
    maxSize: 256 * MB,
    formats: ["mp4", "mov"],
  },
  linkedin: {
    maxDuration: 600, // 10min
    maxSize: 5 * GB,
    formats: ["mp4", "mov", "mkv", "webm"],
  },
  facebook: {
    maxDuration: 600, // 10min feed video
    maxSize: 4 * GB,
    formats: ["mp4", "mov"],
  },
  pinterest: {
    maxDuration: 900, // 15min
    maxSize: 2 * GB,
    formats: ["mp4", "mov"],
  },
  threads: {
    maxDuration: 300, // 5min
    maxSize: 1 * GB,
    formats: ["mp4", "mov"],
  },
  bluesky: {
    maxDuration: 180, // 3min (updated March 2025)
    maxSize: 100 * MB,
    formats: ["mp4", "mov", "webm", "mpeg"],
  },
};

/** Character limits per platform. TikTok: 4000 for photo description + 90 for title; video caption max 2200 (enforced in publisher). */
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

/** Max video duration in seconds for an account. Twitter: 140s free, 600s Premium. */
export function getVideoLimitSecondsForAccount(account: {
  platform: string;
  isTwitterPremium?: boolean | null;
}): number {
  const limits = VIDEO_LIMITS[account.platform];
  if (!limits) return 600; // unknown platform: allow 10min
  if (
    account.platform === "twitter_x" &&
    limits.maxDurationPremium != null &&
    account.isTwitterPremium
  ) {
    return limits.maxDurationPremium;
  }
  return limits.maxDuration;
}

export type VideoLimitWarning = {
  platform: string;
  platformDisplayName: string;
  limitSeconds: number;
  message: string;
};

/** Returns account IDs that exceed hard limit (disabled), optional soft-warn account IDs (warn only), and warning messages. */
export function getAccountsOverVideoLimit(
  accounts: {
    id: string;
    platform: string;
    isTwitterPremium?: boolean | null;
  }[],
  durationSeconds: number,
): {
  accountIds: Set<string>;
  warnings: VideoLimitWarning[];
  softAccountIds: Set<string>;
  softWarnings: VideoLimitWarning[];
} {
  const accountIds = new Set<string>();
  const softAccountIds = new Set<string>();
  const warningByPlatform = new Map<
    string,
    { limitSeconds: number; platformDisplayName: string }
  >();
  const softWarningByPlatform = new Map<string, string>();

  for (const acc of accounts) {
    const limits = VIDEO_LIMITS[acc.platform];
    const hardLimit = getVideoLimitSecondsForAccount(acc);

    if (durationSeconds > hardLimit) {
      accountIds.add(acc.id);
      if (!warningByPlatform.has(acc.platform)) {
        const name = PLATFORM_DISPLAY_NAMES[acc.platform] ?? acc.platform;
        warningByPlatform.set(acc.platform, {
          limitSeconds: hardLimit,
          platformDisplayName: name,
        });
      }
    } else if (
      limits?.softWarnDuration != null &&
      durationSeconds > limits.softWarnDuration
    ) {
      softAccountIds.add(acc.id);
      if (!softWarningByPlatform.has(acc.platform)) {
        softWarningByPlatform.set(
          acc.platform,
          "Will accept this video but may limit its reach to new audiences.",
        );
      }
    }
  }

  const warnings: VideoLimitWarning[] = [];
  warningByPlatform.forEach((v, platform) => {
    const limitMin = Math.floor(v.limitSeconds / 60);
    const limitSec = v.limitSeconds % 60;
    const limitStr =
      limitSec > 0
        ? `${limitMin}:${limitSec.toString().padStart(2, "0")}`
        : `${limitMin} min`;
    const isTwitter = platform === "twitter_x";
    const displayName =
      platform === "youtube" ? "YouTube Shorts" : v.platformDisplayName;
    const message = isTwitter
      ? `${v.platformDisplayName}: Free accounts limited to ${limitStr} videos. Premium accounts can post up to 10 min.`
      : `${displayName}: Videos limited to ${limitStr}.`;
    warnings.push({
      platform,
      platformDisplayName: v.platformDisplayName,
      limitSeconds: v.limitSeconds,
      message,
    });
  });

  const softWarnings: VideoLimitWarning[] = [];
  softWarningByPlatform.forEach((message, platform) => {
    const name = PLATFORM_DISPLAY_NAMES[platform] ?? platform;
    softWarnings.push({
      platform,
      platformDisplayName: name,
      limitSeconds: 0,
      message: `${name}: ${message}`,
    });
  });

  return { accountIds, warnings, softAccountIds, softWarnings };
}

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
