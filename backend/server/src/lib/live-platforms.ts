/**
 * Flip a platform to `true` when App Review / API access is live.
 * False = skip live fetch, no reconnect nag.
 * SPA lists come from analytics.listAccounts / inbox.listAccounts - do not duplicate this map in frontend/.
 *
 * inboxComments: omit TikTok / Pinterest (no public comments API).
 * inboxDms: TikTok Business Messaging is not production-ready - keep off until BM works.
 */
import type { Platform } from "./platforms.js";

export type LiveFeature = "analytics" | "inboxComments" | "inboxDms";

export const LIVE_PLATFORMS: Record<
  LiveFeature,
  Partial<Record<Platform, boolean>>
> = {
  analytics: {
    // Instagram insights still rejected — keep gated until App Review passes
    instagram: false,
    // Meta App Review approved (read_insights / threads_manage_insights)
    facebook: true,
    threads: true,
    // Google OAuth verified
    youtube: true,
    twitter_x: true,
    bluesky: true,
    // LinkedIn MDP / organic analytics not ready
    linkedin: false,
    // Login Kit scopes approved (video.list etc.)
    tiktok: true,
    // No extra App Review needed for pin analytics
    pinterest: true,
  },
  inboxComments: {
    // Instagram comments still rejected — keep gated until App Review passes
    instagram: false,
    // Meta App Review approved (pages_manage_engagement; Threads replies already on connect)
    facebook: true,
    threads: true,
    // youtube.force-ssl verified
    youtube: true,
    twitter_x: true,
    bluesky: true,
    linkedin: false,
  },
  inboxDms: {
    twitter_x: true,
    bluesky: true,
    // Needs Business Messaging product - not Login Kit
    tiktok: false,
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
