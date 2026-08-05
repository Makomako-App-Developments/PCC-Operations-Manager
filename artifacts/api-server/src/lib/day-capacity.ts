import {
  db, executeWithCircuitBreaker, jobsTable, assetsTable, infillJobsTable, mulchingRecordsTable,
  systemSettingsTable,
} from "@workspace/db";
import { eq, and, gte, notInArray, inArray, sql } from "drizzle-orm";

export interface DayCapacityResult {
  productiveTimeMins: number;
  totalScheduledMins: number;
  newJobMins: number;
  shortfallMins: number;
  pendingScheduledFromCount: number;
  date: string;
  teamId: string;
}

/**
 * Wraps a sub-query so that if it rejects, a structured warning is logged
 * identifying the failing job type, team, and date before the error is
 * re-thrown. This ensures capacity checks ALWAYS fail loudly rather than
 * silently returning 0 for a broken query (which would cause the API to
 * under-count scheduled minutes and falsely claim spare capacity).
 *
 * DO NOT catch these errors here or return a fallback value — a capacity check
 * that throws is safer than one that silently under-counts.
 */
async function queryJobTypeMins<T>(
  jobType: string,
  teamId: string,
  date: string,
  query: () => Promise<T>,
): Promise<T> {
  try {
    return await query();
  } catch (err) {
    console.warn(
      `[day-capacity] sub-query failed for job type "${jobType}" (teamId=${teamId}, date=${date}) — capacity check aborted to prevent under-counting`,
      { jobType, teamId, date, error: err instanceof Error ? err.message : String(err) },
    );
    throw err;
  }
}

/**
 * CACHING NOTE — circuit-breaker recovery safety
 * ------------------------------------------------
 * This function performs NO caching of its own. Every invocation issues three
 * parallel DB queries (regular jobs, infill jobs, mulching records) directly
 * through `executeWithCircuitBreaker`. There is no in-process Map, TTL cache,
 * or memoisation layer sitting in front of these queries.
 *
 * Consequence: when the circuit breaker transitions OPEN → HALF_OPEN → CLOSED
 * after a DB outage, the very next call to this function automatically reads
 * live data from Postgres. No explicit cache-invalidation step is required on
 * `recordSuccess()` or any other circuit-breaker state-change event.
 *
 * If a caching layer is ever introduced here (e.g. a per-request Map or a
 * module-level TTL cache), it MUST be invalidated — or keyed so that it cannot
 * survive across circuit-breaker trips — to prevent a stale low total from
 * causing the scheduler to over-commit capacity after DB recovery.
 */
export async function computeTotalScheduledMins(
  teamId: string,
  date: string,
): Promise<number> {
  const [regularRows, infillRows, mulchRows] = await Promise.all([
    // Regular maintenance + reactive + contingency jobs
    queryJobTypeMins("regular-jobs", teamId, date, () =>
      executeWithCircuitBreaker(() =>
        db
          .select({
            mins: sql<number>`coalesce(${jobsTable.estimatedTimeMins}, ${assetsTable.serviceTimeMins}, 0)`,
          })
          .from(jobsTable)
          .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
          .where(
            and(
              eq(jobsTable.teamId, teamId),
              eq(jobsTable.scheduledDate, date),
              notInArray(jobsTable.status, ["completed", "skipped"]),
            ),
          ),
      ),
    ),

    // Infill planting jobs
    queryJobTypeMins("infill-jobs", teamId, date, () =>
      executeWithCircuitBreaker(() =>
        db
          .select({ mins: sql<number>`coalesce(${infillJobsTable.estimatedMins}, 0)` })
          .from(infillJobsTable)
          .where(
            and(
              eq(infillJobsTable.assignedTeamId, teamId),
              eq(infillJobsTable.plannedDate, date),
              notInArray(infillJobsTable.status, ["completed", "cancelled"]),
            ),
          ),
      ),
    ),

    // Mulching records
    queryJobTypeMins("mulching-records", teamId, date, () =>
      executeWithCircuitBreaker(() =>
        db
          .select({ mins: sql<number>`coalesce(${mulchingRecordsTable.estimatedMins}, 0)` })
          .from(mulchingRecordsTable)
          .where(
            and(
              eq(mulchingRecordsTable.assignedTeamId, teamId),
              eq(mulchingRecordsTable.scheduledDate, date),
              notInArray(mulchingRecordsTable.status, ["completed", "not_required"]),
            ),
          ),
      ),
    ),
  ]);

  // ── Silent empty-array guard ────────────────────────────────────────────────
  // If a DB middleware layer swallows an error and resolves with [] instead of
  // rejecting, queryJobTypeMins will NOT throw — so the check above cannot catch
  // it. We detect the failure by looking for asymmetry: if at least one
  // sub-query returned rows but another returned zero rows, the empty result is
  // suspicious and likely indicates a silent failure rather than a genuinely
  // empty schedule. Warn loudly so the under-count is operator-visible.
  const rowCounts = [
    { jobType: "regular-jobs",     count: regularRows.length },
    { jobType: "infill-jobs",      count: infillRows.length  },
    { jobType: "mulching-records", count: mulchRows.length   },
  ];
  const anyNonEmpty = rowCounts.some((r) => r.count > 0);
  const emptyTypes  = rowCounts.filter((r) => r.count === 0).map((r) => r.jobType);

  if (anyNonEmpty && emptyTypes.length > 0) {
    console.warn(
      `[day-capacity] sub-query returned empty results while other sub-queries returned data — possible silent middleware failure; capacity may be under-counted`,
      { teamId, date, emptySubQueries: emptyTypes, nonEmptySubQueries: rowCounts.filter((r) => r.count > 0).map((r) => r.jobType) },
    );
  }

  const total =
    regularRows.reduce((s, r) => s + Number(r.mins), 0) +
    infillRows.reduce((s, r)  => s + Number(r.mins), 0) +
    mulchRows.reduce((s, r)   => s + Number(r.mins), 0);

  return total;
}

/**
 * Check whether adding `newJobMins` to a team's schedule on `date` would
 * exceed productive-time capacity.
 *
 * Returns null if no conflict.
 * Returns a DayCapacityResult if there IS a conflict.
 */
export async function checkDayCapacity(
  teamId: string,
  date: string,
  newJobMins: number,
): Promise<DayCapacityResult | null> {
  const [settings] = await queryJobTypeMins("system-settings", teamId, date, () =>
    executeWithCircuitBreaker(() =>
      db.select().from(systemSettingsTable).limit(1),
    ),
  );
  const productiveTimeMins = settings?.productiveTimeMins ?? 390;

  const totalScheduledMins = await computeTotalScheduledMins(teamId, date);
  const newTotal = totalScheduledMins + newJobMins;

  if (newTotal <= productiveTimeMins) return null;

  // Count pending regular maintenance jobs on/after this date that
  // push-forward would shift.
  const [pendingCountRow] = await queryJobTypeMins("pending-count", teamId, date, () =>
    executeWithCircuitBreaker(() =>
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.teamId, teamId),
            gte(jobsTable.scheduledDate, date),
            eq(jobsTable.status, "pending"),
            eq(jobsTable.jobType, "scheduled"),
          ),
        ),
    ),
  );

  return {
    date,
    teamId,
    productiveTimeMins,
    totalScheduledMins,
    newJobMins,
    shortfallMins: newTotal - productiveTimeMins,
    pendingScheduledFromCount: pendingCountRow?.count ?? 0,
  };
}
