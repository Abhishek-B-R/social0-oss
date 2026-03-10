-- Add failure_reason to posts for when status is failed (e.g. payment required, Twitter limit)
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "failure_reason" text;
