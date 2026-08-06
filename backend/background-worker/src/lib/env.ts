import { z } from "zod";

/** Env for background-worker cron jobs only. */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  UPSTASH_REDIS_URL: z.string().url().optional(),
  ENCRYPTION_KEY: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  APP_URL: z.string().url().optional(),
  TWITTER_CONSUMER_KEY: z.string().optional(),
  TWITTER_CONSUMER_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  TIKTOK_CLIENT_ID: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  DODO_PAYMENTS_API_KEY: z.string().optional(),
  DODO_PAYMENTS_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).optional(),
  DODO_PAYMENTS_STARTER_PRODUCT_ID: z.string().optional(),
  DODO_PAYMENTS_GROWTH_PRODUCT_ID: z.string().optional(),
  DODO_PAYMENTS_PRO_PRODUCT_ID: z.string().optional(),
    DODO_PAYMENTS_MAX_PRODUCT_ID: z.string().optional(),
  DODO_PAYMENTS_STARTER_YEARLY_PRODUCT_ID: z.string().optional(),
  DODO_PAYMENTS_LITE_YEARLY_PRODUCT_ID: z.string().optional(),
  DODO_PAYMENTS_GROWTH_YEARLY_PRODUCT_ID: z.string().optional(),
  DODO_PAYMENTS_PRO_YEARLY_PRODUCT_ID: z.string().optional(),
    DODO_PAYMENTS_MAX_YEARLY_PRODUCT_ID: z.string().optional(),
  DODO_ZOMBIE_SUBSCRIPTION_GRACE_DAYS: z.coerce.number().optional(),
  CRON_SECRET: z.string().optional(),
});

export type WorkerEnv = z.infer<typeof envSchema>;

let cached: WorkerEnv | null = null;

export function loadWorkerEnv(): WorkerEnv {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

/** @deprecated use loadWorkerEnv */
export const env = new Proxy({} as WorkerEnv, {
  get(_target, prop: string) {
    return loadWorkerEnv()[prop as keyof WorkerEnv];
  },
});
