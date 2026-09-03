/**
 * Flip a platform to `true` when App Review / API access is live.
 * False = skip live fetch, no reconnect nag.
 * SPA lists come from analytics.listAccounts / inbox.listAccounts - do not duplicate this map in frontend/.
 *
 * inboxComments: omit TikTok / Pinterest (no public comments API).
 * inboxDms: TikTok needs Business Messaging (separate from Login Kit); may fail for many accounts.
 */
import type { Platform } from "./platforms.js";

export type LiveFeature = "analytics" | "inboxComments" | "inboxDms";

export const LIVE_PLATFORMS: Record<
  LiveFeature,
  Partial<Record<Platform, boolean>>
> = {
  analytics: {
    instagram: true,
    facebook: true,
    threads: true,
    youtube: true,
    twitter_x: true,
    bluesky: true,
    linkedin: true,
    tiktok: true,
    pinterest: true,
  },
  inboxComments: {
    instagram: true,
    facebook: true,
    threads: true,
    youtube: true,
    twitter_x: true,
    bluesky: true,
    linkedin: true,
  },
  inboxDms: {
    twitter_x: true,
    bluesky: true,
    tiktok: true,
  },
};

export function isPlatformLive(
  feature: LiveFeature,
  platform: string,
): boolean {
  return LIVE_PLATFORMS[feature][platform as Platform] === true;
}

export function livePlatformIds(feature: LiveFeature): Platform[] {
  return (
    Object.entries(LIVE_PLATFORMS[feature]) as [Platform, boolean | undefined][]
  )
    .filter(([, on]) => on)
    .map(([id]) => id);
}
