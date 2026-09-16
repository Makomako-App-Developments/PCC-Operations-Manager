-- Keep management follow-up separate from the original field report.
ALTER TABLE "storm_observations"
  ADD COLUMN IF NOT EXISTS "manager_action_note" text,
  ADD COLUMN IF NOT EXISTS "manager_action_note_by_id" uuid
    REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "manager_action_note_at" timestamp,
  ADD COLUMN IF NOT EXISTS "manager_action_note_revision" integer NOT NULL DEFAULT 0;

ALTER TABLE "storm_alerts"
  ADD COLUMN IF NOT EXISTS "manager_action_note" text,
  ADD COLUMN IF NOT EXISTS "manager_action_note_by_id" uuid
    REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "manager_action_note_at" timestamp,
  ADD COLUMN IF NOT EXISTS "manager_action_note_revision" integer NOT NULL DEFAULT 0;