/**
 * Platforms forced onto the Node API instead of the CF publish worker.
 * Default: twitter_x stays on the API - chunked video upload is not reliable on
 * the worker fetch/OAuth path. Set TWITTER_PUBLISH_ON_CF=1 to send X to CF.
 */
export function getServerSidePublishPlatforms(): Set<string> {
  if (process.env.TWITTER_PUBLISH_ON_CF === "1") {
    return new Set();
  }
  return new Set(["twitter_x"]);
}

/** @deprecated Prefer getServerSidePublishPlatforms() - respects kill switch. */
export const SERVER_SIDE_PUBLISH_PLATFORMS = {
  has(platform: string): boolean {
    return getServerSidePublishPlatforms().has(platform);
  },
};
