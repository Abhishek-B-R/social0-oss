-- Prevent duplicate (userId, hour, minute) queue slots
CREATE UNIQUE INDEX IF NOT EXISTS "queue_slots_user_hour_minute_unique"
  ON "queue_slots" ("user_id", "hour", "minute");
