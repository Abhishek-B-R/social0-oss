-- One-time fix: BYOK platforms (bluesky, devto, hashnode) tokens never expire.
-- The token health cron was incorrectly marking them expired on transient API failures.
UPDATE connected_accounts
SET token_status = 'active'
WHERE platform IN ('bluesky', 'devto', 'hashnode');
