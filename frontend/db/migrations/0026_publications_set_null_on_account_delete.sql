-- Allow post_publications.connected_account_id to be NULL and set FK to ON DELETE SET NULL
-- so when a connected_account is deleted, publication rows are kept with connected_account_id = NULL.
ALTER TABLE "post_publications" ALTER COLUMN "connected_account_id" DROP NOT NULL;
ALTER TABLE "post_publications" DROP CONSTRAINT IF EXISTS "post_publications_connected_account_id_connected_accounts_id_fk";
ALTER TABLE "post_publications" ADD CONSTRAINT "post_publications_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE SET NULL ON UPDATE no action;

-- When connected_account is deleted, delete its rate limit rows (ephemeral data).
ALTER TABLE "platform_rate_limits" DROP CONSTRAINT IF EXISTS "platform_rate_limits_connected_account_id_connected_accounts_id_fk";
ALTER TABLE "platform_rate_limits" ADD CONSTRAINT "platform_rate_limits_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE CASCADE ON UPDATE no action;
