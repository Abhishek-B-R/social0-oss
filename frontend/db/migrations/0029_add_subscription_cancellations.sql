CREATE TABLE IF NOT EXISTS "subscription_cancellations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "subscription_id" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

