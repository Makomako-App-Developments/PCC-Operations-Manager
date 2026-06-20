import {
  db, jobsTable, assetsTable, infillJobsTable, mulchingRecordsTable,
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
 * Compute total minutes already scheduled for a team on a given date.
 * Counts ALL active job types: regular maintenance (jobsTable) + infill +
 * mulching. Excludes completed / skipped / cancelled records.
 */
export async function computeTotalScheduledMins(
  teamId: string,
  date: string,
): Promise<number> {
  const [regularRows, infillRows, mulchRows] = await Promise.all([
    // Regular maintenance + reactive + contingency jobs
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

    // Infill planting jobs
    db
      .select({ mins: sql<number>`coalesce(${infillJobsTable.estimatedMins}, 0)` })
      .from(infillJobsTable)
      .where(
        and(
          eq(infillJobsTable.assignedTeamId, teamId),
          eq(infillJobsTable.plannedDate, date),
          notInArray(infillJobsTable.status, ["planted"]),
        ),
      ),

    // Mulching records
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
  ]);

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
  const [settings] = await db.select().from(systemSettingsTable).limit(1);
  const productiveTimeMins = settings?.productiveTimeMins ?? 390;

  const totalScheduledMins = await computeTotalScheduledMins(teamId, date);
  const newTotal = totalScheduledMins + newJobMins;

  if (newTotal <= productiveTimeMins) return null;

  // Count pending regular maintenance jobs on/after this date that
  // push-forward would shift.
  const [pendingCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.teamId, teamId),
        gte(jobsTable.scheduledDate, date),
        eq(jobsTable.status, "pending"),
        eq(jobsTable.jobType, "scheduled"),
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
