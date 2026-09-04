-- Incremented when a password reset revokes every existing session for a user.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 0;