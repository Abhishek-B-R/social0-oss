-- Queue slots: replace single day_of_week with days_of_week array (Mon–Sun toggles per time)
ALTER TABLE "queue_slots" ADD COLUMN IF NOT EXISTS "days_of_week" integer[];
UPDATE "queue_slots" SET "days_of_week" = ARRAY["day_of_week"] WHERE "day_of_week" IS NOT NULL;
UPDATE "queue_slots" SET "days_of_week" = ARRAY[0,1,2,3,4,5,6] WHERE "days_of_week" IS NULL;
ALTER TABLE "queue_slots" ALTER COLUMN "days_of_week" SET NOT NULL;
ALTER TABLE "queue_slots" DROP COLUMN IF EXISTS "day_of_week";
