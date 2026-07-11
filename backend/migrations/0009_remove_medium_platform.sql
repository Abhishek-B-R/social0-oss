-- Remove Medium platform: delete any connected_accounts with platform='medium' before altering enum
-- Use ::text so we don't require 'medium' to still be in the enum (handles re-runs / partial state)
DELETE FROM connected_accounts WHERE platform::text = 'medium';
--> statement-breakpoint
ALTER TABLE "connected_accounts" ALTER COLUMN "platform" SET DATA TYPE text USING platform::text;
--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "default_platforms" SET DATA TYPE text[] USING "default_platforms"::text[];
--> statement-breakpoint
DROP TYPE "platform";
--> statement-breakpoint
CREATE TYPE "platform" AS ENUM('linkedin', 'instagram', 'youtube', 'pinterest', 'tiktok', 'twitter_x', 'threads', 'bluesky', 'facebook', 'devto', 'hashnode');
--> statement-breakpoint
ALTER TABLE "connected_accounts" ALTER COLUMN "platform" SET DATA TYPE "platform" USING platform::"platform";
--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "default_platforms" SET DATA TYPE "platform"[] USING default_platforms::text[]::"platform"[];
