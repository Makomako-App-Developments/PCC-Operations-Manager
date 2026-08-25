-- Accepted skip reviews become manager-only drafts. A draft retains its
-- original team/date context even after a manager deliberately re-places it.

ALTER TYPE "job_status" ADD VALUE IF NOT EXISTS 'draft';

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "draft_original_team_id" uuid REFERENCES "teams"("id"),
  ADD COLUMN IF NOT EXISTS "draft_original_scheduled_date" date;

CREATE INDEX IF NOT EXISTS "jobs_draft_original_team_id_idx"
  ON "jobs" ("draft_original_team_id");