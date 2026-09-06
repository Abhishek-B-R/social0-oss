-- Webhook delivery log + denormalized last-attempt summary.
--
-- Additive only: creates one table and four nullable columns. Nothing is
-- dropped or rewritten, so it is safe to run against a live database and
-- safe to re-run (IF NOT EXISTS throughout).
--
-- Rollback: DROP TABLE webhook_deliveries; and drop the four columns.

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
