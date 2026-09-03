import { db, executeWithCircuitBreaker, teamMembersTable, teamAvailabilityTable, jobsTable, assetsTable, systemSettingsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

export const FREQ_DAYS: Record<string, number> = {
  weekly:      7,
  fortnightly: 14,
  monthly:     28,
  bimonthly:   56,
  quarterly:   91,
};

// A person is absent for the day if they have 5+ non-available hours recorded
const ABSENT_HOUR_THRESHOLD = 5;

export type CrewStatus = "full" | "reduced" | "none";

/**
 * Load current system settings. Returns defaults if no row exists.
 */
export async function loadSystemSettings(): Promise<{ productiveTimeMins: number; standardCrewSize: number }> {
  const [row] = await executeWithCircuitBreaker(() =>
    db.select().from(systemSettingsTable).limit(1),
  );
  return {
    productiveTimeMins: row?.productiveTimeMins ?? 390,
    standardCrewSize:   row?.standardCrewSize   ?? 2,
  };
}

/**
 * Calculate crew-adjusted estimated time for a job.
 *
 * All service times are calibrated for `standardCrewSize` people (default 2).
 * So even a 1-person team gets estimatedTimeMins = serviceTimeMins × (2 / 1) = 2×.
 *
 * @param standardCrewSize  The baseline crew size all service times are calibrated for (from system settings)
 * @param availCount        How many crew members are available that day
 */
export function calcCrewAdjustment(
  teamId: string | null,
  dateStr: string,
  membersByTeam: Map<string, string[]>,
  absenceMap: Map<string, Set<string>>,
  baseTimeMins: number,
  standardCrewSize = 2,
): { estimatedTimeMins: number; crewStatus: CrewStatus } {
  if (!teamId) return { estimatedTimeMins: baseTimeMins, crewStatus: "full" };

  const members       = membersByTeam.get(teamId) ?? [];
  const normalSize    = members.length;              // how many people this team normally has
  const absentToday   = absenceMap.get(dateStr) ?? new Set<string>();
  const availCount    = members.filter(n => !absentToday.has(n)).length;

  if (availCount === 0) {
    // No one available — job flagged, time stays at base (will be rescheduled by capacity logic)
    return { estimatedTimeMins: baseTimeMins, crewStatus: "none" };
  }

  // Time always scales against the system standard crew size (service times are calibrated for that)
  const adjusted = Math.ceil(baseTimeMins * (standardCrewSize / availCount));

  // Crew status is "reduced" only when someone who is NORMALLY on this team is absent today.
  // A team whose normal complement is 1 person is never "reduced" just because standardCrewSize = 2.
  const someoneAbsent = availCount < normalSize;

  if (someoneAbsent) {
    return { estimatedTimeMins: adjusted, crewStatus: "reduced" };
  }

  // All normal members present — crew is "full" from this team's perspective
  return { estimatedTimeMins: adjusted, crewStatus: "full" };
}

/**
 * Recalculate pending scheduled-job estimates from the current asset service
 * time and the crew availability on each job date.
 *
 * This is set-based so it can safely repair a bulk asset-time import without
 * issuing one query per job. Passing an asset ID limits the repair to that
 * asset, which keeps ordinary asset edits cheap.
 */
export async function reconcilePendingScheduledJobDurations(assetId?: string): Promise<number> {
  const result = await executeWithCircuitBreaker(() => db.execute<{ id: string }>(sql`
    WITH settings AS (
      SELECT COALESCE(
        (SELECT standard_crew_size FROM system_settings LIMIT 1),
        2
      )::numeric AS standard_crew_size
    ),
    team_sizes AS (
      SELECT team_id, COUNT(*)::integer AS normal_size
      FROM team_members
      GROUP BY team_id
    ),
    absent_people AS (
      SELECT tm.team_id, ta.date, ta.person_name
      FROM team_availability ta
      INNER JOIN team_members tm ON tm.person_name = ta.person_name
      WHERE ta.status <> 'available'
      GROUP BY tm.team_id, ta.date, ta.person_name
      HAVING COUNT(*) >= ${ABSENT_HOUR_THRESHOLD}
    ),
    absence_counts AS (
      SELECT team_id, date, COUNT(*)::integer AS absent_count
      FROM absent_people
      GROUP BY team_id, date
    ),
    expected AS (
      SELECT
        j.id,
        CASE
          WHEN j.team_id IS NULL THEN a.service_time_mins
          WHEN COALESCE(ts.normal_size, 0) - COALESCE(ac.absent_count, 0) <= 0
            THEN a.service_time_mins
          ELSE CEIL(
            a.service_time_mins::numeric * s.standard_crew_size
            / (ts.normal_size - COALESCE(ac.absent_count, 0))
          )::integer
        END AS estimated_time_mins,
        CASE
          WHEN j.team_id IS NULL THEN 'full'::crew_status
          WHEN COALESCE(ts.normal_size, 0) - COALESCE(ac.absent_count, 0) <= 0
            THEN 'none'::crew_status
          WHEN COALESCE(ac.absent_count, 0) > 0 THEN 'reduced'::crew_status
          ELSE 'full'::crew_status
        END AS crew_status
      FROM jobs j
      INNER JOIN assets a ON a.id = j.asset_id
      CROSS JOIN settings s
      LEFT JOIN team_sizes ts ON ts.team_id = j.team_id
      LEFT JOIN absence_counts ac
        ON ac.team_id = j.team_id AND ac.date = j.scheduled_date
      WHERE j.job_type = 'scheduled'
        AND j.status = 'pending'
        ${assetId ? sql`AND j.asset_id = ${assetId}` : sql``}
    )
    UPDATE jobs j
    SET
      estimated_time_mins = e.estimated_time_mins,
      crew_status = e.crew_status,
      updated_at = NOW()
    FROM expected e
    WHERE j.id = e.id
      AND (
        j.estimated_time_mins IS DISTINCT FROM e.estimated_time_mins
        OR j.crew_status IS DISTINCT FROM e.crew_status
      )
    RETURNING j.id
  `));

  return result.rows?.length ?? 0;
}

/**
 * Build membersByTeam + absenceMap for a single team on a single date.
 */
export async function buildAbsenceDataForTeamDate(
  teamId: string,
  date: string,
): Promise<{
  membersByTeam: Map<string, string[]>;
  absenceMap: Map<string, Set<string>>;
}> {
  const members = await executeWithCircuitBreaker(() =>
    db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, teamId)),
  );

  const membersByTeam = new Map<string, string[]>();
  membersByTeam.set(teamId, members.map(m => m.personName));

  const personNames = members.map(m => m.personName);
  if (personNames.length === 0) return { membersByTeam, absenceMap: new Map() };

  const availRows = await executeWithCircuitBreaker(() =>
    db
      .select()
      .from(teamAvailabilityTable)
      .where(
        and(
          eq(teamAvailabilityTable.date, date),
          inArray(teamAvailabilityTable.personName, personNames),
        ),
      ),
  );

  const countMap = new Map<string, number>();
  for (const row of availRows) {
    if (row.status === "available") continue;
    countMap.set(row.personName, (countMap.get(row.personName) ?? 0) + 1);
  }

  const absentSet = new Set<string>();
  for (const [person, count] of countMap) {
    if (count >= ABSENT_HOUR_THRESHOLD) absentSet.add(person);
  }

  const absenceMap = new Map<string, Set<string>>();
  if (absentSet.size > 0) absenceMap.set(date, absentSet);

  return { membersByTeam, absenceMap };
}

/**
 * Compute pending-job capacity for a team on a given date.
 * Returns total scheduled minutes vs productive time, and a utilization %.
 * Used by PUT /api/team/availability to detect over-capacity after an absence change.
 */
export async function computeDayCapacity(
  teamId: string,
  date: string,
): Promise<{ totalScheduledMins: number; productiveTimeMins: number; utilizationPct: number }> {
  const { productiveTimeMins } = await loadSystemSettings();

  const pendingJobs = await executeWithCircuitBreaker(() =>
    db
      .select({
        estimatedTimeMins: jobsTable.estimatedTimeMins,
        serviceTimeMins:   assetsTable.serviceTimeMins,
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(
        and(
          eq(jobsTable.teamId, teamId),
          eq(jobsTable.scheduledDate, date),
          inArray(jobsTable.status, ["pending", "in_progress"]),
        ),
      ),
  );

  const totalScheduledMins = pendingJobs.reduce(
    (sum, j) => sum + (j.estimatedTimeMins ?? j.serviceTimeMins),
    0,
  );

  return {
    totalScheduledMins,
    productiveTimeMins,
    utilizationPct: Math.round((totalScheduledMins / productiveTimeMins) * 100),
  };
}

/**
 * Recalculate + update crewStatus/estimatedTimeMins on all PENDING jobs
 * for a given team on a given date. Called automatically when availability changes.
 */
export async function refreshCrewStatusForTeamDate(
  teamId: string,
  date: string,
): Promise<number> {
  const { standardCrewSize } = await loadSystemSettings();
  const { membersByTeam, absenceMap } = await buildAbsenceDataForTeamDate(teamId, date);

  const jobs = await executeWithCircuitBreaker(() =>
    db
      .select({
        id:              jobsTable.id,
        serviceTimeMins: assetsTable.serviceTimeMins,
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(
        and(
          eq(jobsTable.teamId, teamId),
          eq(jobsTable.scheduledDate, date),
          eq(jobsTable.status, "pending"),
        ),
      ),
  );

  for (const job of jobs) {
    const { estimatedTimeMins, crewStatus } = calcCrewAdjustment(
      teamId, date, membersByTeam, absenceMap, job.serviceTimeMins, standardCrewSize,
    );
    await executeWithCircuitBreaker(() =>
      db
        .update(jobsTable)
        .set({ estimatedTimeMins, crewStatus, updatedAt: new Date() })
        .where(eq(jobsTable.id, job.id)),
    );
  }

  return jobs.length;
}

// ─── Spill helpers ────────────────────────────────────────────────────────────

/** Next non-weekend working day after dateStr (YYYY-MM-DD). */
export function nextWorkingDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Auto-spill excess pending scheduled jobs off an over-capacity day.
 *
 * Jobs are prioritised for removal by lowest visit frequency (quarterly
 * before monthly before weekly) then latest route position (last in
 * geosequence moves first), keeping the front of the route intact.
 * Only touches pending scheduled jobs — never moves in_progress/completed
 * or reactive jobs.
 *
 * Returns the count of jobs moved and the target date they were sent to.
 * Returns { spilledCount: 0, targetDate: "" } when no spill was needed.
 */
export async function spillExcessJobs(
  teamId: string,
  date: string,
): Promise<{ spilledCount: number; targetDate: string }> {
  const { productiveTimeMins } = await loadSystemSettings();

  const jobs = await executeWithCircuitBreaker(() =>
    db
      .select({
        id:                jobsTable.id,
        estimatedTimeMins: jobsTable.estimatedTimeMins,
        serviceTimeMins:   assetsTable.serviceTimeMins,
        frequency:         assetsTable.frequency,
        routeOrder:        assetsTable.routeOrder,
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(
        and(
          eq(jobsTable.teamId, teamId),
          eq(jobsTable.scheduledDate, date),
          eq(jobsTable.status, "pending"),
          eq(jobsTable.jobType, "scheduled"),
        ),
      ),
  );

  const totalMins = jobs.reduce((s, j) => s + (j.estimatedTimeMins ?? j.serviceTimeMins), 0);
  if (totalMins <= productiveTimeMins) return { spilledCount: 0, targetDate: "" };

  // Lowest-priority first: rarest visits (high FREQ_DAYS) then latest route position
  const sorted = [...jobs].sort((a, b) => {
    const fa = FREQ_DAYS[a.frequency] ?? 28;
    const fb = FREQ_DAYS[b.frequency] ?? 28;
    if (fb !== fa) return fb - fa;
    return (b.routeOrder ?? 9999) - (a.routeOrder ?? 9999);
  });

  const target = nextWorkingDay(date);
  let remaining = totalMins;
  const toMove: string[] = [];

  for (const job of sorted) {
    if (remaining <= productiveTimeMins) break;
    toMove.push(job.id);
    remaining -= (job.estimatedTimeMins ?? job.serviceTimeMins);
  }

  if (toMove.length > 0) {
    await executeWithCircuitBreaker(() =>
      db
        .update(jobsTable)
        .set({ scheduledDate: target, updatedAt: new Date() })
        .where(inArray(jobsTable.id, toMove)),
    );
  }

  return { spilledCount: toMove.length, targetDate: target };
}
