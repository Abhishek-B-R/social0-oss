import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32), // Required by Better Auth for encryption
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(), // For OAuth redirects
  // Platform OAuth credentials (add as needed)
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  INSTAGRAM_CLIENT_ID: z.string().optional(),
  INSTAGRAM_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  TWITTER_CLIENT_ID: z.string().optional(), // Legacy OAuth 2.0 (deprecated)
  TWITTER_CLIENT_SECRET: z.string().optional(), // Legacy OAuth 2.0 (deprecated)
  TWITTER_CONSUMER_KEY: z.string().optional(), // OAuth 1.0a Consumer Key
  TWITTER_CONSUMER_SECRET: z.string().optional(), // OAuth 1.0a Consumer Secret
  THREADS_CLIENT_ID: z.string().optional(),
  THREADS_CLIENT_SECRET: z.string().optional(),
  PINTEREST_CLIENT_ID: z.string().optional(),
  PINTEREST_CLIENT_SECRET: z.string().optional(),
  TIKTOK_CLIENT_ID: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  /** Facebook Login for Business configuration ID (Meta App Dashboard → Facebook Login for Business → Configurations). */
  FACEBOOK_LOGIN_CONFIG_ID: z.string().optional(),
  /** Optional separate config for Instagram-via-Facebook flow; falls back to FACEBOOK_LOGIN_CONFIG_ID. */
  FACEBOOK_INSTAGRAM_LOGIN_CONFIG_ID: z.string().optional(),
  // Encryption key for OAuth state and tokens
  ENCRYPTION_KEY: z.string().min(32), // 32-byte key (64 hex chars)
  // Cloudflare R2 (S3-compatible)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  // Upstash Redis for session cache, rate limiting, and webhooks (optional)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  // Resend (OTP / transactional email)
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string(),
  // Cloudflare Turnstile (sign-up only). For Playwright/local automation use dummy keys:
  // site 1x00000000000000000000AA + secret 1x0000000000000000000000000000000AA (always pass)
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  // Dodo Payments billing
  DODO_PAYMENTS_API_KEY: z.string().optional(),
  DODO_PAYMENTS_WEBHOOK_SECRET: z.string().optional(),
  DODO_PAYMENTS_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).optional(),
  DODO_PAYMENTS_STARTER_PRODUCT_ID: z.string().optional(),
  DODO_PAYMENTS_GROWTH_PRODUCT_ID: z.string().optional(),
  DODO_PAYMENTS_PRO_PRODUCT_ID: z.string().optional(),
  // Canny feedback
  CANNY_PRIVATE_KEY: z.string(),
  NEXT_PUBLIC_CANNY_BOARD_TOKEN: z.string(),
});

export const env = envSchema.parse(process.env);
