import { SUPPORTED_PLATFORMS } from "./platforms.js";

/**
 * `PUBLISH_DISPATCH=server`: no Cloudflare publish worker, every platform
 * publishes on the API process (the path X and TikTok always use).
 *
 * `bullmq` is the old name for running without Cloudflare. It enqueued to
 * `platform-publish-*` BullMQ queues that nothing in this repository consumed,
 * so those publishes never ran; it now means `server`.
 */
export function publishesEverythingOnServer(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const mode = env.PUBLISH_DISPATCH?.trim();
  return mode === "server" || mode === "bullmq";
}

/**
 * Platforms forced onto the Node API instead of the CF publish worker.
 *
 * - twitter_x: chunked video upload is not reliable on the worker fetch/OAuth path.
 *   Set TWITTER_PUBLISH_ON_CF=1 to send X to CF.
 * - tiktok: public video ids are 64-bit ints; URL resolution + longer status polling
 *   must run the current API build. CF worker bundles go stale until redeployed.
 *   Set TIKTOK_PUBLISH_ON_CF=1 to send TikTok to CF after the worker is updated.
 * - bluesky: Bluesky caps each image at 1 MB, so most phone photos have to be
 *   re-encoded with sharp before upload. sharp is native and the worker aliases
 *   it to a stub that throws, so on CF those images were dropped or failed the
 *   post. Set BLUESKY_PUBLISH_ON_CF=1 only once the worker can compress images.
 */
export function getServerSidePublishPlatforms(): Set<string> {
  if (publishesEverythingOnServer()) return new Set<string>(SUPPORTED_PLATFORMS);
  const platforms = new Set<string>();
  if (process.env.TWITTER_PUBLISH_ON_CF !== "1") {
    platforms.add("twitter_x");
  }
  if (process.env.TIKTOK_PUBLISH_ON_CF !== "1") {
    platforms.add("tiktok");
  }
  if (process.env.BLUESKY_PUBLISH_ON_CF !== "1") {
    platforms.add("bluesky");
  }
  return platforms;
}

/** @deprecated Prefer getServerSidePublishPlatforms() - respects kill switches. */
export const SERVER_SIDE_PUBLISH_PLATFORMS = {
  has(platform: string): boolean {
    return getServerSidePublishPlatforms().has(platform);
  },
};
