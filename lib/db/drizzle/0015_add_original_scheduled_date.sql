ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "original_scheduled_date" date;
UPDATE "jobs"
SET "original_scheduled_date" = "scheduled_date"
WHERE "original_scheduled_date" IS NULL;
CREATE INDEX IF NOT EXISTS "jobs_original_scheduled_date_idx"
ON "jobs" ("original_scheduled_date");