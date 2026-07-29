/**
 * Platforms forced onto the Node API instead of the CF publish worker.
 * Default: empty (X uses fetch+OAuth on CF).
 * Kill switch: TWITTER_PUBLISH_ON_API=1 routes twitter_x back to the API VM.
 */
export function getServerSidePublishPlatforms(): Set<string> {
  if (process.env.TWITTER_PUBLISH_ON_API === "1") {
    return new Set(["twitter_x"]);
  }
  return new Set();
}

/** @deprecated Prefer getServerSidePublishPlatforms() — respects kill switch. */
export const SERVER_SIDE_PUBLISH_PLATFORMS = {
  has(platform: string): boolean {
    return getServerSidePublishPlatforms().has(platform);
  },
};
