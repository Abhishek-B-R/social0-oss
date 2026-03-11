-- Add platform_account_type to connected_accounts ('personal' | 'company'); default 'personal'
ALTER TABLE "connected_accounts" ADD COLUMN IF NOT EXISTS "platform_account_type" text DEFAULT 'personal';
