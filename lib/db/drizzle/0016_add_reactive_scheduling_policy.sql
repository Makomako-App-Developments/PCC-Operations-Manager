ALTER TABLE "reactive_jobs"
ADD COLUMN IF NOT EXISTS "scheduling_policy" text;

ALTER TABLE "reactive_jobs"
ADD CONSTRAINT "reactive_jobs_scheduling_policy_check"
CHECK (
  "scheduling_policy" IS NULL
  OR "scheduling_policy" IN ('unscheduled_first', 'scheduled_first')
);