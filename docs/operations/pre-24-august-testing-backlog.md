# Pre-24 August Testing Backlog Cutover

## Production behavior

On the first production API start containing this change, the server atomically
marks every incomplete scheduled job whose original scheduled date is before
24 August 2026 as skipped.

The cleanup:

- includes `pending`, `in_progress`, `paused`, and `overdue` scheduled jobs;
- excludes 24 August 2026 and every later date;
- never changes completed, already skipped, draft, or non-scheduled work;
- records a `missed_skip` audit row for every changed job;
- uses the fixed reason `Pre-24 August 2026 testing backlog retired at operational go-live`;
- runs before overdue notifications and before the API accepts requests; and
- is safe to retry because changed rows no longer match the incomplete-status predicate.

If the status update or any matching audit insert fails, PostgreSQL rolls back
the entire statement and the API does not start. The deployment can then retry
without leaving partially retired or unaudited work.

## Verification after publish

Use read-only production queries to confirm all three conditions:

1. No incomplete scheduled job remains before the cutoff:

   ```sql
   SELECT status, COUNT(*)
   FROM jobs
   WHERE job_type = 'scheduled'
     AND status IN ('pending', 'in_progress', 'paused', 'overdue')
     AND COALESCE(original_scheduled_date, scheduled_date) < DATE '2026-08-24'
   GROUP BY status;
   ```

   Expected result: no rows.

2. The retired jobs have the fixed internal reason:

   ```sql
   SELECT COUNT(*)
   FROM jobs
   WHERE status = 'skipped'
     AND skip_reason = 'Pre-24 August 2026 testing backlog retired at operational go-live';
   ```

3. Every retired job has exactly one matching cleanup audit:

   ```sql
   SELECT j.id, COUNT(a.id) AS audit_count
   FROM jobs j
   LEFT JOIN audit_log a
     ON a.record_id = j.id
    AND a.table_name = 'jobs'
    AND a.action = 'missed_skip'
    AND a.new_data->>'testingBacklogCutoff' = '2026-08-24'
   WHERE j.status = 'skipped'
     AND j.skip_reason = 'Pre-24 August 2026 testing backlog retired at operational go-live'
   GROUP BY j.id
   HAVING COUNT(a.id) <> 1;
   ```

   Expected result: no rows.

Field Ops Today and the manager Unresolved Work queue should then contain no
pre-cutoff testing backlog. Work dated 24 August 2026 or later remains unchanged.