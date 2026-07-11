-- Publish job tracking for SSE progress + post-refresh recovery (backend v2 / CF workers)
DO $$ BEGIN
  CREATE TYPE "public"."publish_job_status" AS ENUM('queued', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publish_jobs" (
	"tracking_id" text PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "publish_job_status" DEFAULT 'queued' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publish_job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracking_id" text NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"phase" text NOT NULL,
	"platform" "platform",
	"connected_account_id" uuid,
	"message" text,
	"progress" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "publish_job_events" ADD CONSTRAINT "publish_job_events_tracking_id_publish_jobs_tracking_id_fk" FOREIGN KEY ("tracking_id") REFERENCES "public"."publish_jobs"("tracking_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publish_job_events_tracking_id_idx" ON "publish_job_events" USING btree ("tracking_id","created_at");
