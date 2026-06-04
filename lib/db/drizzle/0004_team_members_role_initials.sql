-- Add role and initials columns to team_members table.
-- role: distinguishes field workers from supervisors (default field_worker).
-- initials: 1-4 character abbreviation, derived from personName if not supplied.
-- Safe to run on existing databases (uses IF NOT EXISTS / DO block patterns).

ALTER TABLE "team_members"
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'field_worker',
  ADD COLUMN IF NOT EXISTS "initials" varchar(4);

-- Back-fill initials for existing rows from the first letter of each word in person_name.
DO $$
BEGIN
  UPDATE "team_members"
  SET "initials" = (
    SELECT string_agg(upper(left(word, 1)), '' ORDER BY ord)
    FROM (
      SELECT word, row_number() OVER () AS ord
      FROM unnest(string_to_array(trim(person_name), ' ')) AS word
    ) w
    WHERE word <> ''
    LIMIT 4
  )
  WHERE "initials" IS NULL;
END $$;
