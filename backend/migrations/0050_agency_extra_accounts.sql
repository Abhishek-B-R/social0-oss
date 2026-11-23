-- Agency plan: accounts paid above the 59 included (Dodo extra-account add-on
-- quantity). Additive, defaults to 0, touches no existing value.
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "extra_accounts" integer DEFAULT 0 NOT NULL;
