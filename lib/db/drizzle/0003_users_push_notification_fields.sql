-- Add Expo push notification fields to users table so the mobile app can
-- register device tokens and users can opt out of notifications.
-- Safe to run on existing databases (uses IF NOT EXISTS pattern).

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "expo_push_token" text,
  ADD COLUMN IF NOT EXISTS "push_notifications_enabled" boolean NOT NULL DEFAULT true;
