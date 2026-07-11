-- Auto-Resurface (X/Twitter): retweet own post at intervals
CREATE TABLE IF NOT EXISTS "resurface_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "platform" text NOT NULL,
  "interval_hours" integer NOT NULL,
  "max_resurfaces" integer NOT NULL,
  "plug_comment" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "resurfaces_done" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "resurface_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schedule_id" uuid NOT NULL REFERENCES "resurface_schedules"("id") ON DELETE CASCADE,
  "platform_reshare_id" text,
  "plug_comment_id" text,
  "executed_at" timestamp,
  "next_execute_at" timestamp,
  "status" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);
