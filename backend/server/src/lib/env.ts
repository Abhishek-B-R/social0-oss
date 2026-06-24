import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    /** OAuth redirect base — same as frontend NEXT_PUBLIC_APP_URL */
    NEXT_PUBLIC_APP_URL: z.string().url(),
    APP_URL: z.string().url().optional(),
    REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
    PORT: z.coerce.number().default(3001),
    HOST: z.string().default("0.0.0.0"),
    ENCRYPTION_KEY: z.string().min(32),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string(),
    LINKEDIN_CLIENT_ID: z.string().optional(),
    LINKEDIN_CLIENT_SECRET: z.string().optional(),
    INSTAGRAM_CLIENT_ID: z.string().optional(),
    INSTAGRAM_CLIENT_SECRET: z.string().optional(),
    YOUTUBE_CLIENT_ID: z.string().optional(),
    YOUTUBE_CLIENT_SECRET: z.string().optional(),
    TWITTER_CONSUMER_KEY: z.string().optional(),
    TWITTER_CONSUMER_SECRET: z.string().optional(),
    THREADS_CLIENT_ID: z.string().optional(),
    THREADS_CLIENT_SECRET: z.string().optional(),
    PINTEREST_CLIENT_ID: z.string().optional(),
    PINTEREST_CLIENT_SECRET: z.string().optional(),
    TIKTOK_CLIENT_ID: z.string().optional(),
    TIKTOK_CLIENT_SECRET: z.string().optional(),
    FACEBOOK_CLIENT_ID: z.string().optional(),
    FACEBOOK_CLIENT_SECRET: z.string().optional(),
    FACEBOOK_LOGIN_CONFIG_ID: z.string().optional(),
    FACEBOOK_INSTAGRAM_LOGIN_CONFIG_ID: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    ALLOW_TEST_SIGNIN: z.string().optional(),
    TEST_USER_ID: z.string().optional(),
    TEST_USER_EMAIL: z.string().optional(),
    TEST_USER_NAME: z.string().optional(),
    DODO_PAYMENTS_API_KEY: z.string().optional(),
    DODO_PAYMENTS_WEBHOOK_SECRET: z.string().optional(),
    DODO_PAYMENTS_ENVIRONMENT: z
      .enum(["test_mode", "live_mode"])
      .optional(),
    DODO_PAYMENTS_STARTER_PRODUCT_ID: z.string().optional(),
    DODO_PAYMENTS_GROWTH_PRODUCT_ID: z.string().optional(),
    DODO_PAYMENTS_PRO_PRODUCT_ID: z.string().optional(),
    ADMIN_API_KEY: z.string().optional(),
    CANNY_PRIVATE_KEY: z.string().optional(),
    NEXT_PUBLIC_CANNY_BOARD_TOKEN: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_URL: z.string().url().optional(),
    R2_ENDPOINT: z.string().url().optional(),
    WORKER_PUBLISH_CONCURRENCY: z.coerce.number().default(5),
    WORKER_PLATFORM_CONCURRENCY: z.coerce.number().default(20),
    WORKER_EMAIL_CONCURRENCY: z.coerce.number().default(10),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== "production") return;
    if (!data.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "NEXT_PUBLIC_TURNSTILE_SITE_KEY required in production",
        path: ["NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
      });
    }
    if (!data.TURNSTILE_SECRET_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TURNSTILE_SECRET_KEY required in production",
        path: ["TURNSTILE_SECRET_KEY"],
      });
    }
  });

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

export function loadServerEnv(): ServerEnv {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

/** Parsed server env singleton — same shape as frontend `env`. */
export const env = new Proxy({} as ServerEnv, {
  get(_t, prop: string) {
    return loadServerEnv()[prop as keyof ServerEnv];
  },
});

export function appBaseUrl(): string {
  const e = loadServerEnv();
  return e.APP_URL ?? e.NEXT_PUBLIC_APP_URL;
}
