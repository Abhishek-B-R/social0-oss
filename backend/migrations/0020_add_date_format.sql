-- Add user date format preference (DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD)
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "date_format" text DEFAULT 'dd/MM/yyyy';
