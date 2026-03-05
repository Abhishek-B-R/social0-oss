-- Add is_twitter_premium to connected_accounts (true for X Premium, false for others)
ALTER TABLE "connected_accounts" ADD COLUMN IF NOT EXISTS "is_twitter_premium" boolean DEFAULT false;
