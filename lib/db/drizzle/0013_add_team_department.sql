-- Classify teams by PCC operational department.
-- Existing teams are all part of Horticulture.
ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "department" varchar(50) DEFAULT 'horticulture' NOT NULL;

UPDATE "teams"
SET "department" = 'horticulture'
WHERE "department" IS NULL OR "department" = '';