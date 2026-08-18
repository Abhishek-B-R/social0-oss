/**
 * Flip a platform to `true` when App Review / API access is live.
 * False = skip live fetch, no reconnect nag.
 * SPA lists come from analytics.listAccounts / inbox.listAccounts — do not duplicate this map in frontend/.
 */
import type { Platform } from "./platforms.js";

export type LiveFeature = "analytics" | "inboxComments" | "inboxDms";

export const LIVE_PLATFORMS: Record<LiveFeature, Partial<Record<Platform, boolean>>> = {
  analytics: {
    instagram: false,
    facebook: false,
    threads: false,
    youtube: false,
    twitter_x: true,
    bluesky: true,
    linkedin: false,
    tiktok: false,
    pinterest: false,
  },
  inboxComments: {
    instagram: false,
    facebook: false,
    threads: false,
    youtube: false,
    twitter_x: true,
    bluesky: true,
    linkedin: false,
    tiktok: false,
    pinterest: false,
  },
  inboxDms: {
    instagram: false,
    twitter_x: true,
    bluesky: true,
    tiktok: false,
  },
};

export function isPlatformLive(feature: LiveFeature, platform: string): boolean {
  return LIVE_PLATFORMS[feature][platform as Platform] === true;
}

export function livePlatformIds(feature: LiveFeature): Platform[] {
  return (Object.entries(LIVE_PLATFORMS[feature]) as [Platform, boolean | undefined][])
    .filter(([, on]) => on)
    .map(([id]) => id);
}
