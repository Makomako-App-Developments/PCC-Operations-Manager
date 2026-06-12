-- audit_weekly_quotas: one record per supervisor per ISO week
CREATE TABLE IF NOT EXISTS "audit_weekly_quotas" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" uuid NOT NULL REFERENCES "users"("id"),
  "week_start"    date NOT NULL,
  "generated_at"  timestamp NOT NULL DEFAULT now(),
  "created_at"    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "awq_supervisor_id_idx"        ON "audit_weekly_quotas" ("supervisor_id");
CREATE INDEX IF NOT EXISTS "awq_week_start_idx"           ON "audit_weekly_quotas" ("week_start");
CREATE UNIQUE INDEX IF NOT EXISTS "awq_unique_supervisor_week" ON "audit_weekly_quotas" ("supervisor_id", "week_start");

-- audit_quota_items: sampled sites within a quota
CREATE TABLE IF NOT EXISTS "audit_quota_items" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "quota_id"      uuid NOT NULL REFERENCES "audit_weekly_quotas"("id") ON DELETE CASCADE,
  "asset_id"      uuid NOT NULL REFERENCES "assets"("id"),
  "asset_name"    text NOT NULL,
  "audit_type"    text NOT NULL,
  "source_job_id" uuid REFERENCES "jobs"("id"),
  "audit_id"      uuid REFERENCES "audits"("id"),
  "created_at"    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "aqi_quota_id_idx" ON "audit_quota_items" ("quota_id");
CREATE INDEX IF NOT EXISTS "aqi_asset_id_idx" ON "audit_quota_items" ("asset_id");
CREATE INDEX IF NOT EXISTS "aqi_audit_id_idx" ON "audit_quota_items" ("audit_id");
