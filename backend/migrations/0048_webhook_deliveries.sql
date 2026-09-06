-- Webhook delivery log + denormalized last-attempt summary.
--
-- Additive only: creates one table and four nullable columns. Nothing is
-- dropped or rewritten, so it is safe to run against a live database and
-- safe to re-run (IF NOT EXISTS throughout).
--
-- Rollback: DROP TABLE webhook_deliveries; and drop the four columns.

-- api_keys and user_webhook_subscriptions are created by
-- 20260711_api_keys.sql, which is NOT in meta/_journal.json — it was applied
-- out of band, so `drizzle-kit migrate` never runs it. This is the first
-- journaled migration to depend on those tables, so without the block below a
-- brand-new database fails here with
--   ERROR: relation "user_webhook_subscriptions" does not exist
-- and the whole bootstrap stops. Re-stating them idempotently keeps
-- `npm run db:migrate` working from scratch and is a no-op everywhere the
-- out-of-band file already ran.
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_webhook_subscriptions_user_id_idx
  ON user_webhook_subscriptions(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL
    REFERENCES user_webhook_subscriptions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL,
  event TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  response_status INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS webhook_deliveries_subscription_created_idx
  ON webhook_deliveries(subscription_id, created_at);
--> statement-breakpoint
ALTER TABLE user_webhook_subscriptions
  ADD COLUMN IF NOT EXISTS last_delivery_at TIMESTAMP;
--> statement-breakpoint
ALTER TABLE user_webhook_subscriptions
  ADD COLUMN IF NOT EXISTS last_delivery_status TEXT;
--> statement-breakpoint
ALTER TABLE user_webhook_subscriptions
  ADD COLUMN IF NOT EXISTS last_delivery_response_status INTEGER;
--> statement-breakpoint
ALTER TABLE user_webhook_subscriptions
  ADD COLUMN IF NOT EXISTS last_delivery_error TEXT;
