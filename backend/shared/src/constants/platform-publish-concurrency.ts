/**
 * Max concurrent in-flight publishes per platform across the fleet.
 * Enforced via Redis semaphore in the CF publish worker / API path.
 */
export const PLATFORM_PUBLISH_CONCURRENCY: Record<string, number> = {
  twitter_x: 2,
  linkedin: 3,
  instagram: 2,
  facebook: 3,
  threads: 2,
  youtube: 2,
  tiktok: 2,
  pinterest: 2,
  bluesky: 3,
};

export function maxConcurrentPublishesForPlatform(platform: string): number {
  return PLATFORM_PUBLISH_CONCURRENCY[platform] ?? 3;
}
