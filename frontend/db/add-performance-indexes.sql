-- Performance indexes for Social0
-- Run directly: psql $DATABASE_URL -f db/add-performance-indexes.sql
-- All are CONCURRENTLY so they don't lock tables in production.

-- posts: the two most-queried filter patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_user_status
  ON posts (user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_user_created
  ON posts (user_id, created_at DESC);

-- posts: cron publish-scheduled (status + scheduled_at range scan)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_status_scheduled
  ON posts (status, scheduled_at)
  WHERE status IN ('scheduled', 'publishing');

-- post_publications: join by postId (used in every publications fetch)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_post_id
  ON post_publications (post_id);

-- post_publications: cron publish (status = pending + scheduled join)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_status
  ON post_publications (status)
  WHERE status IN ('pending', 'publishing');

-- post_publications: Twitter tweet-count query (userId via join + platform + status + publishedAt)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_account_status_published
  ON post_publications (connected_account_id, status, published_at)
  WHERE status = 'published';

-- connected_accounts: most common filter (userId + isActive)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ca_user_active
  ON connected_accounts (user_id, is_active);

-- connected_accounts: token-health cron (isActive + lastSyncedAt)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ca_active_last_synced
  ON connected_accounts (is_active, last_synced_at)
  WHERE is_active = true;

-- resurface_events: cron repost (status = pending + nextExecuteAt)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_re_status_next
  ON resurface_events (status, next_execute_at)
  WHERE status = 'pending';

-- resurface_events: prevDone lookup per schedule (batch pre-fetch)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_re_schedule_status_executed
  ON resurface_events (schedule_id, status, executed_at DESC)
  WHERE status = 'done';

-- resurface_schedules: postId lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rs_post_id
  ON resurface_schedules (post_id);

-- auto_plugs: cron autoplug (status = watching)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_status
  ON auto_plugs (status)
  WHERE status = 'watching';

-- auto_plugs: postId lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_post_id
  ON auto_plugs (post_id);

-- queued_posts: scheduled posts queue lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qp_user_status_post
  ON queued_posts (user_id, status, post_id)
  WHERE status = 'pending';
