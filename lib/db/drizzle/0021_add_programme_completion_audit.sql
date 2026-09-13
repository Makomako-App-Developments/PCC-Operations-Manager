ALTER TABLE "infill_jobs"
ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "completed_by_id" uuid REFERENCES "users"("id");

ALTER TABLE "mulching_records"
ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "completed_by_id" uuid REFERENCES "users"("id");

-- The exact worker cannot be reconstructed for legacy records. Preserve their
-- best available completion time while leaving completed_by_id explicitly null.
UPDATE "infill_jobs"
SET "completed_at" = "updated_at" AT TIME ZONE 'UTC'
WHERE "status" = 'completed'
  AND "completed_at" IS NULL;

UPDATE "mulching_records"
SET "completed_at" = "completed_date"::timestamp AT TIME ZONE 'Pacific/Auckland'
WHERE "status" = 'completed'
  AND "completed_date" IS NOT NULL
  AND "completed_at" IS NULL;