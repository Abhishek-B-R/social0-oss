/** Secrets / vars — set via `wrangler secret put` or `.dev.vars`. */
interface Env {
  /** loadServerEnv() stubs — not used on the publish path */
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  CRON_SECRET?: string;
  ADMIN_API_KEY?: string;
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  DODO_PAYMENTS_WEBHOOK_SECRET?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_ENDPOINT?: string;
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
