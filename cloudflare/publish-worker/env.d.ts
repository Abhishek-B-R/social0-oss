/** Secrets / vars — set via `wrangler secret put` or `.dev.vars`. */
interface Env {
  PUBLISH_HMAC_SECRET: string;
  ENCRYPTION_KEY: string;
  APP_URL: string;
  HYPERDRIVE: Hyperdrive;
  PUBLISH_NOW_QUEUE: Queue;
  PUBLISH_SCHEDULED_QUEUE: Queue;
  R2_PUBLIC_URL?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_ENDPOINT?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  INSTAGRAM_CLIENT_ID?: string;
  INSTAGRAM_CLIENT_SECRET?: string;
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  TWITTER_CONSUMER_KEY?: string;
  TWITTER_CONSUMER_SECRET?: string;
  THREADS_CLIENT_ID?: string;
  THREADS_CLIENT_SECRET?: string;
  PINTEREST_CLIENT_ID?: string;
  PINTEREST_CLIENT_SECRET?: string;
  TIKTOK_CLIENT_ID?: string;
  TIKTOK_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
}
