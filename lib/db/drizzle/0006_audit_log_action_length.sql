-- Widen action column to accommodate schedule push action names
-- "push_forward" (12 chars) and "undo_push" (9 chars) exceed the old varchar(10) limit.
ALTER TABLE "audit_log" ALTER COLUMN "action" TYPE varchar(50);
