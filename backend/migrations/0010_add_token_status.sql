-- Add token_status to connected_accounts for token health check (active | expired | unknown)
ALTER TABLE connected_accounts
ADD COLUMN IF NOT EXISTS token_status text DEFAULT 'active';
