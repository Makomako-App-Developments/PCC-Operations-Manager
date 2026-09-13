-- Attach photo evidence to infill planting jobs.
-- Existing job photos remain valid because the relationship is nullable.
ALTER TABLE "job_photos"
  ADD COLUMN IF NOT EXISTS "infill_job_id" uuid
    REFERENCES "infill_jobs"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "job_photos_infill_job_id_idx"
  ON "job_photos"("infill_job_id");