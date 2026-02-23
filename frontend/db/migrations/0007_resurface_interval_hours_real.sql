-- Allow fractional interval (e.g. 0.5 = 30 min) for resurface schedules
ALTER TABLE "resurface_schedules"
  ALTER COLUMN "interval_hours" TYPE real USING "interval_hours"::real;
