-- Ensure user table has email, email_verified, created_at, updated_at (for support/billing and Better Auth).
-- Safe to run: uses IF NOT EXISTS so existing columns are unchanged.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS email_verified boolean;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS created_at timestamp;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS updated_at timestamp;
