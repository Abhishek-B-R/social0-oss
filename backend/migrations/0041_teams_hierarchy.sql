-- Team → Workspaces hierarchy: teams own workspaces; membership is team-level.

CREATE TABLE IF NOT EXISTS "teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "owner_user_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_user_id_user_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_owner_user_id_idx" ON "teams" ("owner_user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "role" "workspace_role" DEFAULT 'member' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_user_unique" ON "team_members" ("team_id", "user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" "workspace_role" DEFAULT 'member' NOT NULL,
  "token" text NOT NULL,
  "invited_by_user_id" text,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_user_id_user_id_fk"
    FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_token_unique" ON "team_invitations" ("token");
--> statement-breakpoint

-- Link existing workspaces to new teams (1 workspace → 1 team).
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "team_id" uuid;
--> statement-breakpoint

DO $$
DECLARE
  r RECORD;
  new_team_id uuid;
BEGIN
  FOR r IN
    SELECT id, name, owner_user_id, created_at, updated_at
    FROM workspaces
    WHERE team_id IS NULL
  LOOP
    INSERT INTO teams (id, name, owner_user_id, created_at, updated_at)
    VALUES (gen_random_uuid(), r.name, r.owner_user_id, r.created_at, r.updated_at)
    RETURNING id INTO new_team_id;

    UPDATE workspaces SET team_id = new_team_id WHERE id = r.id;

    INSERT INTO team_members (id, team_id, user_id, role, created_at, updated_at)
    SELECT gen_random_uuid(), new_team_id, wm.user_id, wm.role, wm.created_at, wm.updated_at
    FROM workspace_members wm
    WHERE wm.workspace_id = r.id
    ON CONFLICT DO NOTHING;

    -- Ensure owner is a team admin even if membership row was missing.
    INSERT INTO team_members (id, team_id, user_id, role, created_at, updated_at)
    VALUES (gen_random_uuid(), new_team_id, r.owner_user_id, 'admin', now(), now())
    ON CONFLICT DO NOTHING;

    INSERT INTO team_invitations (
      id, team_id, email, role, token, invited_by_user_id,
      expires_at, accepted_at, revoked_at, created_at
    )
    SELECT
      gen_random_uuid(), new_team_id, wi.email, wi.role, wi.token || '-' || substr(md5(random()::text), 1, 8),
      wi.invited_by_user_id, wi.expires_at, wi.accepted_at, wi.revoked_at, wi.created_at
    FROM workspace_invitations wi
    WHERE wi.workspace_id = r.id;
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE "workspaces" ALTER COLUMN "team_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_team_id_idx" ON "workspaces" ("team_id");
--> statement-breakpoint

ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_owner_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "owner_user_id";
--> statement-breakpoint

DROP TABLE IF EXISTS "workspace_invitations";
--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_members";
