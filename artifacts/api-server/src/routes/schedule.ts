import { Router } from "express";
import {
  db, assetsTable, jobsTable, teamMembersTable, teamAvailabilityTable,
  systemSettingsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, sql, notInArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { FREQ_DAYS, calcCrewAdjustment, type CrewStatus } from "../lib/crew-utils";

const router = Router();

const ABSENT_HOUR_THRESHOLD = 5;
const MAX_CARRY_FORWARD_DAYS = 5;   // max working-day lookahead before placing anyway
const CAPACITY_TOLERANCE = 1.05;    // accept up to 105% of productive time

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
// Capacity-aware generator with geosequenced carry-forward.
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
    const capacityLimit      = Math.round(productiveTimeMins * CAPACITY_TOLERANCE);

    // Load assets (with routeOrder for carry-forward tie-breaking)
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

    // ── Step 2: Process dates in order, smallest jobs first per day ──────────
    const sortedDates = Array.from(candidatesByDate.keys()).sort();

    let jobsCreated = 0;
    let jobsRefreshed = 0;
    let jobsCarriedForward = 0;
    let capacityConflicts = 0;

    const insertRows: {
      assetId: string;
      jobType: "scheduled";
      teamId: string | null;
      scheduledDate: string;
      status: "pending";
      estimatedTimeMins: number;
      crewStatus: CrewStatus;
    }[] = [];

    for (const naturalDate of sortedDates) {
      const candidates = candidatesByDate.get(naturalDate)!;

      // Sort: smallest serviceTimeMins first; ties broken by routeOrder (nulls last)
      candidates.sort((a, b) => {
        const timeDiff = a.asset.serviceTimeMins - b.asset.serviceTimeMins;
        if (timeDiff !== 0) return timeDiff;
        const ro_a = a.asset.routeOrder ?? 999999;
        const ro_b = b.asset.routeOrder ?? 999999;
        return ro_a - ro_b;
      });

      for (const { asset } of candidates) {
        const tid = asset.teamId ?? null;

        // Check for an existing scheduled job on the natural date
        const [existingOnNatural] = await db
          .select({ id: jobsTable.id, status: jobsTable.status })
          .from(jobsTable)
          .where(
            and(
              eq(jobsTable.assetId, asset.id),
              eq(jobsTable.scheduledDate, naturalDate),
              eq(jobsTable.jobType, "scheduled"),
            ),
          )
          .limit(1);

        if (existingOnNatural) {
          if (existingOnNatural.status === "pending") {
            // Refresh crew status in place — don't move existing jobs
            const { estimatedTimeMins, crewStatus } = calcCrewAdjustment(
              tid, naturalDate, membersByTeam, absenceMap, asset.serviceTimeMins, standardCrewSize,
            );
            await db
              .update(jobsTable)
              .set({ estimatedTimeMins, crewStatus, updatedAt: new Date() })
              .where(eq(jobsTable.id, existingOnNatural.id));
            jobsRefreshed++;
          }
          // Non-pending — leave completely untouched
          continue;
        }

        // New job — find best placement date with capacity check
        let placementDate = naturalDate;
        let carried = false;

        const { estimatedTimeMins: estNatural, crewStatus: csNatural } = calcCrewAdjustment(
          tid, naturalDate, membersByTeam, absenceMap, asset.serviceTimeMins, standardCrewSize,
        );

        const usedOnNatural = tid ? getMins(minutesUsed, tid, naturalDate) : 0;
        const fitsOnNatural = !tid || usedOnNatural + estNatural <= capacityLimit;

        if (fitsOnNatural) {
          placementDate = naturalDate;
          if (tid) addMins(minutesUsed, tid, naturalDate, estNatural);
          insertRows.push({
            assetId: asset.id, jobType: "scheduled", teamId: tid,
            scheduledDate: naturalDate, status: "pending",
            estimatedTimeMins: estNatural, crewStatus: csNatural,
          });
          jobsCreated++;
        } else {
          // Try carry-forward: next working days, up to MAX_CARRY_FORWARD_DAYS
          let placed = false;
          for (let attempt = 1; attempt <= MAX_CARRY_FORWARD_DAYS; attempt++) {
            const tryDate = addWorkingDays(naturalDate, attempt);
            if (tryDate > toDate) break;

            const { estimatedTimeMins: estTry, crewStatus: csTry } = calcCrewAdjustment(
              tid, tryDate, membersByTeam, absenceMap, asset.serviceTimeMins, standardCrewSize,
            );
            const usedOnTry = tid ? getMins(minutesUsed, tid, tryDate) : 0;

            if (!tid || usedOnTry + estTry <= capacityLimit) {
              placementDate = tryDate;
              carried = true;
              if (tid) addMins(minutesUsed, tid, tryDate, estTry);
              insertRows.push({
                assetId: asset.id, jobType: "scheduled", teamId: tid,
                scheduledDate: tryDate, status: "pending",
                estimatedTimeMins: estTry, crewStatus: csTry,
              });
              jobsCreated++;
              placed = true;
              break;
            }
          }

          if (!placed) {
            // Couldn't fit within 5 working days — place on natural date regardless
            capacityConflicts++;
            if (tid) addMins(minutesUsed, tid, naturalDate, estNatural);
            insertRows.push({
              assetId: asset.id, jobType: "scheduled", teamId: tid,
              scheduledDate: naturalDate, status: "pending",
              estimatedTimeMins: estNatural, crewStatus: csNatural,
            });
            jobsCreated++;
            carried = true; // was a conflict
          }

          if (carried) jobsCarriedForward++;
        }
      }
    }

    if (insertRows.length > 0) {
      await db.insert(jobsTable).values(insertRows);
    }

    res.json({ jobsCreated, jobsRefreshed, jobsCarriedForward, capacityConflicts, fromDate, toDate });
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
      ...(teamId ? [eq(jobsTable.teamId, teamId)] : []),
    );

    const rows = await db
      .select({
        id:                jobsTable.id,
        assetId:           jobsTable.assetId,
        jobType:           jobsTable.jobType,
        status:            jobsTable.status,
        teamId:            jobsTable.teamId,
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

    const dayMap = new Map<string, typeof rows>();
    for (let i = 0; i < 7; i++) {
      dayMap.set(addDays(weekStart, i), []);
    }
    for (const row of rows) {
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
