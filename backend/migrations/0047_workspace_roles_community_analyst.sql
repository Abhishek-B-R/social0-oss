-- Community (inbox) and Analyst (analytics) team roles.
ALTER TYPE "workspace_role" ADD VALUE IF NOT EXISTS 'community';
--> statement-breakpoint
ALTER TYPE "workspace_role" ADD VALUE IF NOT EXISTS 'analyst';
