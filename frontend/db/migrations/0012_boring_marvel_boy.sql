ALTER TABLE "user_settings" ADD COLUMN "automation_emails" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "use_filename_as_caption" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "use_24_hour_time_format" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "weekly_posting_goal" integer DEFAULT 3;
