-- Remove Dev.to and Hashnode: delete any connected_accounts and related data, then recreate platform enum without them
DELETE FROM post_publications WHERE connected_account_id IN (SELECT id FROM connected_accounts WHERE platform::text IN ('devto', 'hashnode'));
--> statement-breakpoint
DELETE FROM connected_accounts WHERE platform::text IN ('devto', 'hashnode');
--> statement-breakpoint
ALTER TABLE "connected_accounts" ALTER COLUMN "platform" SET DATA TYPE text USING platform::text;
--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "default_platforms" SET DATA TYPE text[] USING "default_platforms"::text[];
--> statement-breakpoint
UPDATE user_settings SET default_platforms = COALESCE((SELECT array_agg(x) FROM unnest(default_platforms) x WHERE x NOT IN ('devto', 'hashnode')), ARRAY[]::text[]) WHERE default_platforms && ARRAY['devto', 'hashnode']::text[];
--> statement-breakpoint
DROP TYPE "platform";
--> statement-breakpoint
CREATE TYPE "platform" AS ENUM('linkedin', 'instagram', 'youtube', 'pinterest', 'tiktok', 'twitter_x', 'threads', 'bluesky', 'facebook');
--> statement-breakpoint
ALTER TABLE "connected_accounts" ALTER COLUMN "platform" SET DATA TYPE "platform" USING platform::"platform";
--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "default_platforms" SET DATA TYPE "platform"[] USING default_platforms::text[]::"platform"[];
