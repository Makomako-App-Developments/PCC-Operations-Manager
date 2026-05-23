import { db, teamMembersTable, teamAvailabilityTable, jobsTable, assetsTable, systemSettingsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

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
  const [row] = await db.select().from(systemSettingsTable).limit(1);
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

  const members  = membersByTeam.get(teamId) ?? [];
  const absentToday = absenceMap.get(dateStr) ?? new Set<string>();
  const availCount  = members.filter(n => !absentToday.has(n)).length;

  if (availCount === 0) {
    // No one available — job flagged, time stays at base (will be rescheduled by capacity logic)
    return { estimatedTimeMins: baseTimeMins, crewStatus: "none" };
  }

  const adjusted = Math.ceil(baseTimeMins * (standardCrewSize / availCount));

  if (availCount >= standardCrewSize) {
    // Full standard crew (or more) — no scaling needed
    return { estimatedTimeMins: baseTimeMins, crewStatus: "full" };
  }

  return { estimatedTimeMins: adjusted, crewStatus: "reduced" };
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
  const members = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, teamId));

  const membersByTeam = new Map<string, string[]>();
  membersByTeam.set(teamId, members.map(m => m.personName));

  const personNames = members.map(m => m.personName);
  if (personNames.length === 0) return { membersByTeam, absenceMap: new Map() };

  const availRows = await db
    .select()
    .from(teamAvailabilityTable)
    .where(
      and(
        eq(teamAvailabilityTable.date, date),
        inArray(teamAvailabilityTable.personName, personNames),
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
 * Recalculate + update crewStatus/estimatedTimeMins on all PENDING jobs
 * for a given team on a given date. Called automatically when availability changes.
 */
export async function refreshCrewStatusForTeamDate(
  teamId: string,
  date: string,
): Promise<number> {
  const { standardCrewSize } = await loadSystemSettings();
  const { membersByTeam, absenceMap } = await buildAbsenceDataForTeamDate(teamId, date);

  const jobs = await db
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
    );

  for (const job of jobs) {
    const { estimatedTimeMins, crewStatus } = calcCrewAdjustment(
      teamId, date, membersByTeam, absenceMap, job.serviceTimeMins, standardCrewSize,
    );
    await db
      .update(jobsTable)
      .set({ estimatedTimeMins, crewStatus, updatedAt: new Date() })
      .where(eq(jobsTable.id, job.id));
  }

  return jobs.length;
}
