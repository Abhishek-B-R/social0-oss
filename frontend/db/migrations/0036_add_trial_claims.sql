-- One free trial per normalized billing email (Gmail alias-safe), forever.
CREATE TABLE IF NOT EXISTS "trial_claims" (
  "normalized_email" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "customer_id" text,
  "claimed_at" timestamp DEFAULT now() NOT NULL
);

-- Backfill from existing has_used_trial flags (exact email; app normalizes Gmail on new claims).
INSERT INTO "trial_claims" ("normalized_email", "user_id", "claimed_at")
SELECT LOWER(TRIM(u.email)), us.user_id, COALESCE(us.subscription_expires_at, NOW())
FROM "user_settings" us
JOIN "user" u ON u.id = us.user_id
WHERE us.has_used_trial = true
  AND u.email IS NOT NULL
  AND TRIM(u.email) <> ''
ON CONFLICT ("normalized_email") DO NOTHING;
