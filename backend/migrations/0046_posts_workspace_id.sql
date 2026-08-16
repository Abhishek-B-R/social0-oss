-- Scope posts to workspaces (null = Main / personal pool).
ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "posts"
    ADD CONSTRAINT "posts_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_user_workspace_id_idx"
  ON "posts" ("user_id", "workspace_id");
