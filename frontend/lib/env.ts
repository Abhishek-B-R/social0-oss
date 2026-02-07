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
  TWITTER_X_CLIENT_ID: z.string().optional(),
  TWITTER_X_CLIENT_SECRET: z.string().optional(),
  THREADS_CLIENT_ID: z.string().optional(),
  THREADS_CLIENT_SECRET: z.string().optional(),
  MASTODON_CLIENT_ID: z.string().optional(),
  MASTODON_CLIENT_SECRET: z.string().optional(),
  MASTODON_INSTANCE_URL: z.string().url().optional(), // For custom Mastodon instances
  BLUESKY_CLIENT_ID: z.string().optional(),
  BLUESKY_CLIENT_SECRET: z.string().optional(),
  PEERLIST_CLIENT_ID: z.string().optional(),
  PEERLIST_CLIENT_SECRET: z.string().optional(),
  // Encryption key for OAuth state and tokens
  ENCRYPTION_KEY: z.string().min(32), // 32-byte key (64 hex chars)
});

export const env = envSchema.parse(process.env);
