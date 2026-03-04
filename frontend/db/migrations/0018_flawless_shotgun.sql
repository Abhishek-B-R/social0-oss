-- Add onboarding fields to user_settings
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "onboarding_goal" text;
