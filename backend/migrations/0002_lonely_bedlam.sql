ALTER TABLE "connected_accounts" ALTER COLUMN "platform" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "default_platforms" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."platform";--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('linkedin', 'instagram', 'youtube', 'pinterest', 'tiktok', 'twitter_x', 'threads', 'bluesky');--> statement-breakpoint
ALTER TABLE "connected_accounts" ALTER COLUMN "platform" SET DATA TYPE "public"."platform" USING "platform"::"public"."platform";--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "default_platforms" SET DATA TYPE "public"."platform"[] USING "default_platforms"::"public"."platform"[];