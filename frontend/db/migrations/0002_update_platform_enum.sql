-- Update platform enum: replace 'reddit' with 'instagram'
-- First, drop the old enum and create new one
ALTER TABLE "connected_accounts" ALTER COLUMN "platform" SET DATA TYPE text;
ALTER TABLE "user_settings" ALTER COLUMN "default_platforms" SET DATA TYPE text;

DROP TYPE IF EXISTS "public"."platform";

CREATE TYPE "public"."platform" AS ENUM('linkedin', 'instagram', 'youtube', 'peerlist', 'twitter_x', 'mastodon', 'threads', 'bluesky');

ALTER TABLE "connected_accounts" ALTER COLUMN "platform" SET DATA TYPE "public"."platform" USING "platform"::"public"."platform";
ALTER TABLE "user_settings" ALTER COLUMN "default_platforms" SET DATA TYPE "public"."platform"[] USING "default_platforms"::"public"."platform"[];
