-- Auto-Plug: milestone-based reply (e.g. when post hits 100 likes)
CREATE TABLE IF NOT EXISTS "auto_plugs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "connected_account_id" uuid NOT NULL REFERENCES "connected_accounts"("id") ON DELETE CASCADE,
  "platform" text DEFAULT 'x' NOT NULL,
  "metric_type" text NOT NULL,
  "metric_threshold" integer NOT NULL,
  "plug_comment" text NOT NULL,
  "status" text NOT NULL,
  "platform_post_id" text NOT NULL,
  "plug_tweet_id" text,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
