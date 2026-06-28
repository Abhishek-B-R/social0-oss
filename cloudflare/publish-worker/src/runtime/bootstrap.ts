/** Inject CF Worker secrets into process.env before loading publish executor code. */
export function bootstrapWorkerRuntime(env: Env): void {
  process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
  process.env.ENCRYPTION_KEY = env.ENCRYPTION_KEY;
  process.env.NEXT_PUBLIC_APP_URL = env.APP_URL;
  process.env.APP_URL = env.APP_URL;

  // Worker env schema requires Upstash even though CF path writes progress to Postgres.
  process.env.UPSTASH_REDIS_REST_URL =
    env.UPSTASH_REDIS_REST_URL ?? "https://placeholder.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN =
    env.UPSTASH_REDIS_REST_TOKEN ?? "placeholder-token";

  if (env.R2_PUBLIC_URL) process.env.R2_PUBLIC_URL = env.R2_PUBLIC_URL;
  if (env.R2_ACCOUNT_ID) process.env.R2_ACCOUNT_ID = env.R2_ACCOUNT_ID;
  if (env.R2_ACCESS_KEY_ID) process.env.R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
  if (env.R2_SECRET_ACCESS_KEY) {
    process.env.R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
  }
  if (env.R2_BUCKET_NAME) process.env.R2_BUCKET_NAME = env.R2_BUCKET_NAME;
  if (env.R2_ENDPOINT) process.env.R2_ENDPOINT = env.R2_ENDPOINT;

  const oauthKeys = [
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
    "INSTAGRAM_CLIENT_ID",
    "INSTAGRAM_CLIENT_SECRET",
    "YOUTUBE_CLIENT_ID",
    "YOUTUBE_CLIENT_SECRET",
    "TWITTER_CONSUMER_KEY",
    "TWITTER_CONSUMER_SECRET",
    "THREADS_CLIENT_ID",
    "THREADS_CLIENT_SECRET",
    "PINTEREST_CLIENT_ID",
    "PINTEREST_CLIENT_SECRET",
    "TIKTOK_CLIENT_ID",
    "TIKTOK_CLIENT_SECRET",
    "FACEBOOK_CLIENT_ID",
    "FACEBOOK_CLIENT_SECRET",
  ] as const;

  for (const key of oauthKeys) {
    const value = env[key as keyof Env];
    if (typeof value === "string" && value) {
      process.env[key] = value;
    }
  }
}
