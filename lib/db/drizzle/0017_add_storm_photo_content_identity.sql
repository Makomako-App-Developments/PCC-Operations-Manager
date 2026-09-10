ALTER TABLE "storm_photos"
ADD COLUMN IF NOT EXISTS "content_hash" text;

ALTER TABLE "storm_photos"
ADD COLUMN IF NOT EXISTS "content_type" text;