export type UpstashRedisConfig = {
  restUrl: string;
  restToken: string;
  /** ioredis / BullMQ connection URL (Redis protocol over TLS). */
  redisUrl: string;
};

type UpstashEnv = {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  /** Optional override - copy from Upstash console "Redis Connect" tab. */
  UPSTASH_REDIS_URL?: string;
};

function deriveIoredisUrl(restUrl: string, token: string): string {
  const host = new URL(restUrl).hostname;
  return `rediss://default:${encodeURIComponent(token)}@${host}:6379`;
}

/** Resolve one Upstash database for REST (@upstash/redis) and BullMQ (ioredis). */
export function resolveUpstashRedisConfig(env: UpstashEnv): UpstashRedisConfig {
  const restUrl = env.UPSTASH_REDIS_REST_URL?.trim();
  const restToken = env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!restUrl || !restToken) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required. " +
        "Create a database at https://console.upstash.com and add both to backend/.env",
    );
  }

  const redisUrl =
    env.UPSTASH_REDIS_URL?.trim() || deriveIoredisUrl(restUrl, restToken);

  return { restUrl, restToken, redisUrl };
}
