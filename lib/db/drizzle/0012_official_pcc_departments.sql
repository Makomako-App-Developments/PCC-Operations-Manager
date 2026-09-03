-- Adopt PCC's official department names.
-- All existing classified assets were Garden assets, now officially Horticulture.

UPDATE "assets"
SET "department" = 'horticulture'
WHERE "department" = 'garden';

ALTER TABLE "assets"
  ALTER COLUMN "department" SET DEFAULT 'horticulture';