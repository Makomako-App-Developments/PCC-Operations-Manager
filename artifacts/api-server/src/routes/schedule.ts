import { Router } from "express";
import { db, assetsTable, jobsTable, teamsTable, teamMembersTable, teamAvailabilityTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";

const router = Router();

const FREQ_DAYS: Record<string, number> = {
  weekly:      7,
  fortnightly: 14,
  monthly:     28,
  bimonthly:   56,
  quarterly:   91,
};

// A person counts as unavailable for the day if 5+ of their 9 working hours
// are marked as non-available (simplified mode — precise per-hour in v2)
const ABSENT_HOUR_THRESHOLD = 5;

const generateBodySchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamId:   z.string().uuid().optional(),
});

const weekQuerySchema = z.object({
  week:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamId: z.string().uuid().optional(),
});

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cur = from;
  while (cur <= to) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

type CrewStatus = "full" | "reduced" | "none";

function calcCrewAdjustment(
  teamId: string | null,
  dateStr: string,
  membersByTeam: Map<string, string[]>,
  absenceMap: Map<string, Set<string>>, // date → Set<personName> who are absent that day
  baseTimeMins: number,
): { estimatedTimeMins: number; crewStatus: CrewStatus } {
  if (!teamId) {
    return { estimatedTimeMins: baseTimeMins, crewStatus: "full" };
  }
  const members   = membersByTeam.get(teamId) ?? [];
  const fullCrew  = members.length;
  if (fullCrew === 0) {
    return { estimatedTimeMins: baseTimeMins, crewStatus: "full" };
  }
  const absentToday = absenceMap.get(dateStr) ?? new Set<string>();
  const availCount  = members.filter(name => !absentToday.has(name)).length;

  if (availCount === 0) {
    return { estimatedTimeMins: baseTimeMins, crewStatus: "none" };
  }
  if (availCount >= fullCrew) {
    return { estimatedTimeMins: baseTimeMins, crewStatus: "full" };
  }
  // Scale: if 1 person does a 2-person job, it takes twice as long
  const adjusted = Math.ceil(baseTimeMins * (fullCrew / availCount));
  return { estimatedTimeMins: adjusted, crewStatus: "reduced" };
}

// POST /api/schedule/generate
router.post(
  "/schedule/generate",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(generateBodySchema),
  async (req, res) => {
    const { fromDate, toDate, teamId } = req.body as z.infer<typeof generateBodySchema>;

    // Load all active assets
    const assets = await db
      .select()
      .from(assetsTable)
      .where(
        teamId
          ? and(eq(assetsTable.isActive, true), eq(assetsTable.teamId, teamId))
          : eq(assetsTable.isActive, true),
      );

    // Load team membership (all teams)
    const allMembers = await db.select().from(teamMembersTable);
    const membersByTeam = new Map<string, string[]>();
    for (const m of allMembers) {
      if (!membersByTeam.has(m.teamId)) membersByTeam.set(m.teamId, []);
      membersByTeam.get(m.teamId)!.push(m.personName);
    }

    // Build set of all person names across relevant teams
    const allPersonNames = allMembers.map(m => m.personName);

    // Load all availability records for the entire generation range
    // (only non-available records are stored; missing = available)
    const availRows = allPersonNames.length > 0
      ? await db
          .select()
          .from(teamAvailabilityTable)
          .where(
            and(
              gte(teamAvailabilityTable.date, fromDate),
              lte(teamAvailabilityTable.date, toDate),
              inArray(teamAvailabilityTable.personName, allPersonNames),
            )
          )
      : [];

    // Build absenceMap: date → Set<personName> who are absent that day
    // A person is absent if they have ABSENT_HOUR_THRESHOLD+ non-available hours
    const absenceCountMap = new Map<string, Map<string, number>>(); // date → personName → count
    for (const row of availRows) {
      if (row.status === "available") continue; // skip — available rows don't count
      if (!absenceCountMap.has(row.date)) absenceCountMap.set(row.date, new Map());
      const byPerson = absenceCountMap.get(row.date)!;
      byPerson.set(row.personName, (byPerson.get(row.personName) ?? 0) + 1);
    }
    const absenceMap = new Map<string, Set<string>>();
    for (const [date, byPerson] of absenceCountMap) {
      const absentSet = new Set<string>();
      for (const [person, count] of byPerson) {
        if (count >= ABSENT_HOUR_THRESHOLD) absentSet.add(person);
      }
      if (absentSet.size > 0) absenceMap.set(date, absentSet);
    }

    // Generate jobs
    let jobsCreated = 0;
    const insertRows: {
      assetId: string;
      jobType: "scheduled";
      teamId: string | null;
      scheduledDate: string;
      status: "pending";
      estimatedTimeMins: number;
      crewStatus: CrewStatus;
    }[] = [];

    for (const asset of assets) {
      const intervalDays = FREQ_DAYS[asset.frequency] ?? 28;
      let cursor = fromDate;

      while (cursor <= toDate) {
        const existing = await db
          .select({ id: jobsTable.id })
          .from(jobsTable)
          .where(
            and(
              eq(jobsTable.assetId, asset.id),
              eq(jobsTable.scheduledDate, cursor),
              eq(jobsTable.jobType, "scheduled"),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          const { estimatedTimeMins, crewStatus } = calcCrewAdjustment(
            asset.teamId ?? null,
            cursor,
            membersByTeam,
            absenceMap,
            asset.serviceTimeMins,
          );

          insertRows.push({
            assetId:           asset.id,
            jobType:           "scheduled",
            teamId:            asset.teamId ?? null,
            scheduledDate:     cursor,
            status:            "pending",
            estimatedTimeMins,
            crewStatus,
          });
          jobsCreated++;
        }

        cursor = addDays(cursor, intervalDays);
      }
    }

    if (insertRows.length > 0) {
      await db.insert(jobsTable).values(insertRows);
    }

    res.json({ jobsCreated, fromDate, toDate });
  },
);

// GET /api/schedule/week
router.get(
  "/schedule/week",
  requireAuth,
  validateQuery(weekQuerySchema),
  async (req, res) => {
    const { week, teamId } = res.locals.query as z.infer<typeof weekQuerySchema>;

    const weekStart = mondayOf(week);
    const weekEnd   = addDays(weekStart, 6);

    const baseConditions = and(
      gte(jobsTable.scheduledDate, weekStart),
      lte(jobsTable.scheduledDate, weekEnd),
    );

    const condition = teamId
      ? and(baseConditions, eq(jobsTable.teamId, teamId))
      : baseConditions;

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
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(condition)
      .orderBy(jobsTable.scheduledDate);

    const dayMap = new Map<string, typeof rows>();
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      dayMap.set(d, []);
    }
    for (const row of rows) {
      dayMap.get(row.scheduledDate)?.push(row);
    }

    const days = Array.from(dayMap.entries()).map(([date, jobs]) => ({ date, jobs }));

    const totalJobs     = rows.length;
    const completedJobs = rows.filter((r) => r.status === "completed").length;

    res.json({ weekStart, weekEnd, days, totalJobs, completedJobs });
  },
);

// GET /api/schedule/range  — jobs grouped by asset for an arbitrary date range
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
      .orderBy(assetsTable.name, jobsTable.scheduledDate);

    const assetMap = new Map<string, {
      assetId: string; assetName: string; assetRef: string;
      gardenType: string; standard: string; frequency: string;
      serviceTimeMins: number; teamId: string | null;
      jobs: { id: string; scheduledDate: string; status: string; crewStatus: string | null; estimatedTimeMins: number | null }[];
    }>();

    for (const row of rows) {
      if (!assetMap.has(row.assetId)) {
        assetMap.set(row.assetId, {
          assetId:         row.assetId,
          assetName:       row.assetName,
          assetRef:        row.assetRef,
          gardenType:      row.gardenType,
          standard:        row.standard,
          frequency:       row.frequency,
          serviceTimeMins: row.serviceTimeMins,
          teamId:          row.teamId,
          jobs:            [],
        });
      }
      assetMap.get(row.assetId)!.jobs.push({
        id:                row.jobId,
        scheduledDate:     row.scheduledDate,
        status:            row.status,
        crewStatus:        row.crewStatus,
        estimatedTimeMins: row.estimatedTimeMins,
      });
    }

    res.json({ from, to, rows: Array.from(assetMap.values()) });
  },
);

export default router;
