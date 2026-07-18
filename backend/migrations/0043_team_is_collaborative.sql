-- Distinguish collaborative teams (shown on /teams, inviteable) from
-- solo workspace containers created without the "Team workspace" toggle.

ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "is_collaborative" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

-- Backfill: solo create path used identical team + workspace names and always
-- ran a follow-up UPDATE (default_workspace_id), so updated_at > created_at.
-- Legacy/migrated rows (e.g. temp) keep is_collaborative = true.
UPDATE "teams" AS t
SET "is_collaborative" = false
WHERE (
  SELECT COUNT(*)::int FROM "workspaces" w WHERE w."team_id" = t."id"
) = 1
AND lower(t."name") = lower((
  SELECT w."name" FROM "workspaces" w WHERE w."team_id" = t."id" LIMIT 1
))
AND lower((
  SELECT w."name" FROM "workspaces" w WHERE w."team_id" = t."id" LIMIT 1
)) NOT LIKE '%default workspace%'
AND t."updated_at" > t."created_at";
