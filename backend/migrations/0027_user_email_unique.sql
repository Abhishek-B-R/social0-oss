-- Enforce unique email so change-email and sign-in are unambiguous.
-- If the table already has duplicate emails, fix those before running this migration.
ALTER TABLE "user" ADD CONSTRAINT "user_email_unique" UNIQUE ("email");
