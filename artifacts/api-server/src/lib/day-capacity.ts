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
  /** False when the asymmetry guard fired — one or more sub-queries returned
   *  empty results while others returned data, suggesting a silent middleware
   *  failure that may have under-counted scheduled minutes. */
  capacityDataReliable: boolean;
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
  queryDb: typeof db = db,
): Promise<{ total: number; capacityDataReliable: boolean }> {
  const [regularRows, infillRows, mulchRows] = await Promise.all([
    // Regular maintenance + reactive + contingency jobs
    queryJobTypeMins("regular-jobs", teamId, date, () =>
      executeWithCircuitBreaker(() =>
        queryDb
          .select({
            mins: sql<number>`coalesce(${jobsTable.estimatedTimeMins}, ${assetsTable.serviceTimeMins}, 0)`,
          })
          .from(jobsTable)
          .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
          .where(
            and(
              eq(jobsTable.teamId, teamId),
              eq(jobsTable.scheduledDate, date),
              notInArray(jobsTable.status, ["completed", "skipped", "draft"]),
            ),
          ),
      ),
    ),

    // Infill planting jobs
    queryJobTypeMins("infill-jobs", teamId, date, () =>
      executeWithCircuitBreaker(() =>
        queryDb
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
        queryDb
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
  // Empty job categories are normal, so asymmetry alone cannot prove a query
  // failed. Cross-check every empty category with independent counts and only
  // mark the result unreliable when those counts contradict the returned rows.
  const rowCounts = [
    { jobType: "regular-jobs",     count: regularRows.length },
    { jobType: "infill-jobs",      count: infillRows.length  },
    { jobType: "mulching-records", count: mulchRows.length   },
  ];
  const emptyTypes  = rowCounts.filter((r) => r.count === 0).map((r) => r.jobType);

  let capacityDataReliable = true;

  const total =
    regularRows.reduce((s, r) => s + Number(r.mins), 0) +
    infillRows.reduce((s, r)  => s + Number(r.mins), 0) +
    mulchRows.reduce((s, r)   => s + Number(r.mins), 0);

  if (emptyTypes.length > 0) {
    const [countRow] = await queryJobTypeMins("total-job-count", teamId, date, () =>
      executeWithCircuitBreaker(() =>
        queryDb
          .select({
            regularCount: sql<number>`(SELECT count(*) FROM ${jobsTable}
              WHERE ${eq(jobsTable.teamId, teamId)}
                AND ${eq(jobsTable.scheduledDate, date)}
                AND ${notInArray(jobsTable.status, ["completed", "skipped", "draft"])})`,
            infillCount: sql<number>`(SELECT count(*) FROM ${infillJobsTable}
              WHERE ${eq(infillJobsTable.assignedTeamId, teamId)}
                AND ${eq(infillJobsTable.plannedDate, date)}
                AND ${notInArray(infillJobsTable.status, ["completed", "cancelled"])})`,
            mulchCount: sql<number>`(SELECT count(*) FROM ${mulchingRecordsTable}
              WHERE ${eq(mulchingRecordsTable.assignedTeamId, teamId)}
                AND ${eq(mulchingRecordsTable.scheduledDate, date)}
                AND ${notInArray(mulchingRecordsTable.status, ["completed", "not_required"])})`,
            totalCount: sql<number>`(
              (SELECT count(*) FROM ${jobsTable}
                WHERE ${eq(jobsTable.teamId, teamId)}
                  AND ${eq(jobsTable.scheduledDate, date)}
                  AND ${notInArray(jobsTable.status, ["completed", "skipped", "draft"])})
              + (SELECT count(*) FROM ${infillJobsTable}
                WHERE ${eq(infillJobsTable.assignedTeamId, teamId)}
                  AND ${eq(infillJobsTable.plannedDate, date)}
                  AND ${notInArray(infillJobsTable.status, ["completed", "cancelled"])})
              + (SELECT count(*) FROM ${mulchingRecordsTable}
                WHERE ${eq(mulchingRecordsTable.assignedTeamId, teamId)}
                  AND ${eq(mulchingRecordsTable.scheduledDate, date)}
                  AND ${notInArray(mulchingRecordsTable.status, ["completed", "not_required"])})
            )`,
          })
          .from(sql`(VALUES (1)) AS _dummy(v)`),
      ),
    );

    const crossRefCounts: Record<string, number> = {
      "regular-jobs": Number(countRow?.regularCount ?? 0),
      "infill-jobs": Number(countRow?.infillCount ?? 0),
      "mulching-records": Number(countRow?.mulchCount ?? 0),
    };
    let contradictedEmptyTypes = emptyTypes.filter(jobType => crossRefCounts[jobType] > 0);

    // Preserve fail-closed behavior if all detail queries were empty and the
    // aggregate count proves at least one of them omitted rows.
    const crossRefCount = Number(countRow?.totalCount ?? 0);
    if (emptyTypes.length === rowCounts.length && crossRefCount > 0 && contradictedEmptyTypes.length === 0) {
      contradictedEmptyTypes = emptyTypes;
    }

    if (!countRow || contradictedEmptyTypes.length > 0) {
      capacityDataReliable = false;
      console.warn(
        `[day-capacity] empty sub-query contradicted by cross-reference count — possible silent middleware failure; capacity may be under-counted`,
        { teamId, date, emptySubQueries: emptyTypes, contradictedEmptySubQueries: contradictedEmptyTypes, crossRefCounts, crossRefCount },
      );
    }
  }

  return { total, capacityDataReliable };
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
  queryDb: typeof db = db,
): Promise<DayCapacityResult | null> {
  const [settings] = await queryJobTypeMins("system-settings", teamId, date, () =>
    executeWithCircuitBreaker(() =>
      queryDb.select().from(systemSettingsTable).limit(1),
    ),
  );
  const productiveTimeMins = settings?.productiveTimeMins ?? 390;

  const { total: totalScheduledMins, capacityDataReliable } = await computeTotalScheduledMins(teamId, date, queryDb);
  const newTotal = totalScheduledMins + newJobMins;

  // Fail closed: if the capacity data is unreliable (asymmetry guard or
  // cross-reference guard fired), NEVER return null (which signals "safe to
  // schedule"). Return a conflict result immediately so callers block
  // scheduling rather than proceeding on data that may be severely
  // under-counted due to a silent middleware failure.
  if (!capacityDataReliable) {
    return {
      date,
      teamId,
      productiveTimeMins,
      totalScheduledMins,
      newJobMins,
      shortfallMins: Math.max(0, newTotal - productiveTimeMins),
      pendingScheduledFromCount: 0,
      capacityDataReliable: false,
    };
  }

  if (newTotal <= productiveTimeMins) return null;

  // Count pending regular maintenance jobs on/after this date that
  // push-forward would shift.
  const [pendingCountRow] = await queryJobTypeMins("pending-count", teamId, date, () =>
    executeWithCircuitBreaker(() =>
      queryDb
        .select({ count: sql<number>`count(*)::int` })
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.teamId, teamId),
            gte(jobsTable.scheduledDate, date),
            eq(jobsTable.status, "pending"),
            eq(jobsTable.jobType, "scheduled"),
            sql`${jobsTable.draftOriginalScheduledDate} IS NULL`,
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
    capacityDataReliable,
  };
}
