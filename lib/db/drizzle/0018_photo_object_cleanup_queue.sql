CREATE TABLE IF NOT EXISTS "photo_object_cleanup_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bucket_id" text NOT NULL,
  "object_name" text NOT NULL,
  "route" text NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "last_attempt_at" timestamp,
  "completed_at" timestamp,
  "permanently_failed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "photo_object_cleanup_pending_idx"
  ON "photo_object_cleanup_queue" ("next_attempt_at");

CREATE INDEX IF NOT EXISTS "photo_object_cleanup_permanent_idx"
  ON "photo_object_cleanup_queue" ("permanently_failed_at");