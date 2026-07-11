-- Remove duplicate (user_id, hour, minute) rows, keeping one per group (smallest id)
DELETE FROM queue_slots a
USING queue_slots b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.hour = b.hour
  AND a.minute = b.minute;
-- Prevent duplicate (userId, hour, minute) queue slots
CREATE UNIQUE INDEX IF NOT EXISTS "queue_slots_user_hour_minute_unique"
  ON "queue_slots" ("user_id", "hour", "minute");
