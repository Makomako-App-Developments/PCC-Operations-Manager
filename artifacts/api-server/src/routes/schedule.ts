import { Router } from "express";
import {
  db, assetsTable, jobsTable, teamMembersTable, teamAvailabilityTable,
  systemSettingsTable, jobTeamCompletionsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, sql, notInArray, or, isNull } from "drizzle-orm";
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
// Geosequence-first scheduler with ±3-day due-date flexibility.
//
// ALGORITHM:
//   For each team, assets are sorted by routeOrder (geosequence). Each asset
//   has a natural due date derived from its frequency interval starting at
//   fromDate. The scheduler walks through each working day in the range and,
//   for each team, tries to place the next-in-geosequence asset if that
//   asset's natural due date is within ±3 days of today. This keeps the route
//   contiguous while allowing minor date shifts to maintain flow. When a day
//   fills up, remaining eligible assets spill to the next working day.
//
// ±3-day window rule:
//   An asset is "eligible" for a given day if:
//     naturalDueDate - 3 ≤ candidateDay ≤ naturalDueDate + 3
//   AND it has not already been placed this cycle.
// ─────────────────────────────────────────────────────────────────────────────
const DUE_DATE_FLEX_DAYS = 3;

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

    // ── Clear existing pending scheduled jobs in the range before regenerating ─
    // Completed and skipped jobs are preserved; only pending/in-progress ones
    // are wiped so the new geosequence-first algorithm can place them cleanly.
    await db
      .delete(jobsTable)
      .where(
        and(
          gte(jobsTable.scheduledDate, fromDate),
          lte(jobsTable.scheduledDate, toDate),
          eq(jobsTable.jobType, "scheduled"),
          inArray(jobsTable.status, ["pending", "in_progress"]),
          ...(teamId
            ? [eq(jobsTable.teamId, teamId)]
            : []),
        ),
      );

    // Load assets in geosequence order (routeOrder ASC, nulls last)
    const assets = await db
      .select()
      .from(assetsTable)
      .where(
        teamId
          ? and(eq(assetsTable.isActive, true), eq(assetsTable.teamId, teamId))
          : eq(assetsTable.isActive, true),
      )
      .orderBy(sql`${assetsTable.routeOrder} NULLS LAST`, assetsTable.name);

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

    type AssetRow = typeof assets[number];

    // ── Step 1: Group assets by team ─────────────────────────────────────────
    // Assets are already in geosequence order from the DB query.
    const assetsByTeam = new Map<string, AssetRow[]>();
    for (const asset of assets) {
      const key = asset.teamId ?? "__none__";
      if (!assetsByTeam.has(key)) assetsByTeam.set(key, []);
      assetsByTeam.get(key)!.push(asset);
    }

    // ── Step 2: For each team+asset, compute all natural due dates in range ──
    // naturalDueDates[teamKey][assetId] = array of due date strings (weekdays)
    // within [fromDate - flex, toDate + flex] so window lookups work at edges.
    type AssetSchedule = {
      asset: AssetRow;
      dueDates: string[]; // sorted natural weekday due dates within the range
      placedDates: Set<string>; // which due-date cycles have been placed
    };
    const teamSchedules = new Map<string, AssetSchedule[]>();

    for (const [teamKey, teamAssets] of assetsByTeam) {
      const schedules: AssetSchedule[] = [];
      for (const asset of teamAssets) {
        const intervalDays = FREQ_DAYS[asset.frequency] ?? 28;
        const dueDates: string[] = [];
        // Start from before fromDate so first due date in range is caught
        let cursor = fromDate;
        while (cursor <= addDays(toDate, DUE_DATE_FLEX_DAYS)) {
          const weekday = toWeekday(cursor);
          if (weekday >= addDays(fromDate, -DUE_DATE_FLEX_DAYS)) {
            dueDates.push(weekday);
          }
          cursor = addDays(cursor, intervalDays);
        }
        schedules.push({ asset, dueDates, placedDates: new Set() });
      }
      teamSchedules.set(teamKey, schedules);
    }

    // ── Step 3: Check DB for already-placed jobs in this run's range ─────────
    // Track which (assetId, dueDate cycle) already has a job so we skip them.
    // We use the nearest natural due date to the existing job's scheduled date.
    const existingJobDates = await db
      .select({
        assetId:       jobsTable.assetId,
        scheduledDate: sql<string>`to_char(${jobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        status:        jobsTable.status,
        id:            jobsTable.id,
        estimatedTimeMins: jobsTable.estimatedTimeMins,
      })
      .from(jobsTable)
      .where(
        and(
          gte(jobsTable.scheduledDate, addDays(fromDate, -DUE_DATE_FLEX_DAYS)),
          lte(jobsTable.scheduledDate, addDays(toDate, DUE_DATE_FLEX_DAYS)),
          eq(jobsTable.jobType, "scheduled"),
          notInArray(jobsTable.status, ["completed", "skipped"]),
          ...(teamId ? [eq(jobsTable.teamId, teamId)] : []),
        ),
      );

    // Map assetId → set of scheduledDate strings that already exist
    const existingByAsset = new Map<string, Set<string>>();
    for (const j of existingJobDates) {
      if (!existingByAsset.has(j.assetId)) existingByAsset.set(j.assetId, new Set());
      existingByAsset.get(j.assetId)!.add(j.scheduledDate);
    }

    // Mark placedDates for assets that already have jobs in the range
    for (const [, schedules] of teamSchedules) {
      for (const sched of schedules) {
        const existingDates = existingByAsset.get(sched.asset.id);
        if (!existingDates) continue;
        for (const existingDate of existingDates) {
          // Find which due-date cycle this existing job belongs to
          const intervalDays = FREQ_DAYS[sched.asset.frequency] ?? 28;
          for (const dueDate of sched.dueDates) {
            const diff = Math.abs(
              (new Date(existingDate + "T00:00:00Z").getTime() -
               new Date(dueDate    + "T00:00:00Z").getTime()) / 86400000
            );
            if (diff <= DUE_DATE_FLEX_DAYS) {
              sched.placedDates.add(dueDate);
              break;
            }
          }
        }
      }
    }

    // ── Step 4: Build list of all working days in range ──────────────────────
    const workingDays: string[] = [];
    let dayCursor = fromDate;
    while (dayCursor <= toDate) {
      if (!isWeekend(dayCursor)) workingDays.push(dayCursor);
      dayCursor = addDays(dayCursor, 1);
    }

    let jobsCreated = 0;
    let jobsRefreshed = 0;
    let jobsSpilled = 0;

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

    // ── Step 5: Walk each working day; for each team fill in geosequence ─────
    //
    // On each day, for each team's asset list (already in geosequence order):
    //   • An asset is eligible if it has a natural due date D where
    //     D - flex ≤ today ≤ D + flex, AND that due-date cycle hasn't been placed.
    //   • We only consider the NEXT unplaced asset in geosequence order as eligible
    //     (not all eligible assets) — this maintains route contiguity.
    //   • If the next asset fits in remaining capacity → place it, advance pointer.
    //   • If it doesn't fit → spill it (and all subsequent) to the next working day
    //     by marking them as "pending for next day" via a carry queue.
    //   • Exception: if only this one asset remains for the day and the day would
    //     otherwise be empty, place it as an overrun (crew finishes tomorrow).
    //
    // carryQueue[teamKey]: assets that overflowed from a previous day and must
    // be placed as soon as possible (prepended before natural eligibles).
    // ─────────────────────────────────────────────────────────────────────────
    const carryQueue = new Map<string, { asset: AssetRow; dueDate: string }[]>();

    for (const today of workingDays) {
      for (const [teamKey, schedules] of teamSchedules) {
        const tid = teamKey === "__none__" ? null : teamKey;

        // Build today's work queue:
        // 1. Carried-over assets from previous day that are now overdue
        const carried = (carryQueue.get(teamKey) ?? []).filter(c => {
          // Keep carrying if still within flex window or past it (must place)
          return addDays(c.dueDate, DUE_DATE_FLEX_DAYS) >= today;
        });
        // Remove from carry queue
        carryQueue.set(teamKey, (carryQueue.get(teamKey) ?? []).filter(c =>
          !carried.some(cc => cc.asset.id === c.asset.id && cc.dueDate === c.dueDate)
        ));

        // 2. Find assets newly eligible today (next unplaced asset in geosequence
        //    whose due date window includes today)
        const newEligible: { asset: AssetRow; dueDate: string }[] = [];
        for (const sched of schedules) {
          // Find the first unplaced due date that is eligible for today
          for (const dueDate of sched.dueDates) {
            if (sched.placedDates.has(dueDate)) continue;
            const earliest = addDays(dueDate, -DUE_DATE_FLEX_DAYS);
            const latest   = addDays(dueDate,  DUE_DATE_FLEX_DAYS);
            if (today >= earliest && today <= latest) {
              newEligible.push({ asset: sched.asset, dueDate });
              break; // only one due-date cycle per asset per pass
            }
            // If today is before the window opens for this due date, stop checking
            // further due dates for this asset (they'll be even later)
            if (today < earliest) break;
          }
        }

        // Merge: carried first (maintain geosequence within each group)
        const toPlace = [...carried, ...newEligible];
        if (toPlace.length === 0) continue;

        // Deduplicate by assetId (carried asset shouldn't appear in newEligible too)
        const seen = new Set<string>();
        const queue = toPlace.filter(x => {
          if (seen.has(x.asset.id)) return false;
          seen.add(x.asset.id);
          return true;
        });

        let dayFull = false;
        const nextWorkDay = addWorkingDays(today, 1);

        for (let i = 0; i < queue.length; i++) {
          const { asset, dueDate } = queue[i];
          const sched = schedules.find(s => s.asset.id === asset.id)!;

          // Already placed (e.g. an existing job was found in DB)
          if (sched.placedDates.has(dueDate)) continue;

          const usedToday = tid ? getMins(minutesUsed, tid, today) : 0;
          const remaining = productiveTimeMins - usedToday;
          const { estimatedTimeMins: estMins, crewStatus: cs } = calcCrewAdjustment(
            tid, today, membersByTeam, absenceMap, asset.serviceTimeMins, standardCrewSize,
          );

          // Check if this asset is overdue (past its flex window) — must place today
          const latestDate = addDays(dueDate, DUE_DATE_FLEX_DAYS);
          const isOverdue = today >= latestDate;

          if (dayFull && !isOverdue) {
            // Day is full and asset is not overdue — carry to next working day
            if (nextWorkDay <= addDays(toDate, DUE_DATE_FLEX_DAYS)) {
              if (!carryQueue.has(teamKey)) carryQueue.set(teamKey, []);
              carryQueue.get(teamKey)!.push({ asset, dueDate });
              jobsSpilled++;
            } else {
              // No more working days — place anyway
              placeJob(asset, today, estMins, cs);
              sched.placedDates.add(dueDate);
            }
            continue;
          }

          if (!tid || remaining >= estMins || isOverdue) {
            // Fits, or must be placed (overdue) — place today
            placeJob(asset, today, estMins, cs);
            sched.placedDates.add(dueDate);
            if (tid && remaining < estMins) {
              // Overrun — day is now full
              dayFull = true;
            }
          } else {
            // Doesn't fit and not overdue — carry to next working day
            if (nextWorkDay <= addDays(toDate, DUE_DATE_FLEX_DAYS)) {
              if (!carryQueue.has(teamKey)) carryQueue.set(teamKey, []);
              carryQueue.get(teamKey)!.push({ asset, dueDate });
              jobsSpilled++;
            } else {
              placeJob(asset, today, estMins, cs);
              sched.placedDates.add(dueDate);
            }
            dayFull = true;
          }
        }
      }
    }

    // ── Step 6: Flush remaining carry-overs (past toDate — place on last day) ─
    const lastWorkDay = workingDays[workingDays.length - 1] ?? toDate;
    for (const [teamKey, remaining] of carryQueue) {
      const tid = teamKey === "__none__" ? null : teamKey;
      for (const { asset, dueDate } of remaining) {
        const sched = teamSchedules.get(teamKey)?.find(s => s.asset.id === asset.id);
        if (!sched || sched.placedDates.has(dueDate)) continue;
        const { estimatedTimeMins: estMins, crewStatus: cs } = calcCrewAdjustment(
          tid, lastWorkDay, membersByTeam, absenceMap, asset.serviceTimeMins, standardCrewSize,
        );
        placeJob(asset, lastWorkDay, estMins, cs);
        sched.placedDates.add(dueDate);
      }
    }

    // ── Step 7: Refresh crew status for existing pending jobs ─────────────────
    for (const j of existingJobDates) {
      if (j.status !== "pending") continue;
      const asset = assets.find(a => a.id === j.assetId);
      if (!asset) continue;
      const tid = asset.teamId ?? null;
      const { estimatedTimeMins, crewStatus } = calcCrewAdjustment(
        tid, j.scheduledDate, membersByTeam, absenceMap, asset.serviceTimeMins, standardCrewSize,
      );
      await db
        .update(jobsTable)
        .set({ estimatedTimeMins, crewStatus, updatedAt: new Date() })
        .where(eq(jobsTable.id, j.id));
      jobsRefreshed++;
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
        streetAddress:     assetsTable.streetAddress,
        lat:               assetsTable.lat,
        lng:               assetsTable.lng,
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
      assetId: string; assetName: string; assetRef: string; assetDesc: string | null;
      gardenType: string; standard: string; frequency: string;
      serviceTimeMins: number; teamId: string | null; routeOrder: number | null;
      jobs: { id: string; scheduledDate: string; status: string; crewStatus: string | null; estimatedTimeMins: number | null }[];
    }>();

    for (const row of rows) {
      if (!assetMap.has(row.assetId)) {
        assetMap.set(row.assetId, {
          assetId: row.assetId, assetName: row.assetName, assetRef: row.assetRef, assetDesc: row.assetDesc,
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
