-- Classify every asset by its owning department/function.
-- Existing assets are all Garden assets, so the non-null default also backfills them.

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "department" varchar(100) NOT NULL DEFAULT 'garden';

CREATE INDEX IF NOT EXISTS "assets_department_idx" ON "assets" ("department");