import { Router } from "express";
import { db, jobsTable, reactiveJobsTable, insertJobSchema, insertReactiveJobSchema, assetsTable, teamsTable, usersTable, jobTeamCompletionsTable } from "@workspace/db";
import { eq, and, inArray, or, gte, lte, ilike, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { auditLog } from "../lib/audit";
import { FREQ_DAYS } from "../lib/crew-utils";

const router = Router();

const jobQuerySchema = z.object({
  assetId:  z.string().uuid().optional(),
  teamId:   z.string().uuid().optional(),
  status:   z.string().optional(),
  from:     z.string().optional(),
  to:       z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(5000).default(50),
});

type JobQuery = z.infer<typeof jobQuerySchema>;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// GET /api/jobs
router.get("/jobs", requireAuth, validateQuery(jobQuerySchema), async (req, res) => {
  const { assetId, teamId, status, page, limit } = res.locals.query as JobQuery;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (assetId) conditions.push(eq(jobsTable.assetId, assetId));
  if (teamId)  conditions.push(or(eq(jobsTable.teamId, teamId), eq(jobsTable.isAllTeams, true)));
  if (status) {
    const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(jobsTable.status, statuses[0] as any));
    } else if (statuses.length > 1) {
      conditions.push(inArray(jobsTable.status, statuses as any[]));
    }
  }

  const rows = await db
    .select()
    .from(jobsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit)
    .offset(offset);
  res.json({ data: rows, page, limit });
});

// GET /api/completed-works  — enriched view joining jobs + assets + teams
const completedWorksQuerySchema = z.object({
  teamId:     z.string().uuid().optional(),
  ward:       z.string().optional(),
  gardenType: z.string().optional(),
  from:       z.string().optional(),
  to:         z.string().optional(),
  search:     z.string().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(1000).default(100),
});

router.get("/completed-works", requireAuth, validateQuery(completedWorksQuerySchema), async (req, res) => {
  const q = res.locals.query as z.infer<typeof completedWorksQuerySchema>;

  const conditions: ReturnType<typeof eq>[] = [eq(jobsTable.status, "completed")];
  if (q.teamId)     conditions.push(eq(jobsTable.teamId, q.teamId) as any);
  if (q.from)       conditions.push(gte(jobsTable.scheduledDate, q.from) as any);
  if (q.to)         conditions.push(lte(jobsTable.scheduledDate, q.to) as any);
  if (q.ward)       conditions.push(eq(assetsTable.ward, q.ward as any) as any);
  if (q.gardenType) conditions.push(eq(assetsTable.gardenType, q.gardenType as any) as any);
  if (q.search) {
    const term = `%${q.search}%`;
    conditions.push(or(ilike(assetsTable.name, term), ilike(assetsTable.reference, term)) as any);
  }

  const offset = (q.page - 1) * q.limit;

  const rows = await db
    .select({
      id:               jobsTable.id,
      jobType:          jobsTable.jobType,
      scheduledDate:    jobsTable.scheduledDate,
      completedAt:      jobsTable.completedAt,
      actualTimeMins:   jobsTable.actualTimeMins,
      estimatedTimeMins: jobsTable.estimatedTimeMins,
      notes:            jobsTable.notes,
      crewStatus:       jobsTable.crewStatus,
      isAllTeams:       jobsTable.isAllTeams,
      teamId:           jobsTable.teamId,
      teamName:         teamsTable.name,
      assetId:          assetsTable.id,
      assetName:        assetsTable.name,
      assetReference:   assetsTable.reference,
      gardenType:       assetsTable.gardenType,
      ward:             assetsTable.ward,
      suburb:           assetsTable.suburb,
      areaM2:           assetsTable.areaM2,
    })
    .from(jobsTable)
    .leftJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
    .leftJoin(teamsTable, eq(jobsTable.teamId, teamsTable.id))
    .where(and(...conditions))
    .orderBy(desc(jobsTable.scheduledDate))
    .limit(q.limit)
    .offset(offset);

  res.json({ data: rows, page: q.page, limit: q.limit });
});

// GET /api/jobs/:id
router.get("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.json(job);
});

// POST /api/jobs
router.post(
  "/jobs",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(insertJobSchema),
  async (req, res) => {
    const [created] = await db.insert(jobsTable).values(req.body).returning();
    await auditLog({
      tableName: "jobs", recordId: created.id, action: "INSERT",
      changedById: req.auth?.userId ?? null, newData: created as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(created);
  },
);

// PATCH /api/jobs/:id
// When a job is marked as "skipped", automatically reschedule it at the next occurrence.
router.patch("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [before] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!before) { res.status(404).json({ error: "Job not found" }); return; }

  const patch = req.body as Record<string, unknown>;

  // Never trust client-supplied timestamps — server owns these
  delete patch.startedAt;
  delete patch.completedAt;

  // Set timestamps when transitioning status
  if (patch.status === "in_progress" && before.status === "pending") {
    patch.startedAt = new Date();
  }
  if (patch.status === "completed" && before.status !== "completed") {
    patch.completedAt = new Date();
  }

  const [updated] = await db
    .update(jobsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(jobsTable.id, id))
    .returning();

  await auditLog({
    tableName: "jobs", recordId: id, action: "UPDATE",
    changedById: req.auth?.userId ?? null,
    oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>,
    ipAddress: req.ip ?? null,
  });

  // ── Skip → reschedule ───────────────────────────────────────────────────────
  // When a job is skipped, create a new pending job at the next scheduled occurrence.
  // Skip reschedule for reactive job types — those are one-off.
  if (patch.status === "skipped" && before.status !== "skipped" && before.jobType === "scheduled") {
    const [asset] = await db
      .select({ frequency: assetsTable.frequency, teamId: assetsTable.teamId })
      .from(assetsTable)
      .where(eq(assetsTable.id, before.assetId))
      .limit(1);

    if (asset) {
      const intervalDays  = FREQ_DAYS[asset.frequency] ?? 28;
      const scheduledDate = typeof before.scheduledDate === "string"
        ? before.scheduledDate
        : (before.scheduledDate as Date).toISOString().slice(0, 10);
      const nextDate = addDays(scheduledDate, intervalDays);

      // Only create if no job already exists for this asset on that date
      const [existing] = await db
        .select({ id: jobsTable.id })
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.assetId, before.assetId),
            eq(jobsTable.scheduledDate, nextDate),
            eq(jobsTable.jobType, "scheduled"),
          ),
        )
        .limit(1);

      if (!existing) {
        const [rescheduled] = await db
          .insert(jobsTable)
          .values({
            assetId:           before.assetId,
            jobType:           "scheduled",
            teamId:            asset.teamId ?? null,
            isAllTeams:        !asset.teamId,
            scheduledDate:     nextDate,
            status:            "pending",
            crewStatus:        "full",          // will be refreshed on next generate
            estimatedTimeMins: before.estimatedTimeMins ?? undefined,
            notes:             `Rescheduled from ${scheduledDate} (skipped)`,
          })
          .returning();

        await auditLog({
          tableName: "jobs", recordId: rescheduled.id, action: "INSERT",
          changedById: req.auth?.userId ?? null,
          newData: rescheduled as Record<string, unknown>,
          ipAddress: req.ip ?? null,
        });

        res.json({ ...updated, rescheduledTo: nextDate });
        return;
      }
    }
  }

  res.json(updated);
});

// POST /api/jobs/:id/team-complete — sign off a team's time on an All Teams job
router.post("/jobs/:id/team-complete", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const userId = req.auth!.userId;
  const { actualTimeMins, notes } = req.body as { actualTimeMins?: number; notes?: string };

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!job)            { res.status(404).json({ error: "Job not found" }); return; }
  if (!job.isAllTeams) { res.status(400).json({ error: "Not an All Teams job" }); return; }

  const [userRow] = await db
    .select({ teamId: usersTable.teamId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!userRow?.teamId) { res.status(400).json({ error: "User has no team assigned" }); return; }
  const teamId = userRow.teamId;

  const [existing] = await db
    .select({ id: jobTeamCompletionsTable.id })
    .from(jobTeamCompletionsTable)
    .where(and(eq(jobTeamCompletionsTable.jobId, id), eq(jobTeamCompletionsTable.teamId, teamId)))
    .limit(1);

  let completion;
  if (existing) {
    [completion] = await db
      .update(jobTeamCompletionsTable)
      .set({ actualTimeMins: actualTimeMins ?? null, notes: notes ?? null, completedAt: new Date(), completedById: userId })
      .where(and(eq(jobTeamCompletionsTable.jobId, id), eq(jobTeamCompletionsTable.teamId, teamId)))
      .returning();
  } else {
    [completion] = await db
      .insert(jobTeamCompletionsTable)
      .values({ jobId: id, teamId, actualTimeMins: actualTimeMins ?? null, notes: notes ?? null, completedById: userId })
      .returning();
  }

  if (job.status === "pending") {
    await db.update(jobsTable).set({ status: "in_progress", startedAt: new Date(), updatedAt: new Date() }).where(eq(jobsTable.id, id));
  }

  const allTeams  = await db.select({ id: teamsTable.id }).from(teamsTable);
  const allSigned = await db.select({ teamId: jobTeamCompletionsTable.teamId }).from(jobTeamCompletionsTable).where(eq(jobTeamCompletionsTable.jobId, id));
  const signedIds = new Set(allSigned.map(r => r.teamId));
  const allDone   = allTeams.every(t => signedIds.has(t.id));

  if (allDone) {
    await db.update(jobsTable)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobsTable.id, id));
  }

  res.json({ completion, allDone, signedCount: signedIds.size, totalTeams: allTeams.length });
});

// ── Reactive jobs ────────────────────────────────────────────────────────────

// GET /api/reactive-jobs
router.get("/reactive-jobs", requireAuth, async (req, res) => {
  const assetId = req.query.assetId as string | undefined;
  const statusFilter = req.query.status as string | undefined;
  const conditions = [];
  if (assetId) conditions.push(eq(reactiveJobsTable.assetId, assetId));
  if (statusFilter) {
    const statuses = statusFilter.split(",").map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(reactiveJobsTable.status, statuses[0] as any));
    } else if (statuses.length > 1) {
      conditions.push(inArray(reactiveJobsTable.status, statuses as any[]));
    }
  }
  const rows = await db
    .select()
    .from(reactiveJobsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(5000);
  res.json({ data: rows });
});

// POST /api/reactive-jobs
router.post("/reactive-jobs", requireAuth, validateBody(insertReactiveJobSchema), async (req, res) => {
  const [created] = await db
    .insert(reactiveJobsTable)
    .values({ ...req.body, raisedById: req.auth!.userId })
    .returning();
  await auditLog({
    tableName: "reactive_jobs", recordId: created.id, action: "INSERT",
    changedById: req.auth?.userId ?? null, newData: created as Record<string, unknown>,
    ipAddress: req.ip ?? null,
  });
  res.status(201).json(created);
});

// PATCH /api/reactive-jobs/:id
router.patch("/reactive-jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [before] = await db.select().from(reactiveJobsTable).where(eq(reactiveJobsTable.id, id)).limit(1);
  if (!before) { res.status(404).json({ error: "Reactive job not found" }); return; }
  const [updated] = await db
    .update(reactiveJobsTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(reactiveJobsTable.id, id))
    .returning();
  await auditLog({
    tableName: "reactive_jobs", recordId: id, action: "UPDATE",
    changedById: req.auth?.userId ?? null,
    oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>,
    ipAddress: req.ip ?? null,
  });
  res.json(updated);
});

export default router;
