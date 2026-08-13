-- Add skip review fields to the jobs table
-- Nullable — existing skipped jobs remain valid with null = unreviewed

CREATE TYPE "skip_review_outcome" AS ENUM ('accepted', 'rejected');

ALTER TABLE "jobs"
  ADD COLUMN "skip_reviewed_at"      timestamp,
  ADD COLUMN "skip_reviewed_by_id"   uuid REFERENCES "users"("id"),
  ADD COLUMN "skip_review_outcome"   "skip_review_outcome",
  ADD COLUMN "skip_review_notes"     text;

CREATE INDEX "jobs_skip_review_outcome_idx" ON "jobs" ("skip_review_outcome");
