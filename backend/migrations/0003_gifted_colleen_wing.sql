ALTER TYPE "public"."platform" ADD VALUE 'facebook';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'devto';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'hashnode';--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD COLUMN "platform_metadata" jsonb;