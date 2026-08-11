/** Inject CF Worker secrets into process.env before loading publish executor code. */
export function bootstrapWorkerRuntime(env: Env): void {
  // pg → detect-libc calls process.report.getReport(); unenv's stub throws.
  // Return an empty report so libc detection falls through safely on Workers.
  const report = {
    excludeNetwork: false,
    getReport: () => ({}),
    writeReport: () => undefined,
  };
  try {
    Object.defineProperty(process, "report", {
      value: report,
      configurable: true,
      writable: true,
    });
  } catch {
    (process as unknown as { report?: typeof report }).report = report;
  }

  // Publish path only needs DB + encryption + platform OAuth + R2.
  // loadServerEnv() still parses the full server schema, so stub unused auth/billing keys.
  // Don't assign process.env.NODE_ENV — wrangler defines it as a compile-time constant.
  process.env.SOCIAL0_PUBLISH_WORKER = "1";
  process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
  process.env.ENCRYPTION_KEY = env.ENCRYPTION_KEY;
  process.env.NEXT_PUBLIC_APP_URL = env.APP_URL;
  process.env.APP_URL = env.APP_URL;
  process.env.BETTER_AUTH_URL = env.APP_URL;
  process.env.BETTER_AUTH_SECRET =
    env.BETTER_AUTH_SECRET ?? env.ENCRYPTION_KEY;
  process.env.GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID ?? "worker-unused";
  process.env.GOOGLE_CLIENT_SECRET =
    env.GOOGLE_CLIENT_SECRET ?? "worker-unused";
  process.env.RESEND_API_KEY = env.RESEND_API_KEY ?? "worker-unused";
  process.env.RESEND_FROM_EMAIL =
    env.RESEND_FROM_EMAIL ?? "abhishek from social0 <abhishek@social0.app>";
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "worker-unused") {
    console.error(
      "[publish-worker] RESEND_API_KEY missing — post-failure emails will fail until you set the secret",
    );
  }

  // Production schema refinements (unused on this Worker path).
  process.env.CRON_SECRET = env.CRON_SECRET ?? "worker-unused-cron-secret";
  process.env.ADMIN_API_KEY =
    env.ADMIN_API_KEY ?? "worker-unused-admin-api-key";
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY =
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "worker-unused";
  process.env.TURNSTILE_SECRET_KEY =
    env.TURNSTILE_SECRET_KEY ?? "worker-unused";
  process.env.DODO_PAYMENTS_WEBHOOK_SECRET =
    env.DODO_PAYMENTS_WEBHOOK_SECRET ?? "worker-unused";

  // loadServerEnv() requires these keys; publish worker does not use Redis.
  process.env.UPSTASH_REDIS_REST_URL =
    env.UPSTASH_REDIS_REST_URL ?? "https://worker-unused.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN =
    env.UPSTASH_REDIS_REST_TOKEN ?? "worker-unused-redis-token";

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
