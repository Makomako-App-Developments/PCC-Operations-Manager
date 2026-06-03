-- Incremental migration: add mulching_record_id FK to job_photos so that
-- mulching job completions can have photo evidence attached.
-- Safe to run on an existing database (uses IF NOT EXISTS / idempotent pattern).

ALTER TABLE "job_photos"
  ADD COLUMN IF NOT EXISTS "mulching_record_id" uuid
    REFERENCES "mulching_records"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "job_photos_mulching_record_id_idx"
  ON "job_photos"("mulching_record_id");
