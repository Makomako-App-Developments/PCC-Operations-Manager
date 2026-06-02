-- Incremental migration: add infill_job_status enum, infill_jobs table,
-- and infill_job_id FK column to existing infill_orders table.
-- Safe to run on an existing database (all statements use IF NOT EXISTS).

-- 1. Add the new enum type (idempotent via DO block)
DO $$ BEGIN
  CREATE TYPE "public"."infill_job_status" AS ENUM(
    'draft', 'scheduled', 'in_progress', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create infill_jobs table
CREATE TABLE IF NOT EXISTS "infill_jobs" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id"         uuid NOT NULL REFERENCES "assets"("id"),
  "assessed_by_id"   uuid REFERENCES "users"("id"),
  "assessment_date"  date NOT NULL,
  "assessment_notes" text,
  "assigned_team_id" uuid REFERENCES "teams"("id"),
  "planned_date"     date,
  "estimated_mins"   integer,
  "status"           "infill_job_status" NOT NULL DEFAULT 'draft',
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "infill_jobs_asset_id_idx"        ON "infill_jobs"("asset_id");
CREATE INDEX IF NOT EXISTS "infill_jobs_status_idx"          ON "infill_jobs"("status");
CREATE INDEX IF NOT EXISTS "infill_jobs_assigned_team_id_idx" ON "infill_jobs"("assigned_team_id");

-- 3. Add infill_job_id FK to existing infill_orders table
ALTER TABLE "infill_orders"
  ADD COLUMN IF NOT EXISTS "infill_job_id" uuid
    REFERENCES "infill_jobs"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "infill_orders_infill_job_id_idx" ON "infill_orders"("infill_job_id");
