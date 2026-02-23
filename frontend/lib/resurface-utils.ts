/**
 * Auto-Repost is only supported on X (Twitter) for now.
 * Restrict UI to X only; add more when backend/cron support them.
 */
export const RESURFACE_PLATFORMS = ["twitter_x"] as const;

export type ResurfacePlatformId = (typeof RESURFACE_PLATFORMS)[number];

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  twitter_x: "X",
  threads: "Threads",
  bluesky: "Bluesky",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

export type ConnectedAccountLike = { id: string; platform: string };

/**
 * Returns the list of platform IDs that support auto-repost among the selected accounts.
 * Only render Auto-Repost panel when this list is non-empty.
 */
export function getResurfacePlatforms(
  selectedAccountIds: string[],
  allAccounts: ConnectedAccountLike[],
): string[] {
  const selectedSet = new Set(selectedAccountIds);
  const platformSet = new Set<string>();
  for (const a of allAccounts) {
    if (selectedSet.has(a.id) && RESURFACE_PLATFORMS.includes(a.platform as ResurfacePlatformId)) {
      platformSet.add(a.platform);
    }
  }
  return [...platformSet];
}

/**
 * Human-readable list of platform names for the selected repost platforms.
 */
export function getResurfacePlatformLabels(
  selectedAccountIds: string[],
  allAccounts: ConnectedAccountLike[],
): string[] {
  return getResurfacePlatforms(selectedAccountIds, allAccounts).map(
    (id) => PLATFORM_DISPLAY_NAMES[id] ?? id,
  );
}

/**
 * Auto-repost can only be added within 1 day of the post going live.
 */
const RESURFACE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinResurfaceWindow(publishedAt: Date): boolean {
  return Date.now() - new Date(publishedAt).getTime() < RESURFACE_WINDOW_MS;
}

/**
 * Backend currently only supports X. Use this when calling createResurfaceSchedule.
 */
export function getResurfacePlatformForApi(platform: string): string {
  return platform === "twitter_x" ? "x" : platform;
}

/** Auto-Plug: only allow adding within 6 hours of post going live. */
const AUTO_PLUG_WINDOW_MS = 6 * 60 * 60 * 1000;

export function isWithinAutoPlugWindow(publishedAt: Date): boolean {
  return Date.now() - new Date(publishedAt).getTime() < AUTO_PLUG_WINDOW_MS;
}
