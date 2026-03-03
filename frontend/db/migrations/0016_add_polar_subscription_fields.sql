-- Add Polar subscription fields to user_settings for billing integration
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "polar_subscription_id" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "polar_customer_id" text;
