-- Per-team default workspace for joined-team URL mode.

ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "default_workspace_id" uuid;
--> statement-breakpoint

-- Backfill: first workspace (by created_at) per team.
UPDATE "teams" t
SET "default_workspace_id" = (
  SELECT w.id
  FROM "workspaces" w
  WHERE w.team_id = t.id
  ORDER BY w.created_at ASC NULLS LAST, w.id ASC
  LIMIT 1
)
WHERE t.default_workspace_id IS NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "teams" ADD CONSTRAINT "teams_default_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("default_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
