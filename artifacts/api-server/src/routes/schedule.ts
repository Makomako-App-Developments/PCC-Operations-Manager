import { Router } from "express";
import { db, assetsTable, jobsTable, teamsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
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
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// POST /api/schedule/generate
router.post(
  "/schedule/generate",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(generateBodySchema),
  async (req, res) => {
    const { fromDate, toDate, teamId } = req.body as z.infer<typeof generateBodySchema>;

    const assets = await db
      .select()
      .from(assetsTable)
      .where(
        teamId
          ? and(eq(assetsTable.isActive, true), eq(assetsTable.teamId, teamId))
          : eq(assetsTable.isActive, true),
      );

    let jobsCreated = 0;
    const insertRows: {
      assetId: string;
      jobType: "scheduled";
      teamId: string | null;
      scheduledDate: string;
      status: "pending";
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
          insertRows.push({
            assetId:       asset.id,
            jobType:       "scheduled",
            teamId:        asset.teamId ?? null,
            scheduledDate: cursor,
            status:        "pending",
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
        id:             jobsTable.id,
        assetId:        jobsTable.assetId,
        jobType:        jobsTable.jobType,
        status:         jobsTable.status,
        teamId:         jobsTable.teamId,
        assignedUserId: jobsTable.assignedUserId,
        scheduledDate:  sql<string>`to_char(${jobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        startedAt:      jobsTable.startedAt,
        completedAt:    jobsTable.completedAt,
        actualTimeMins: jobsTable.actualTimeMins,
        notes:          jobsTable.notes,
        createdAt:      jobsTable.createdAt,
        updatedAt:      jobsTable.updatedAt,
        assetName:       assetsTable.name,
        assetRef:        assetsTable.reference,
        gardenType:      assetsTable.gardenType,
        suburb:          assetsTable.suburb,
        serviceTimeMins: assetsTable.serviceTimeMins,
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

    const days = Array.from(dayMap.entries()).map(([date, jobs]) => ({
      date,
      jobs,
    }));

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
        jobId:           jobsTable.id,
        scheduledDate:   sql<string>`to_char(${jobsTable.scheduledDate}, 'YYYY-MM-DD')`,
        status:          jobsTable.status,
        assetId:         assetsTable.id,
        assetName:       assetsTable.name,
        assetRef:        assetsTable.reference,
        gardenType:      assetsTable.gardenType,
        standard:        assetsTable.standard,
        frequency:       assetsTable.frequency,
        serviceTimeMins: assetsTable.serviceTimeMins,
        teamId:          assetsTable.teamId,
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
      jobs: { id: string; scheduledDate: string; status: string }[];
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
        id:            row.jobId,
        scheduledDate: row.scheduledDate,
        status:        row.status,
      });
    }

    res.json({ from, to, rows: Array.from(assetMap.values()) });
  },
);

export default router;
