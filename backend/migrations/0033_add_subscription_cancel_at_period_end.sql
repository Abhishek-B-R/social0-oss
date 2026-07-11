ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean DEFAULT false;
