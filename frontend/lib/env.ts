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
  // Encryption key for OAuth state and tokens
  ENCRYPTION_KEY: z.string().min(32), // 32-byte key (64 hex chars)
  // Cloudflare R2 (S3-compatible)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  // Upstash Redis for rate limiting (optional — rate limiting is skipped if not set)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
