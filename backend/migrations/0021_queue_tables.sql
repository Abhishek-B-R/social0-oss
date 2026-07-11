-- Queue system: recurring weekly slots and queued posts
CREATE TABLE IF NOT EXISTS "queue_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "day_of_week" integer NOT NULL,
  "hour" integer NOT NULL,
  "minute" integer NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "queued_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "slot_id" uuid REFERENCES "queue_slots"("id") ON DELETE SET NULL,
  "scheduled_for" timestamp NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "queue_slots_user_id_idx" ON "queue_slots" ("user_id");
CREATE INDEX IF NOT EXISTS "queued_posts_user_id_idx" ON "queued_posts" ("user_id");
CREATE INDEX IF NOT EXISTS "queued_posts_scheduled_for_status_idx" ON "queued_posts" ("scheduled_for", "status");
