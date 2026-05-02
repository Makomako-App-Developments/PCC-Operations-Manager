import { Router } from "express";
import { db, assetsTable, jobsTable, reactiveJobsTable, teamsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /api/dashboard/summary
router.get("/dashboard/summary", requireAuth, async (_req, res) => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + diffToMon);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [totalRow] = await db
    .select({ count: count() })
    .from(assetsTable);

  const [activeRow] = await db
    .select({ count: count() })
    .from(assetsTable)
    .where(eq(assetsTable.isActive, true));

  const [weekJobsRow] = await db
    .select({ count: count() })
    .from(jobsTable)
    .where(
      and(
        gte(jobsTable.scheduledDate, fmt(weekStart)),
        lte(jobsTable.scheduledDate, fmt(weekEnd)),
      ),
    );

  const [completedRow] = await db
    .select({ count: count() })
    .from(jobsTable)
    .where(
      and(
        gte(jobsTable.scheduledDate, fmt(weekStart)),
        lte(jobsTable.scheduledDate, fmt(weekEnd)),
        eq(jobsTable.status, "completed"),
      ),
    );

  const [overdueRow] = await db
    .select({ count: count() })
    .from(jobsTable)
    .where(eq(jobsTable.status, "overdue"));

  const [reactiveRow] = await db
    .select({ count: count() })
    .from(reactiveJobsTable)
    .where(
      sql`${reactiveJobsTable.status} NOT IN ('completed', 'cancelled')`,
    );

  const assetsByTypeRows = await db
    .select({
      gardenType: assetsTable.gardenType,
      count: count(),
    })
    .from(assetsTable)
    .where(eq(assetsTable.isActive, true))
    .groupBy(assetsTable.gardenType);

  const teamSummaryRows = await db
    .select({
      teamId:   teamsTable.id,
      teamName: teamsTable.name,
      jobCount: count(),
    })
    .from(jobsTable)
    .innerJoin(teamsTable, eq(jobsTable.teamId, teamsTable.id))
    .where(
      and(
        gte(jobsTable.scheduledDate, fmt(weekStart)),
        lte(jobsTable.scheduledDate, fmt(weekEnd)),
      ),
    )
    .groupBy(teamsTable.id, teamsTable.name);

  const completedByTeamRows = await db
    .select({
      teamId: teamsTable.id,
      completedCount: count(),
    })
    .from(jobsTable)
    .innerJoin(teamsTable, eq(jobsTable.teamId, teamsTable.id))
    .where(
      and(
        gte(jobsTable.scheduledDate, fmt(weekStart)),
        lte(jobsTable.scheduledDate, fmt(weekEnd)),
        eq(jobsTable.status, "completed"),
      ),
    )
    .groupBy(teamsTable.id);

  const completedMap = new Map(completedByTeamRows.map((r) => [r.teamId, r.completedCount]));

  res.json({
    totalAssets:       Number(totalRow.count),
    activeAssets:      Number(activeRow.count),
    jobsThisWeek:      Number(weekJobsRow.count),
    completedThisWeek: Number(completedRow.count),
    overdueJobs:       Number(overdueRow.count),
    openReactiveJobs:  Number(reactiveRow.count),
    assetsByType: assetsByTypeRows.map((r) => ({
      gardenType: r.gardenType,
      count:      Number(r.count),
    })),
    teamSummary: teamSummaryRows.map((r) => ({
      teamId:         r.teamId,
      teamName:       r.teamName,
      jobCount:       Number(r.jobCount),
      completedCount: Number(completedMap.get(r.teamId) ?? 0),
    })),
  });
});

export default router;
