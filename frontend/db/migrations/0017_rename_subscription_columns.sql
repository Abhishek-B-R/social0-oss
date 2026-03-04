-- Rename Polar-named columns to provider-agnostic names (Dodo Payments migration)
ALTER TABLE "user_settings" RENAME COLUMN "polar_subscription_id" TO "subscription_id";--> statement-breakpoint
ALTER TABLE "user_settings" RENAME COLUMN "polar_customer_id" TO "customer_id";
