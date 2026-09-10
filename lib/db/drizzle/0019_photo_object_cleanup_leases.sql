ALTER TABLE "photo_object_cleanup_queue"
  ADD COLUMN IF NOT EXISTS "claim_token" text,
  ADD COLUMN IF NOT EXISTS "lease_until" timestamp;

CREATE INDEX IF NOT EXISTS "photo_object_cleanup_lease_idx"
  ON "photo_object_cleanup_queue" ("lease_until");