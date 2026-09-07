import { db, executeWithCircuitBreaker } from "@workspace/db";
import { sql } from "drizzle-orm";

export const TESTING_BACKLOG_CUTOFF = "2026-08-24";
export const TESTING_BACKLOG_SKIP_REASON =
  "Pre-24 August 2026 testing backlog retired at operational go-live";

export const TESTING_BACKLOG_STATUSES = [
  "pending",
  "in_progress",
  "paused",
  "overdue",
] as const;

export function isTestingBacklogJob(job: {
  jobType: string;
  status: string;
  scheduledDate: string;
  originalScheduledDate?: string | null;
}): boolean {
  const originalDate = job.originalScheduledDate ?? job.scheduledDate;
  return (
    job.jobType === "scheduled" &&
    TESTING_BACKLOG_STATUSES.includes(job.status as typeof TESTING_BACKLOG_STATUSES[number]) &&
    originalDate < TESTING_BACKLOG_CUTOFF
  );
}

/**
 * Atomically retires the fixed pre-go-live test backlog and writes one audit
 * record per changed job. The status/date predicates are repeated in the
 * UPDATE so PostgreSQL re-checks them after waiting on any concurrent row lock.
 *
 * A second run returns zero rows because only incomplete statuses qualify.
 * If the audit insert fails, the whole statement rolls back, so a later retry
 * cannot leave a skipped job without its matching audit record.
 */
export async function retireTestingBacklog(): Promise<number> {
  const result = await executeWithCircuitBreaker(() => db.execute<{ record_id: string }>(sql`
    WITH candidates AS MATERIALIZED (
      SELECT
        j.id,
        to_jsonb(j) AS old_data
      FROM jobs j
      WHERE j.job_type = 'scheduled'
        AND j.status IN ('pending', 'in_progress', 'paused', 'overdue')
        AND COALESCE(j.original_scheduled_date, j.scheduled_date) < ${TESTING_BACKLOG_CUTOFF}::date
    ),
    updated AS (
      UPDATE jobs j
      SET
        status = 'skipped',
        original_scheduled_date = COALESCE(j.original_scheduled_date, j.scheduled_date),
        skip_reason = ${TESTING_BACKLOG_SKIP_REASON},
        updated_at = NOW()
      FROM candidates c
      WHERE j.id = c.id
        AND j.job_type = 'scheduled'
        AND j.status IN ('pending', 'in_progress', 'paused', 'overdue')
        AND COALESCE(j.original_scheduled_date, j.scheduled_date) < ${TESTING_BACKLOG_CUTOFF}::date
      RETURNING
        j.id,
        c.old_data,
        to_jsonb(j) AS new_data
    )
    INSERT INTO audit_log (
      table_name,
      record_id,
      action,
      changed_by_id,
      old_data,
      new_data,
      ip_address
    )
    SELECT
      'jobs',
      updated.id,
      'missed_skip',
      NULL,
      updated.old_data,
      updated.new_data || jsonb_build_object(
        'resolutionReason', ${TESTING_BACKLOG_SKIP_REASON}::text,
        'testingBacklogCutoff', ${TESTING_BACKLOG_CUTOFF}::text,
        'initiatedBy', 'system'
      ),
      NULL
    FROM updated
    RETURNING record_id
  `));

  return result.rows?.length ?? 0;
}

export async function runProductionTestingBacklogCleanup(): Promise<number> {
  if (process.env["NODE_ENV"] !== "production") return 0;

  const retired = await retireTestingBacklog();
  console.log(
    retired > 0
      ? `[testing-backlog] Retired ${retired} incomplete pre-${TESTING_BACKLOG_CUTOFF} scheduled job(s).`
      : `[testing-backlog] No incomplete pre-${TESTING_BACKLOG_CUTOFF} scheduled jobs remain.`,
  );
  return retired;
}