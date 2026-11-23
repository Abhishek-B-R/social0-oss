-- Database-level guarantees for races the app could only narrow, plus the
-- indexes the hot publication and cron queries were missing.
--
-- Additive only: two unique indexes, two plain indexes, one nullable column
-- and a trigger. IF NOT EXISTS / OR REPLACE throughout, so it is safe to
-- re-run.
--
-- BEFORE RUNNING ON PRODUCTION, both of these must return zero rows, or the
-- unique indexes fail and the whole migration rolls back:
--   SELECT subscription_id, count(*) FROM user_settings
--     WHERE subscription_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--   SELECT connected_account_id, platform_post_id, count(*) FROM post_publications
--     WHERE platform_post_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1;
--
-- No CONCURRENTLY: drizzle-kit runs migrations in a transaction, and these
-- tables are small enough that the brief lock is fine.
--
-- Rollback: DROP the four indexes, DROP TRIGGER user_settings_subscription_updated_at
-- ON user_settings, DROP FUNCTION set_subscription_updated_at(), and
-- ALTER TABLE user_settings DROP COLUMN subscription_updated_at.

-- One subscription belongs to one user. The webhook's NOT EXISTS check can
-- still race when two users claim the same subscription at once.
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_subscription_id_unique
  ON user_settings (subscription_id)
  WHERE subscription_id IS NOT NULL;
--> statement-breakpoint

-- One platform post id per account. Two concurrent TikTok backfills could
-- otherwise give two publications the same video.
CREATE UNIQUE INDEX IF NOT EXISTS post_publications_account_platform_post_unique
  ON post_publications (connected_account_id, platform_post_id)
  WHERE platform_post_id IS NOT NULL;
--> statement-breakpoint

-- Queries that filter on connected_account_id alone (Accounts "Last post",
-- Home reconnect check, account publication count, TikTok backfill, and the
-- ON DELETE SET NULL from connected_accounts) cannot use the
-- (post_id, connected_account_id) unique index.
CREATE INDEX IF NOT EXISTS post_publications_connected_account_published_idx
  ON post_publications (connected_account_id, published_at DESC);
--> statement-breakpoint

-- The every-minute scheduled-publish scan.
CREATE INDEX IF NOT EXISTS posts_status_scheduled_at_idx
  ON posts (status, scheduled_at)
  WHERE status IN ('scheduled', 'publishing');
--> statement-breakpoint

-- When the plan (tier or subscription) last changed. The upgrade guard only
-- accepts a payment made after this, so an old charge cannot unlock a tier
-- again after a downgrade. Kept by a trigger so no write path can forget it.
-- Null on existing rows means "unknown", and the guard then behaves as before.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION set_subscription_updated_at() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.subscription_id IS NOT NULL
       OR COALESCE(NEW.subscription_tier, 'free') <> 'free' THEN
      NEW.subscription_updated_at := now();
    END IF;
  ELSIF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id THEN
    NEW.subscription_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS user_settings_subscription_updated_at ON user_settings;
--> statement-breakpoint

CREATE TRIGGER user_settings_subscription_updated_at
  BEFORE INSERT OR UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_subscription_updated_at();
