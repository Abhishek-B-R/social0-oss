-- Multi-workspace: allow multiple owned workspaces; scope connections per workspace.

DROP INDEX IF EXISTS "workspaces_owner_user_id_unique";
ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_owner_user_id_unique";

CREATE INDEX IF NOT EXISTS "workspaces_owner_user_id_idx" ON "workspaces" ("owner_user_id");

ALTER TABLE "connected_accounts" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "connected_accounts" DROP CONSTRAINT IF EXISTS "connected_accounts_workspace_id_workspaces_id_fk";
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connected_accounts" DROP CONSTRAINT IF EXISTS "connected_accounts_user_id_platform_platform_user_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connected_accounts_personal_unique"
  ON "connected_accounts" ("user_id", "platform", "platform_user_id")
  WHERE "workspace_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connected_accounts_workspace_unique"
  ON "connected_accounts" ("workspace_id", "platform", "platform_user_id")
  WHERE "workspace_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_accounts_workspace_id_idx" ON "connected_accounts" ("workspace_id");
--> statement-breakpoint
-- Move personal connections into the owner's sole workspace (legacy Teams users).
UPDATE "connected_accounts" AS ca
SET "workspace_id" = w."id"
FROM "workspaces" AS w
WHERE ca."user_id" = w."owner_user_id"
  AND ca."workspace_id" IS NULL
  AND (
    SELECT COUNT(*)::int FROM "workspaces" AS w2 WHERE w2."owner_user_id" = ca."user_id"
  ) = 1;
