-- Permanent flag: true once user has ever had a paid plan (trial or paid).
-- Used to show "Start 3-day trial" vs "Upgrade to a plan" when limit is 0.
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "has_used_trial" boolean DEFAULT false;
