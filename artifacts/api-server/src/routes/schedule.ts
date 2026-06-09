import { Router } from "express";
import {
  db, assetsTable, jobsTable, teamMembersTable, teamAvailabilityTable,
  systemSettingsTable, jobTeamCompletionsTable, infillJobsTable, mulchingRecordsTable,
  reactiveJobsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, sql, notInArray, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { FREQ_DAYS, calcCrewAdjustment, loadSystemSettings, buildAbsenceDataForTeamDate, type CrewStatus } from "../lib/crew-utils";

const router = Router();

function isPrivilegedRole(role: string): boolean {
  return ["administrator", "manager", "supervisor"].includes(role);
}

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
        // 1. All carried-over assets from previous days (retained indefinitely
        //    until placed — no expiry — so capacity always wins over force-placement)
        const carried = carryQueue.get(teamKey) ?? [];
        carryQueue.set(teamKey, []); // clear; assets that don't fit today are re-added below

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

          if (dayFull) {
            // Day is full — always carry to next working day (capacity always wins;
            // no force-placement based on overdue status to prevent pile-up)
            if (nextWorkDay <= addDays(toDate, DUE_DATE_FLEX_DAYS)) {
              if (!carryQueue.has(teamKey)) carryQueue.set(teamKey, []);
              carryQueue.get(teamKey)!.push({ asset, dueDate });
              jobsSpilled++;
            } else {
              // No more working days in range — place on last day
              placeJob(asset, today, estMins, cs);
              sched.placedDates.add(dueDate);
            }
            continue;
          }

          if (!tid || remaining >= estMins) {
            // Fits (or no-team asset) — place today
            placeJob(asset, today, estMins, cs);
            sched.placedDates.add(dueDate);
            if (tid && remaining < estMins) {
              dayFull = true;
            }
          } else {
            // Doesn't fit — carry to next working day
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
    const { week } = res.locals.query as z.infer<typeof weekQuerySchema>;
    let { teamId } = res.locals.query as z.infer<typeof weekQuerySchema>;

    // Only administrators and managers may view all teams' schedules;
    // supervisors and field workers are restricted to their own team.
    if (!["administrator", "manager"].includes(req.auth!.role)) {
      const callerTeamId = req.auth!.teamId;
      if (!callerTeamId) { res.json({ days: {} }); return; }
      teamId = callerTeamId;
    }

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

    // ── Merge infill planting jobs into day buckets ───────────────────────────
    const infillConditions = and(
      gte(infillJobsTable.plannedDate, weekStart),
      lte(infillJobsTable.plannedDate, weekEnd),
      inArray(infillJobsTable.status, ["scheduled", "in_progress", "completed"]),
      ...(teamId ? [eq(infillJobsTable.assignedTeamId, teamId)] : []),
    );

    const infillRows = await db
      .select({
        id:             infillJobsTable.id,
        assetId:        infillJobsTable.assetId,
        plannedDate:    sql<string>`to_char(${infillJobsTable.plannedDate}, 'YYYY-MM-DD')`,
        status:         infillJobsTable.status,
        assignedTeamId: infillJobsTable.assignedTeamId,
        estimatedMins:  infillJobsTable.estimatedMins,
        assessmentNotes:infillJobsTable.assessmentNotes,
        createdAt:      infillJobsTable.createdAt,
        updatedAt:      infillJobsTable.updatedAt,
        assetName:      assetsTable.name,
        assetDesc:      assetsTable.description,
        gardenType:     assetsTable.gardenType,
        suburb:         assetsTable.suburb,
        streetAddress:  assetsTable.streetAddress,
        lat:            assetsTable.lat,
        lng:            assetsTable.lng,
        serviceTimeMins:assetsTable.serviceTimeMins,
        routeOrder:     assetsTable.routeOrder,
        frequency:      assetsTable.frequency,
      })
      .from(infillJobsTable)
      .innerJoin(assetsTable, eq(infillJobsTable.assetId, assetsTable.id))
      .where(infillConditions)
      .orderBy(
        infillJobsTable.plannedDate,
        sql`${assetsTable.routeOrder} NULLS LAST`,
        assetsTable.name,
      );

    // Map infill statuses to the standard job status vocabulary the mobile app uses
    const infillStatusMap: Record<string, string> = {
      scheduled:   "pending",
      in_progress: "in_progress",
      completed:   "completed",
    };

    for (const ir of infillRows) {
      const mapped = {
        id:                ir.id,
        assetId:           ir.assetId,
        jobType:           "infill_planting" as const,
        status:            infillStatusMap[ir.status] ?? "pending",
        teamId:            ir.assignedTeamId,
        isAllTeams:        false,
        assignedUserId:    null,
        scheduledDate:     ir.plannedDate,
        startedAt:         null,
        completedAt:       null,
        actualTimeMins:    null,
        estimatedTimeMins: ir.estimatedMins,
        crewStatus:        null,
        notes:             ir.assessmentNotes,
        createdAt:         ir.createdAt,
        updatedAt:         ir.updatedAt,
        assetName:         ir.assetName,
        assetDesc:         ir.assetDesc,
        gardenType:        ir.gardenType,
        suburb:            ir.suburb,
        streetAddress:     ir.streetAddress,
        lat:               ir.lat,
        lng:               ir.lng,
        serviceTimeMins:   ir.estimatedMins ?? ir.serviceTimeMins,
        routeOrder:        ir.routeOrder,
        frequency:         ir.frequency,
        teamCompletions:   [],
      };
      dayMap.get(ir.plannedDate)?.push(mapped as any);
    }

    // ── Merge mulching jobs into day buckets ──────────────────────────────────
    const mulchConditions = and(
      gte(mulchingRecordsTable.scheduledDate, weekStart),
      lte(mulchingRecordsTable.scheduledDate, weekEnd),
      inArray(mulchingRecordsTable.status, ["scheduled", "completed"]),
      ...(teamId ? [eq(mulchingRecordsTable.assignedTeamId, teamId)] : []),
    );

    const mulchRows = await db
      .select({
        id:             mulchingRecordsTable.id,
        assetId:        mulchingRecordsTable.assetId,
        scheduledDate:  sql<string>`to_char(${mulchingRecordsTable.scheduledDate}, 'YYYY-MM-DD')`,
        completedDate:  mulchingRecordsTable.completedDate,
        status:         mulchingRecordsTable.status,
        assignedTeamId: mulchingRecordsTable.assignedTeamId,
        estimatedMins:  mulchingRecordsTable.estimatedMins,
        notes:          mulchingRecordsTable.notes,
        mulchType:      mulchingRecordsTable.mulchType,
        volumeM3:       mulchingRecordsTable.volumeM3,
        createdAt:      mulchingRecordsTable.createdAt,
        updatedAt:      mulchingRecordsTable.updatedAt,
        assetName:      assetsTable.name,
        assetDesc:      assetsTable.description,
        gardenType:     assetsTable.gardenType,
        suburb:         assetsTable.suburb,
        streetAddress:  assetsTable.streetAddress,
        lat:            assetsTable.lat,
        lng:            assetsTable.lng,
        serviceTimeMins:assetsTable.serviceTimeMins,
        routeOrder:     assetsTable.routeOrder,
        frequency:      assetsTable.frequency,
      })
      .from(mulchingRecordsTable)
      .innerJoin(assetsTable, eq(mulchingRecordsTable.assetId, assetsTable.id))
      .where(mulchConditions)
      .orderBy(
        mulchingRecordsTable.scheduledDate,
        sql`${assetsTable.routeOrder} NULLS LAST`,
        assetsTable.name,
      );

    const mulchStatusMap: Record<string, string> = {
      scheduled: "pending",
      completed: "completed",
    };

    for (const mr of mulchRows) {
      const mapped = {
        id:                mr.id,
        assetId:           mr.assetId,
        jobType:           "mulching" as const,
        status:            mulchStatusMap[mr.status] ?? "pending",
        teamId:            mr.assignedTeamId,
        isAllTeams:        false,
        assignedUserId:    null,
        scheduledDate:     mr.scheduledDate,
        startedAt:         null,
        completedAt:       mr.completedDate ? new Date(`${mr.completedDate}T00:00:00Z`) : null,
        actualTimeMins:    null,
        estimatedTimeMins: mr.estimatedMins,
        crewStatus:        null,
        notes:             mr.notes,
        mulchType:         mr.mulchType,
        volumeM3:          mr.volumeM3,
        createdAt:         mr.createdAt,
        updatedAt:         mr.updatedAt,
        assetName:         mr.assetName,
        assetDesc:         mr.assetDesc,
        gardenType:        mr.gardenType,
        suburb:            mr.suburb,
        streetAddress:     mr.streetAddress,
        lat:               mr.lat,
        lng:               mr.lng,
        serviceTimeMins:   mr.estimatedMins ?? mr.serviceTimeMins,
        routeOrder:        mr.routeOrder,
        frequency:         mr.frequency,
        teamCompletions:   [],
      };
      dayMap.get(mr.scheduledDate)?.push(mapped as any);
    }
    // ── Merge reactive (unscheduled) jobs into day buckets ────────────────────
    const reactiveWeekRows = await db
      .select({
        id:                reactiveJobsTable.id,
        assetId:           reactiveJobsTable.assetId,
        scheduledDate:     sql<string>`to_char(${reactiveJobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        status:            reactiveJobsTable.status,
        assignedTeamId:    reactiveJobsTable.assignedTeamId,
        estimatedTimeMins: reactiveJobsTable.estimatedTimeMins,
        issueType:         reactiveJobsTable.issueType,
        description:       reactiveJobsTable.description,
        location:          reactiveJobsTable.location,
        createdAt:         reactiveJobsTable.createdAt,
        updatedAt:         reactiveJobsTable.updatedAt,
        assetName:         assetsTable.name,
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
      .from(reactiveJobsTable)
      .leftJoin(assetsTable, eq(reactiveJobsTable.assetId, assetsTable.id))
      .where(
        and(
          gte(reactiveJobsTable.scheduledDate, weekStart),
          lte(reactiveJobsTable.scheduledDate, weekEnd),
          notInArray(reactiveJobsTable.status, ["cancelled"]),
          ...(teamId ? [eq(reactiveJobsTable.assignedTeamId, teamId)] : []),
        ),
      )
      .orderBy(
        reactiveJobsTable.scheduledDate,
        sql`${assetsTable.routeOrder} NULLS LAST`,
        assetsTable.name,
      );

    const reactiveStatusMap: Record<string, string> = {
      raised:      "pending",
      assigned:    "pending",
      in_progress: "in_progress",
      completed:   "completed",
    };

    for (const rj of reactiveWeekRows) {
      const mapped = {
        id:                rj.id,
        assetId:           rj.assetId,
        jobType:           "unscheduled" as const,
        status:            reactiveStatusMap[rj.status] ?? "pending",
        teamId:            rj.assignedTeamId,
        isAllTeams:        false,
        assignedUserId:    null,
        scheduledDate:     rj.scheduledDate,
        startedAt:         null,
        completedAt:       null,
        actualTimeMins:    null,
        estimatedTimeMins: rj.estimatedTimeMins,
        crewStatus:        null,
        notes:             rj.description,
        createdAt:         rj.createdAt,
        updatedAt:         rj.updatedAt,
        assetName:         rj.assetName ?? rj.location ?? rj.issueType,
        assetDesc:         rj.assetDesc ?? rj.description,
        gardenType:        rj.gardenType ?? "other",
        suburb:            rj.suburb ?? null,
        streetAddress:     rj.streetAddress ?? null,
        lat:               rj.lat ?? null,
        lng:               rj.lng ?? null,
        serviceTimeMins:   rj.estimatedTimeMins ?? rj.serviceTimeMins ?? 0,
        routeOrder:        rj.routeOrder ?? null,
        frequency:         rj.frequency ?? "reactive",
        teamCompletions:   [],
      };
      dayMap.get(rj.scheduledDate)?.push(mapped as any);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Re-sort each day's combined job list by routeOrder so mulching / infill /
    // unscheduled jobs appear at the same position as their asset's regular job,
    // not appended at the end after all maintenance jobs.
    const days = Array.from(dayMap.entries()).map(([date, jobs]) => ({
      date,
      jobs: [...jobs].sort((a, b) => {
        const ao = (a as any).routeOrder as number | null ?? null;
        const bo = (b as any).routeOrder as number | null ?? null;
        if (ao === null && bo === null) return 0;
        if (ao === null) return 1;
        if (bo === null) return -1;
        return ao - bo;
      }),
    }));

    res.json({
      weekStart,
      weekEnd,
      days,
      totalJobs:      rows.length + infillRows.length + mulchRows.length + reactiveWeekRows.length,
      completedJobs:  rows.filter(r => r.status === "completed").length + infillRows.filter(r => r.status === "completed").length + mulchRows.filter(r => r.status === "completed").length + reactiveWeekRows.filter(r => r.status === "completed").length,
      inProgressJobs: rows.filter(r => r.status === "in_progress").length + infillRows.filter(r => r.status === "in_progress").length + mulchRows.filter((r: any) => r.status === "in_progress").length + reactiveWeekRows.filter((r: any) => r.status === "in_progress").length,
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
    const { from, to } = res.locals.query as z.infer<typeof rangeQuerySchema>;
    let { teamId } = res.locals.query as z.infer<typeof rangeQuerySchema>;

    // Non-privileged users may only view their own team's schedule
    if (!isPrivilegedRole(req.auth!.role)) {
      const callerTeamId = req.auth!.teamId;
      if (!callerTeamId) { res.json({ assets: [] }); return; }
      teamId = callerTeamId;
    }

    const rows = await db
      .select({
        jobId:             jobsTable.id,
        scheduledDate:     sql<string>`to_char(${jobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        status:            jobsTable.status,
        jobType:           jobsTable.jobType,
        crewStatus:        jobsTable.crewStatus,
        assetId:           assetsTable.id,
        assetName:         assetsTable.name,
        assetDesc:         assetsTable.description,
        gardenType:        assetsTable.gardenType,
        standard:          assetsTable.standard,
        frequency:         assetsTable.frequency,
        serviceTimeMins:   assetsTable.serviceTimeMins,
        estimatedTimeMins: jobsTable.estimatedTimeMins,
        teamId:            assetsTable.teamId,
        routeOrder:        assetsTable.routeOrder,
        notes:             jobsTable.notes,
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

    type RangeJob = {
      id: string; scheduledDate: string; status: string; jobType: string;
      crewStatus: string | null; estimatedTimeMins: number | null;
      teamId?: string | null; notes?: string | null; mulchType?: string | null;
    };

    const assetMap = new Map<string, {
      assetId: string; assetName: string; assetDesc: string | null;
      gardenType: string; standard: string; frequency: string;
      serviceTimeMins: number; teamId: string | null; routeOrder: number | null;
      jobs: RangeJob[];
    }>();

    for (const row of rows) {
      if (!assetMap.has(row.assetId)) {
        assetMap.set(row.assetId, {
          assetId: row.assetId, assetName: row.assetName, assetDesc: row.assetDesc,
          gardenType: row.gardenType, standard: row.standard, frequency: row.frequency,
          serviceTimeMins: row.serviceTimeMins, teamId: row.teamId, routeOrder: row.routeOrder,
          jobs: [],
        });
      }
      assetMap.get(row.assetId)!.jobs.push({
        id: row.jobId, scheduledDate: row.scheduledDate, status: row.status,
        jobType: row.jobType, crewStatus: row.crewStatus, estimatedTimeMins: row.estimatedTimeMins,
        teamId: row.teamId, notes: row.notes,
      });
    }

    // ── Merge mulching records into the Gantt range ───────────────────────────
    const mulchRows = await db
      .select({
        id:              mulchingRecordsTable.id,
        assetId:         mulchingRecordsTable.assetId,
        scheduledDate:   sql<string>`to_char(${mulchingRecordsTable.scheduledDate}, 'YYYY-MM-DD')`,
        status:          mulchingRecordsTable.status,
        assignedTeamId:  mulchingRecordsTable.assignedTeamId,
        estimatedMins:   mulchingRecordsTable.estimatedMins,
        notes:           mulchingRecordsTable.notes,
        mulchType:       mulchingRecordsTable.mulchType,
        volumeM3:        mulchingRecordsTable.volumeM3,
        assetName:       assetsTable.name,
        assetDesc:       assetsTable.description,
        gardenType:      assetsTable.gardenType,
        standard:        assetsTable.standard,
        frequency:       assetsTable.frequency,
        serviceTimeMins: assetsTable.serviceTimeMins,
        routeOrder:      assetsTable.routeOrder,
      })
      .from(mulchingRecordsTable)
      .innerJoin(assetsTable, eq(mulchingRecordsTable.assetId, assetsTable.id))
      .where(
        and(
          gte(mulchingRecordsTable.scheduledDate, from),
          lte(mulchingRecordsTable.scheduledDate, to),
          inArray(mulchingRecordsTable.status, ["scheduled", "completed"]),
          ...(teamId ? [eq(mulchingRecordsTable.assignedTeamId, teamId)] : []),
        ),
      )
      .orderBy(
        sql`${assetsTable.routeOrder} NULLS LAST`,
        assetsTable.name,
        mulchingRecordsTable.scheduledDate,
      );

    const mulchStatusMap: Record<string, string> = {
      scheduled: "pending",
      completed: "completed",
    };

    for (const mr of mulchRows) {
      if (!assetMap.has(mr.assetId)) {
        assetMap.set(mr.assetId, {
          assetId: mr.assetId, assetName: mr.assetName, assetDesc: mr.assetDesc,
          gardenType: mr.gardenType, standard: mr.standard, frequency: mr.frequency,
          serviceTimeMins: mr.serviceTimeMins, teamId: mr.assignedTeamId, routeOrder: mr.routeOrder,
          jobs: [],
        });
      }
      assetMap.get(mr.assetId)!.jobs.push({
        id:                mr.id,
        scheduledDate:     mr.scheduledDate,
        status:            mulchStatusMap[mr.status] ?? "pending",
        jobType:           "mulching",
        crewStatus:        null,
        estimatedTimeMins: mr.estimatedMins,
        teamId:            mr.assignedTeamId,
        notes:             mr.notes,
        mulchType:         mr.mulchType,
        volumeM3:          mr.volumeM3,
      });
    }
    // ── Merge infill planting jobs into the Gantt range ──────────────────────
    const infillRows = await db
      .select({
        id:              infillJobsTable.id,
        assetId:         infillJobsTable.assetId,
        scheduledDate:   sql<string>`to_char(${infillJobsTable.plannedDate}, 'YYYY-MM-DD')`,
        status:          infillJobsTable.status,
        assignedTeamId:  infillJobsTable.assignedTeamId,
        estimatedMins:   infillJobsTable.estimatedMins,
        notes:           infillJobsTable.assessmentNotes,
        assetName:       assetsTable.name,
        assetDesc:       assetsTable.description,
        gardenType:      assetsTable.gardenType,
        standard:        assetsTable.standard,
        frequency:       assetsTable.frequency,
        serviceTimeMins: assetsTable.serviceTimeMins,
        routeOrder:      assetsTable.routeOrder,
      })
      .from(infillJobsTable)
      .innerJoin(assetsTable, eq(infillJobsTable.assetId, assetsTable.id))
      .where(
        and(
          gte(infillJobsTable.plannedDate, from),
          lte(infillJobsTable.plannedDate, to),
          inArray(infillJobsTable.status, ["scheduled", "completed"]),
          ...(teamId ? [eq(infillJobsTable.assignedTeamId, teamId)] : []),
        ),
      )
      .orderBy(
        sql`${assetsTable.routeOrder} NULLS LAST`,
        assetsTable.name,
        infillJobsTable.plannedDate,
      );

    for (const ir of infillRows) {
      if (!assetMap.has(ir.assetId)) {
        assetMap.set(ir.assetId, {
          assetId: ir.assetId, assetName: ir.assetName, assetDesc: ir.assetDesc,
          gardenType: ir.gardenType, standard: ir.standard, frequency: ir.frequency,
          serviceTimeMins: ir.serviceTimeMins, teamId: ir.assignedTeamId, routeOrder: ir.routeOrder,
          jobs: [],
        });
      }
      assetMap.get(ir.assetId)!.jobs.push({
        id:                ir.id,
        scheduledDate:     ir.scheduledDate,
        status:            ir.status === "completed" ? "completed" : "pending",
        jobType:           "infill_planting",
        crewStatus:        null,
        estimatedTimeMins: ir.estimatedMins,
        teamId:            ir.assignedTeamId,
        notes:             ir.notes,
      });
    }
    // ── Merge reactive (unscheduled) jobs into the Gantt range ───────────────
    // Only jobs linked to an asset appear here (Gantt is asset-centric).
    // Non-asset reactive jobs are visible in the Day / Week views.
    const reactiveRangeRows = await db
      .select({
        id:                reactiveJobsTable.id,
        assetId:           reactiveJobsTable.assetId,
        scheduledDate:     sql<string>`to_char(${reactiveJobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        status:            reactiveJobsTable.status,
        assignedTeamId:    reactiveJobsTable.assignedTeamId,
        estimatedTimeMins: reactiveJobsTable.estimatedTimeMins,
        issueType:         reactiveJobsTable.issueType,
        description:       reactiveJobsTable.description,
        assetName:         assetsTable.name,
        assetDesc:         assetsTable.description,
        gardenType:        assetsTable.gardenType,
        standard:          assetsTable.standard,
        frequency:         assetsTable.frequency,
        serviceTimeMins:   assetsTable.serviceTimeMins,
        routeOrder:        assetsTable.routeOrder,
      })
      .from(reactiveJobsTable)
      .innerJoin(assetsTable, eq(reactiveJobsTable.assetId, assetsTable.id))
      .where(
        and(
          gte(reactiveJobsTable.scheduledDate, from),
          lte(reactiveJobsTable.scheduledDate, to),
          notInArray(reactiveJobsTable.status, ["cancelled"]),
          ...(teamId ? [eq(reactiveJobsTable.assignedTeamId, teamId)] : []),
        ),
      )
      .orderBy(
        sql`${assetsTable.routeOrder} NULLS LAST`,
        assetsTable.name,
        reactiveJobsTable.scheduledDate,
      );

    const reactiveRangeStatusMap: Record<string, string> = {
      raised:      "pending",
      assigned:    "pending",
      in_progress: "in_progress",
      completed:   "completed",
    };

    for (const rj of reactiveRangeRows) {
      if (!rj.assetId) continue;
      if (!assetMap.has(rj.assetId)) {
        assetMap.set(rj.assetId, {
          assetId: rj.assetId, assetName: rj.assetName, assetDesc: rj.assetDesc,
          gardenType: rj.gardenType, standard: rj.standard, frequency: rj.frequency,
          serviceTimeMins: rj.serviceTimeMins, teamId: rj.assignedTeamId, routeOrder: rj.routeOrder,
          jobs: [],
        });
      }
      assetMap.get(rj.assetId)!.jobs.push({
        id:                rj.id,
        scheduledDate:     rj.scheduledDate,
        status:            reactiveRangeStatusMap[rj.status] ?? "pending",
        jobType:           "unscheduled",
        crewStatus:        null,
        estimatedTimeMins: rj.estimatedTimeMins,
        teamId:            rj.assignedTeamId,
        notes:             rj.description,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

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

    // Non-privileged users may only view capacity for their own team
    if (!isPrivilegedRole(req.auth!.role)) {
      const callerTeamId = req.auth!.teamId;
      if (teamId !== callerTeamId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/schedule/replan-day
// Reschedules pending scheduled jobs for a specific team on a specific date,
// placing as many as fit within productiveTimeMins on that day (in geosequence
// order) and spilling any remainder to the next working day.
//
// Designed for the over-capacity recovery flow triggered when a worker is
// marked unavailable. Unlike the full generate endpoint, it only touches that
// one day's jobs and does NOT reshuffle any other days.
// ─────────────────────────────────────────────────────────────────────────────
const replanDaySchema = z.object({
  teamId: z.string().uuid(),
  date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post(
  "/schedule/replan-day",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(replanDaySchema),
  async (req, res) => {
    const { teamId, date } = res.locals.body as z.infer<typeof replanDaySchema>;
    const { productiveTimeMins, standardCrewSize } = await loadSystemSettings();

    // Build crew/absence data for the affected date
    const { membersByTeam, absenceMap } = await buildAbsenceDataForTeamDate(teamId, date);

    // Load pending scheduled jobs for this team on this date in geosequence order
    const pendingJobs = await db
      .select({
        id:              jobsTable.id,
        assetId:         jobsTable.assetId,
        serviceTimeMins: assetsTable.serviceTimeMins,
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
      )
      .orderBy(sql`${assetsTable.routeOrder} NULLS LAST`, assetsTable.name);

    if (pendingJobs.length === 0) {
      return res.json({ jobsOnDate: 0, jobsSpilled: 0 });
    }

    // Delete them so we can re-insert with updated placement
    await db
      .delete(jobsTable)
      .where(inArray(jobsTable.id, pendingJobs.map(j => j.id)));

    // Pre-compute the next SPILL_HORIZON working days so overflow can be placed
    // on the first future day that has enough remaining capacity.
    const SPILL_HORIZON = 10;
    const spillCandidates: string[] = [];
    let cur = date;
    for (let i = 0; i < SPILL_HORIZON; i++) {
      cur = addWorkingDays(cur, 1);
      spillCandidates.push(cur);
    }

    // Load existing pending/in-progress load on all candidate days in one query
    const futureRows = await db
      .select({
        scheduledDate:     sql<string>`to_char(${jobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        estimatedTimeMins: jobsTable.estimatedTimeMins,
        serviceTimeMins:   assetsTable.serviceTimeMins,
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(
        and(
          eq(jobsTable.teamId, teamId),
          inArray(jobsTable.scheduledDate, spillCandidates),
          inArray(jobsTable.status, ["pending", "in_progress"]),
        ),
      );

    // Build per-day existing load map
    const existingLoad = new Map<string, number>();
    for (const d of spillCandidates) existingLoad.set(d, 0);
    for (const r of futureRows) {
      existingLoad.set(
        r.scheduledDate,
        (existingLoad.get(r.scheduledDate) ?? 0) + (r.estimatedTimeMins ?? r.serviceTimeMins),
      );
    }
    // Track load being added in this batch (so consecutive overflow jobs share a day budget)
    const batchLoad = new Map<string, number>();

    // Cache absence data per spill day (lazy, only loaded on first spill to that day)
    const absenceCache = new Map<string, Awaited<ReturnType<typeof buildAbsenceDataForTeamDate>>>();
    const getSpillDayAbsence = async (d: string) => {
      if (!absenceCache.has(d)) {
        absenceCache.set(d, await buildAbsenceDataForTeamDate(teamId, d));
      }
      return absenceCache.get(d)!;
    };

    let usedMins = 0;
    let jobsOnDate = 0;
    let jobsSpilled = 0;

    const insertRows: {
      assetId: string;
      jobType: "scheduled";
      teamId: string;
      scheduledDate: string;
      status: "pending";
      estimatedTimeMins: number;
      crewStatus: CrewStatus;
    }[] = [];

    for (const job of pendingJobs) {
      const { estimatedTimeMins, crewStatus } = calcCrewAdjustment(
        teamId, date, membersByTeam, absenceMap, job.serviceTimeMins, standardCrewSize,
      );

      if (usedMins + estimatedTimeMins <= productiveTimeMins) {
        // Fits on the affected date
        insertRows.push({
          assetId: job.assetId, jobType: "scheduled", teamId,
          scheduledDate: date, status: "pending", estimatedTimeMins, crewStatus,
        });
        usedMins += estimatedTimeMins;
        jobsOnDate++;
      } else {
        // Find the first future working day that has capacity for this job.
        // Uses existing DB load + already-queued batch load for accurate headroom.
        let placed = false;
        for (const spillDay of spillCandidates) {
          const nd = await getSpillDayAbsence(spillDay);
          const { estimatedTimeMins: ndMins, crewStatus: ndCs } = calcCrewAdjustment(
            teamId, spillDay, nd.membersByTeam, nd.absenceMap, job.serviceTimeMins, standardCrewSize,
          );
          const dayLoad = (existingLoad.get(spillDay) ?? 0) + (batchLoad.get(spillDay) ?? 0);
          if (dayLoad + ndMins <= productiveTimeMins) {
            insertRows.push({
              assetId: job.assetId, jobType: "scheduled", teamId,
              scheduledDate: spillDay, status: "pending", estimatedTimeMins: ndMins, crewStatus: ndCs,
            });
            batchLoad.set(spillDay, (batchLoad.get(spillDay) ?? 0) + ndMins);
            jobsSpilled++;
            placed = true;
            break;
          }
        }
        if (!placed) {
          // All horizon days are full — fall back to next working day regardless
          const fallbackDay = spillCandidates[0];
          const nd = await getSpillDayAbsence(fallbackDay);
          const { estimatedTimeMins: ndMins, crewStatus: ndCs } = calcCrewAdjustment(
            teamId, fallbackDay, nd.membersByTeam, nd.absenceMap, job.serviceTimeMins, standardCrewSize,
          );
          insertRows.push({
            assetId: job.assetId, jobType: "scheduled", teamId,
            scheduledDate: fallbackDay, status: "pending", estimatedTimeMins: ndMins, crewStatus: ndCs,
          });
          batchLoad.set(fallbackDay, (batchLoad.get(fallbackDay) ?? 0) + ndMins);
          jobsSpilled++;
        }
      }
    }

    if (insertRows.length > 0) {
      await db.insert(jobsTable).values(insertRows);
    }

    res.json({ jobsOnDate, jobsSpilled });
  },
);

export default router;
