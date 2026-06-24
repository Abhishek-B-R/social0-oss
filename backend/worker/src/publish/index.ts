import type { SupportedPlatform } from "@social0/shared";
import type { PublishContext, PublishResult } from "./types.js";
import {
  publishBluesky,
  publishFacebook,
  publishInstagram,
  publishLinkedIn,
  publishPinterest,
  publishThreads,
  publishTikTok,
  publishTwitter,
  publishYouTube,
} from "./platforms/index.js";

type PlatformHandler = (ctx: PublishContext) => Promise<PublishResult>;

const handlers: Record<SupportedPlatform, PlatformHandler> = {
  linkedin: publishLinkedIn,
  facebook: publishFacebook,
  instagram: publishInstagram,
  youtube: publishYouTube,
  pinterest: publishPinterest,
  tiktok: publishTikTok,
  twitter: publishTwitter,
  threads: publishThreads,
  bluesky: publishBluesky,
};

/**
 * Platform publish entry — port logic from `frontend/lib/publish-platform.ts`.
 * Each handler loads tokens from DB/env and calls the platform API (1–2.5 min).
 */
export async function publishToPlatform(
  ctx: PublishContext,
): Promise<PublishResult> {
  const handler = handlers[ctx.platform];
  if (!handler) {
    return { success: false, error: `Unsupported platform: ${ctx.platform}` };
  }
  return handler(ctx);
}
