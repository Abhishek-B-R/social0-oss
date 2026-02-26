-- Add 'partial' to post_status enum (used when some publications succeed and some fail).
-- Schema already defines it; DB was created from migration that omitted it.
ALTER TYPE "public"."post_status" ADD VALUE 'partial';--> statement-breakpoint
