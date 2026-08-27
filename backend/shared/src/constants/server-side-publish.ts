/**
 * Platforms forced onto the Node API instead of the CF publish worker.
 *
 * - twitter_x: chunked video upload is not reliable on the worker fetch/OAuth path.
 *   Set TWITTER_PUBLISH_ON_CF=1 to send X to CF.
 * - tiktok: public video ids are 64-bit ints; URL resolution + longer status polling
 *   must run the current API build. CF worker bundles go stale until redeployed.
 *   Set TIKTOK_PUBLISH_ON_CF=1 to send TikTok to CF after the worker is updated.
 */
export function getServerSidePublishPlatforms(): Set<string> {
  const platforms = new Set<string>();
  if (process.env.TWITTER_PUBLISH_ON_CF !== "1") {
    platforms.add("twitter_x");
  }
  if (process.env.TIKTOK_PUBLISH_ON_CF !== "1") {
    platforms.add("tiktok");
  }
  return platforms;
}

/** @deprecated Prefer getServerSidePublishPlatforms() - respects kill switches. */
export const SERVER_SIDE_PUBLISH_PLATFORMS = {
  has(platform: string): boolean {
    return getServerSidePublishPlatforms().has(platform);
  },
};
