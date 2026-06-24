-- Publish job tracking for backend v2 SSE + post-refresh recovery
-- Run against the same Neon database as the frontend.

DO $$ BEGIN
  CREATE TYPE publish_job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS publish_jobs (
  tracking_id text PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status publish_job_status NOT NULL DEFAULT 'queued',
  total integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publish_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id text NOT NULL REFERENCES publish_jobs(tracking_id) ON DELETE CASCADE,
  post_id uuid NOT NULL,
  user_id text NOT NULL,
  phase text NOT NULL,
  platform platform,
  connected_account_id uuid,
  message text,
  progress jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS publish_job_events_tracking_id_idx
  ON publish_job_events (tracking_id, created_at);
