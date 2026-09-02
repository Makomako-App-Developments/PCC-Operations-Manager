-- Garden-only specification fields are nullable for operational departments.
ALTER TABLE "assets"
  ALTER COLUMN "garden_type" DROP NOT NULL,
  ALTER COLUMN "standard" DROP NOT NULL,
  ALTER COLUMN "area_m2" DROP NOT NULL;

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "department_details" jsonb;