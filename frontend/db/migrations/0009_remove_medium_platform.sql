-- Remove Medium platform: delete any connected_accounts with platform='medium' before altering enum
DELETE FROM connected_accounts WHERE platform = 'medium';
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
ALTER TABLE "user_settings" ALTER COLUMN "default_platforms" SET DATA TYPE "platform"[] USING (SELECT COALESCE(array_agg(x::"platform"), ARRAY[]::"platform"[]) FROM unnest(default_platforms) AS x WHERE x <> 'medium');
