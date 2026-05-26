import { Router } from "express";
import {
  db, assetsTable, jobsTable, teamMembersTable, teamAvailabilityTable,
  systemSettingsTable, jobTeamCompletionsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, sql, notInArray, or } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { FREQ_DAYS, calcCrewAdjustment, type CrewStatus } from "../lib/crew-utils";

const router = Router();

const ABSENT_HOUR_THRESHOLD = 5;
// A job is started today if remaining capacity >= 50% of job time (team finishes it on-site).
// Otherwise it spills to the next working day.
const SPILL_THRESHOLD = 0.5;

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

/** Advance n calendar days, skipping weekends. */
function addWorkingDays(dateStr: string, n: number): string {
  let d = dateStr;
  let added = 0;
  while (added < n) {
    d = addDays(d, 1);
    if (!isWeekend(d)) added++;
  }
  return d;
}

/** Move dateStr forward to the nearest weekday (no-op if already a weekday). */
function toWeekday(dateStr: string): string {
  let d = dateStr;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ── minutesUsed helpers ───────────────────────────────────────────────────────

function addMins(map: Map<string, Map<string, number>>, teamId: string, date: string, mins: number) {
  if (!map.has(teamId)) map.set(teamId, new Map());
  const byDate = map.get(teamId)!;
  byDate.set(date, (byDate.get(date) ?? 0) + mins);
}

function getMins(map: Map<string, Map<string, number>>, teamId: string, date: string): number {
  return map.get(teamId)?.get(date) ?? 0;
}

// ── Absence map ───────────────────────────────────────────────────────────────

async function buildAbsenceMap(
  fromDate: string,
  toDate: string,
  allPersonNames: string[],
): Promise<Map<string, Set<string>>> {
  if (allPersonNames.length === 0) return new Map();

  const availRows = await db
    .select()
    .from(teamAvailabilityTable)
    .where(
      and(
        gte(teamAvailabilityTable.date, fromDate),
        lte(teamAvailabilityTable.date, toDate),
        inArray(teamAvailabilityTable.personName, allPersonNames),
      ),
    );

  const countMap = new Map<string, Map<string, number>>();
  for (const row of availRows) {
    if (row.status === "available") continue;
    if (!countMap.has(row.date)) countMap.set(row.date, new Map());
    const byPerson = countMap.get(row.date)!;
    byPerson.set(row.personName, (byPerson.get(row.personName) ?? 0) + 1);
  }

  const absenceMap = new Map<string, Set<string>>();
  for (const [date, byPerson] of countMap) {
    const absent = new Set<string>();
    for (const [person, count] of byPerson) {
      if (count >= ABSENT_HOUR_THRESHOLD) absent.add(person);
    }
    if (absent.size > 0) absenceMap.set(date, absent);
  }
  return absenceMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/schedule/generate
// Geosequenced scheduler — jobs placed on natural due dates in routeOrder.
// Over-capacity rule: if remaining capacity >= 50% of job time, start today
// (team finishes on-site, day may run slightly over). Otherwise spill to the
// next working day.
// ─────────────────────────────────────────────────────────────────────────────
const generateBodySchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamId:   z.string().uuid().optional(),
});

router.post(
  "/schedule/generate",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(generateBodySchema),
  async (req, res) => {
    const { fromDate, toDate, teamId } = req.body as z.infer<typeof generateBodySchema>;

    // Load system settings
    const [settings] = await db.select().from(systemSettingsTable).limit(1);
    const productiveTimeMins = settings?.productiveTimeMins ?? 390;
    const standardCrewSize   = settings?.standardCrewSize   ?? 2;

    // Load assets ordered by geosequence
    const assets = await db
      .select()
      .from(assetsTable)
      .where(
        teamId
          ? and(eq(assetsTable.isActive, true), eq(assetsTable.teamId, teamId))
          : eq(assetsTable.isActive, true),
      );

    // Load team membership
    const allMembers = await db.select().from(teamMembersTable);
    const membersByTeam = new Map<string, string[]>();
    for (const m of allMembers) {
      if (!membersByTeam.has(m.teamId)) membersByTeam.set(m.teamId, []);
      membersByTeam.get(m.teamId)!.push(m.personName);
    }

    const allPersonNames = allMembers.map(m => m.personName);
    const absenceMap = await buildAbsenceMap(fromDate, toDate, allPersonNames);

    // Pre-load all non-completed jobs in range to initialise minutesUsed
    const existingInRange = await db
      .select({
        teamId:            jobsTable.teamId,
        scheduledDate:     sql<string>`to_char(${jobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        estimatedTimeMins: jobsTable.estimatedTimeMins,
        serviceTimeMins:   assetsTable.serviceTimeMins,
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(
        and(
          gte(jobsTable.scheduledDate, fromDate),
          lte(jobsTable.scheduledDate, toDate),
          notInArray(jobsTable.status, ["completed", "skipped"]),
          ...(teamId ? [eq(jobsTable.teamId, teamId)] : []),
        ),
      );

    const minutesUsed = new Map<string, Map<string, number>>();
    for (const j of existingInRange) {
      if (j.teamId) {
        addMins(minutesUsed, j.teamId, j.scheduledDate, j.estimatedTimeMins ?? j.serviceTimeMins);
      }
    }

    // ── Step 1: Enumerate all (asset, naturalDate) candidates ────────────────
    type Candidate = { asset: typeof assets[number]; naturalDate: string };
    const candidatesByDate = new Map<string, Candidate[]>();

    for (const asset of assets) {
      const intervalDays = FREQ_DAYS[asset.frequency] ?? 28;
      let cursor = fromDate;
      while (cursor <= toDate) {
        const weekday = toWeekday(cursor);
        if (weekday <= toDate) {
          if (!candidatesByDate.has(weekday)) candidatesByDate.set(weekday, []);
          candidatesByDate.get(weekday)!.push({ asset, naturalDate: weekday });
        }
        cursor = addDays(cursor, intervalDays);
      }
    }

    // ── Step 2: Process dates in order, per-team geosequence with look-ahead ─
    //
    // For each team's day:
    //   • Place jobs in routeOrder (geosequence).
    //   • When a job doesn't fit in remaining time, keep scanning forward for a
    //     smaller job that does fit (filling the slot efficiently).
    //   • After exhausting all fitting options, start the first deferred job
    //     today anyway — the crew begins it and finishes it first thing tomorrow.
    //     Any remaining deferred jobs spill to the next working day.
    // ─────────────────────────────────────────────────────────────────────────
    const sortedDates = Array.from(candidatesByDate.keys()).sort();

    let jobsCreated = 0;
    let jobsRefreshed = 0;
    let jobsSpilled = 0;

    type AssetRow = typeof assets[number];

    const insertRows: {
      assetId: string;
      jobType: "scheduled";
      teamId: string | null;
      scheduledDate: string;
      status: "pending";
      estimatedTimeMins: number;
      crewStatus: CrewStatus;
      isAllTeams?: boolean;
    }[] = [];

    // spillQueue: date → assets to prepend to that day (geosequence order preserved)
    const spillQueue = new Map<string, AssetRow[]>();

    // Helper: dedup-check one asset against DB; returns true if should skip
    async function existsInWindow(asset: AssetRow, refDate: string): Promise<boolean> {
      const intervalDays = (FREQ_DAYS as Record<string, number>)[asset.frequency] ?? 28;
      const windowStart  = addDays(refDate, -(intervalDays - 1));
      const [row] = await db
        .select({
          id:            jobsTable.id,
          status:        jobsTable.status,
          scheduledDate: sql<string>`to_char(${jobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        })
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.assetId, asset.id),
            gte(jobsTable.scheduledDate, windowStart),
            lte(jobsTable.scheduledDate, refDate),
            eq(jobsTable.jobType, "scheduled"),
            notInArray(jobsTable.status, ["completed", "skipped"]),
          ),
        )
        .limit(1);

      if (!row) return false;

      // Exact-date pending match → refresh crew status
      if (row.scheduledDate === refDate && row.status === "pending") {
        const tid = asset.teamId ?? null;
        const { estimatedTimeMins, crewStatus } = calcCrewAdjustment(
          tid, refDate, membersByTeam, absenceMap, asset.serviceTimeMins, standardCrewSize,
        );
        await db
          .update(jobsTable)
          .set({ estimatedTimeMins, crewStatus, updatedAt: new Date() })
          .where(eq(jobsTable.id, row.id));
        jobsRefreshed++;
      }
      return true;
    }

    // Helper: emit a job row and update minutesUsed
    function placeJob(asset: AssetRow, date: string, estMins: number, cs: CrewStatus) {
      const tid = asset.teamId ?? null;
      if (tid) addMins(minutesUsed, tid, date, estMins);
      insertRows.push({
        assetId: asset.id, jobType: "scheduled", teamId: tid,
        scheduledDate: date, status: "pending",
        estimatedTimeMins: estMins, crewStatus: cs,
        isAllTeams: !tid,
      });
      jobsCreated++;
    }

    for (const naturalDate of sortedDates) {
      const dayCandidates = candidatesByDate.get(naturalDate)!;

      // Geosequence order; service time is tiebreaker
      dayCandidates.sort((a, b) => {
        const ro_a = a.asset.routeOrder ?? 999999;
        const ro_b = b.asset.routeOrder ?? 999999;
        if (ro_a !== ro_b) return ro_a - ro_b;
        return a.asset.serviceTimeMins - b.asset.serviceTimeMins;
      });

      // Collect assets for this day: spill-overs first, then natural candidates
      const spills = spillQueue.get(naturalDate) ?? [];
      spillQueue.delete(naturalDate);
      const allAssets: AssetRow[] = [
        ...spills,
        ...dayCandidates.map(c => c.asset),
      ];

      // Group by team so look-ahead operates within each team's queue independently
      const byTeam = new Map<string, AssetRow[]>();
      for (const asset of allAssets) {
        const key = asset.teamId ?? "__none__";
        if (!byTeam.has(key)) byTeam.set(key, []);
        byTeam.get(key)!.push(asset);
      }

      for (const [teamKey, teamAssets] of byTeam) {
        const tid = teamKey === "__none__" ? null : teamKey;

        // Filter out assets that already have a job in their interval window
        const eligible: AssetRow[] = [];
        for (const asset of teamAssets) {
          const skip = await existsInWindow(asset, naturalDate);
          if (!skip) eligible.push(asset);
        }
        if (eligible.length === 0) continue;

        // ── Place in geosequence; max 1-job look-ahead when slot is tight ──────
        //
        // When job[i] doesn't fit:
        //   • Peek at job[i+1] only.
        //   • If job[i+1] fits → place it today (fills the slot), then start
        //     job[i] today as an overrun (crew finishes it tomorrow morning),
        //     and spill job[i+2 …] to the next working day.
        //   • If job[i+1] doesn't fit (or doesn't exist) → start job[i] today
        //     as an overrun, spill job[i+1 …] to the next working day.
        //
        // In both cases the day is closed for this team after the overrun.
        // ─────────────────────────────────────────────────────────────────────
        const nextDay = addWorkingDays(naturalDate, 1);

        const spillAssets = (from: number) => {
          for (let k = from; k < eligible.length; k++) {
            if (nextDay <= toDate) {
              if (!spillQueue.has(nextDay)) spillQueue.set(nextDay, []);
              spillQueue.get(nextDay)!.push(eligible[k]);
              jobsSpilled++;
            } else {
              const { estimatedTimeMins: e, crewStatus: c } = calcCrewAdjustment(
                tid, naturalDate, membersByTeam, absenceMap, eligible[k].serviceTimeMins, standardCrewSize,
              );
              placeJob(eligible[k], naturalDate, e, c);
            }
          }
        };

        let dayDone = false;
        for (let i = 0; i < eligible.length; i++) {
          if (dayDone) break;

          const asset = eligible[i];
          const usedToday = tid ? getMins(minutesUsed, tid, naturalDate) : 0;
          const remaining = productiveTimeMins - usedToday;
          const { estimatedTimeMins: estMins, crewStatus: cs } = calcCrewAdjustment(
            tid, naturalDate, membersByTeam, absenceMap, asset.serviceTimeMins, standardCrewSize,
          );

          if (!tid || remaining >= estMins) {
            // Fits — place today and continue
            placeJob(asset, naturalDate, estMins, cs);
          } else {
            // Doesn't fit — peek at the immediately next job only
            const nextAsset = eligible[i + 1];
            if (nextAsset) {
              const usedAfter = tid ? getMins(minutesUsed, tid, naturalDate) : 0;
              const remAfter  = productiveTimeMins - usedAfter;
              const { estimatedTimeMins: estNext, crewStatus: csNext } = calcCrewAdjustment(
                tid, naturalDate, membersByTeam, absenceMap, nextAsset.serviceTimeMins, standardCrewSize,
              );

              if (!tid || remAfter >= estNext) {
                // Next job fits the remaining slot — place it today
                placeJob(nextAsset, naturalDate, estNext, csNext);
              }
              // Whether or not the next job fit, start the current job today (overrun)
              placeJob(asset, naturalDate, estMins, cs);
              // Spill everything from i+2 onwards (or i+1 if next didn't fit)
              const spillFrom = (!tid || remAfter >= estNext) ? i + 2 : i + 1;
              spillAssets(spillFrom);
            } else {
              // No next job — start current today as overrun; nothing to spill
              placeJob(asset, naturalDate, estMins, cs);
            }
            dayDone = true;
          }
        }
      }
    }

    // Flush any remaining spill-overs (dates added by spilling beyond sortedDates)
    const pendingSpillDates = [...spillQueue.keys()].sort();
    for (const spillDate of pendingSpillDates) {
      if (spillDate > toDate) continue;
      const spills = spillQueue.get(spillDate)!;
      for (const asset of spills) {
        const tid = asset.teamId ?? null;
        const { estimatedTimeMins: estMins, crewStatus: cs } = calcCrewAdjustment(
          tid, spillDate, membersByTeam, absenceMap, asset.serviceTimeMins, standardCrewSize,
        );
        placeJob(asset, spillDate, estMins, cs);
      }
    }

    if (insertRows.length > 0) {
      await db.insert(jobsTable).values(insertRows);
    }

    res.json({ jobsCreated, jobsRefreshed, jobsSpilled, fromDate, toDate });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/schedule/week
// Returns jobs for a Mon–Sun week, sorted by route_order within each day.
// Includes system settings for client-side capacity bar rendering.
// ─────────────────────────────────────────────────────────────────────────────
const weekQuerySchema = z.object({
  week:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamId: z.string().uuid().optional(),
});

router.get(
  "/schedule/week",
  requireAuth,
  validateQuery(weekQuerySchema),
  async (req, res) => {
    const { week, teamId } = res.locals.query as z.infer<typeof weekQuerySchema>;
    const weekStart = mondayOf(week);
    const weekEnd   = addDays(weekStart, 6);

    const [settings] = await db.select().from(systemSettingsTable).limit(1);

    const condition = and(
      gte(jobsTable.scheduledDate, weekStart),
      lte(jobsTable.scheduledDate, weekEnd),
      ...(teamId ? [or(eq(jobsTable.teamId, teamId), eq(jobsTable.isAllTeams, true))] : []),
    );

    const rows = await db
      .select({
        id:                jobsTable.id,
        assetId:           jobsTable.assetId,
        jobType:           jobsTable.jobType,
        status:            jobsTable.status,
        teamId:            jobsTable.teamId,
        isAllTeams:        jobsTable.isAllTeams,
        assignedUserId:    jobsTable.assignedUserId,
        scheduledDate:     sql<string>`to_char(${jobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        startedAt:         jobsTable.startedAt,
        completedAt:       jobsTable.completedAt,
        actualTimeMins:    jobsTable.actualTimeMins,
        estimatedTimeMins: jobsTable.estimatedTimeMins,
        crewStatus:        jobsTable.crewStatus,
        notes:             jobsTable.notes,
        createdAt:         jobsTable.createdAt,
        updatedAt:         jobsTable.updatedAt,
        assetName:         assetsTable.name,
        assetRef:          assetsTable.reference,
        assetDesc:         assetsTable.description,
        gardenType:        assetsTable.gardenType,
        suburb:            assetsTable.suburb,
        serviceTimeMins:   assetsTable.serviceTimeMins,
        routeOrder:        assetsTable.routeOrder,
        frequency:         assetsTable.frequency,
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(condition)
      .orderBy(
        jobsTable.scheduledDate,
        sql`${assetsTable.routeOrder} NULLS LAST`,
        assetsTable.name,
      );

    // Fetch per-team sign-off records for All Teams jobs
    const allTeamsJobIds = rows.filter(r => r.isAllTeams).map(r => r.id);
    const completionsByJobId = new Map<string, { teamId: string; completedAt: Date; actualTimeMins: number | null }[]>();
    if (allTeamsJobIds.length > 0) {
      const completions = await db
        .select({
          jobId:          jobTeamCompletionsTable.jobId,
          teamId:         jobTeamCompletionsTable.teamId,
          completedAt:    jobTeamCompletionsTable.completedAt,
          actualTimeMins: jobTeamCompletionsTable.actualTimeMins,
        })
        .from(jobTeamCompletionsTable)
        .where(inArray(jobTeamCompletionsTable.jobId, allTeamsJobIds));
      for (const c of completions) {
        if (!completionsByJobId.has(c.jobId)) completionsByJobId.set(c.jobId, []);
        completionsByJobId.get(c.jobId)!.push({ teamId: c.teamId, completedAt: c.completedAt, actualTimeMins: c.actualTimeMins });
      }
    }

    const enrichedRows = rows.map(r => ({
      ...r,
      teamCompletions: r.isAllTeams ? (completionsByJobId.get(r.id) ?? []) : [],
    }));

    const dayMap = new Map<string, typeof enrichedRows>();
    for (let i = 0; i < 7; i++) {
      dayMap.set(addDays(weekStart, i), []);
    }
    for (const row of enrichedRows) {
      dayMap.get(row.scheduledDate)?.push(row);
    }

    const days = Array.from(dayMap.entries()).map(([date, jobs]) => ({ date, jobs }));

    res.json({
      weekStart,
      weekEnd,
      days,
      totalJobs:     rows.length,
      completedJobs: rows.filter(r => r.status === "completed").length,
      settings: {
        productiveTimeMins: settings?.productiveTimeMins ?? 390,
        standardCrewSize:   settings?.standardCrewSize   ?? 2,
      },
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/schedule/range — jobs grouped by asset for Gantt view
// ─────────────────────────────────────────────────────────────────────────────
const rangeQuerySchema = z.object({
  from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamId: z.string().uuid().optional(),
});

router.get(
  "/schedule/range",
  requireAuth,
  validateQuery(rangeQuerySchema),
  async (req, res) => {
    const { from, to, teamId } = res.locals.query as z.infer<typeof rangeQuerySchema>;

    const rows = await db
      .select({
        jobId:             jobsTable.id,
        scheduledDate:     sql<string>`to_char(${jobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        status:            jobsTable.status,
        crewStatus:        jobsTable.crewStatus,
        assetId:           assetsTable.id,
        assetName:         assetsTable.name,
        assetRef:          assetsTable.reference,
        assetDesc:         assetsTable.description,
        gardenType:        assetsTable.gardenType,
        standard:          assetsTable.standard,
        frequency:         assetsTable.frequency,
        serviceTimeMins:   assetsTable.serviceTimeMins,
        estimatedTimeMins: jobsTable.estimatedTimeMins,
        teamId:            assetsTable.teamId,
        routeOrder:        assetsTable.routeOrder,
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(
        and(
          gte(jobsTable.scheduledDate, from),
          lte(jobsTable.scheduledDate, to),
          ...(teamId ? [eq(jobsTable.teamId, teamId)] : []),
        ),
      )
      .orderBy(
        sql`${assetsTable.routeOrder} NULLS LAST`,
        assetsTable.name,
        jobsTable.scheduledDate,
      );

    const assetMap = new Map<string, {
      assetId: string; assetName: string; assetRef: string;
      gardenType: string; standard: string; frequency: string;
      serviceTimeMins: number; teamId: string | null; routeOrder: number | null;
      jobs: { id: string; scheduledDate: string; status: string; crewStatus: string | null; estimatedTimeMins: number | null }[];
    }>();

    for (const row of rows) {
      if (!assetMap.has(row.assetId)) {
        assetMap.set(row.assetId, {
          assetId: row.assetId, assetName: row.assetName, assetRef: row.assetRef,
          gardenType: row.gardenType, standard: row.standard, frequency: row.frequency,
          serviceTimeMins: row.serviceTimeMins, teamId: row.teamId, routeOrder: row.routeOrder,
          jobs: [],
        });
      }
      assetMap.get(row.assetId)!.jobs.push({
        id: row.jobId, scheduledDate: row.scheduledDate, status: row.status,
        crewStatus: row.crewStatus, estimatedTimeMins: row.estimatedTimeMins,
      });
    }

    res.json({ from, to, rows: Array.from(assetMap.values()) });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/schedule/day-capacity
// Returns capacity usage per team for a specific date.
// Used by the reactive job impact flow.
// ─────────────────────────────────────────────────────────────────────────────
const dayCapacityQuerySchema = z.object({
  date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamId: z.string().uuid(),
});

router.get(
  "/schedule/day-capacity",
  requireAuth,
  validateQuery(dayCapacityQuerySchema),
  async (req, res) => {
    const { date, teamId } = res.locals.query as z.infer<typeof dayCapacityQuerySchema>;

    const [settings] = await db.select().from(systemSettingsTable).limit(1);
    const productiveTimeMins = settings?.productiveTimeMins ?? 390;

    const jobs = await db
      .select({
        id:                jobsTable.id,
        status:            jobsTable.status,
        jobType:           jobsTable.jobType,
        estimatedTimeMins: jobsTable.estimatedTimeMins,
        serviceTimeMins:   assetsTable.serviceTimeMins,
        assetName:         assetsTable.name,
        assetRef:          assetsTable.reference,
        assetDesc:         assetsTable.description,
        routeOrder:        assetsTable.routeOrder,
        crewStatus:        jobsTable.crewStatus,
        notes:             jobsTable.notes,
        assetId:           jobsTable.assetId,
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(
        and(
          eq(jobsTable.teamId, teamId),
          eq(jobsTable.scheduledDate, date),
          notInArray(jobsTable.status, ["completed", "skipped"]),
        ),
      )
      .orderBy(sql`${assetsTable.routeOrder} NULLS LAST`, assetsTable.name);

    const totalMins = jobs.reduce(
      (sum, j) => sum + (j.estimatedTimeMins ?? j.serviceTimeMins),
      0,
    );

    res.json({
      date,
      teamId,
      productiveTimeMins,
      totalScheduledMins: totalMins,
      utilizationPct:     Math.round((totalMins / productiveTimeMins) * 100),
      jobs,
    });
  },
);

export default router;
