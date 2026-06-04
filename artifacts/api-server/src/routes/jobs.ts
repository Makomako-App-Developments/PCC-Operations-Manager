import { Router } from "express";
import { db, jobsTable, reactiveJobsTable, insertJobSchema, insertReactiveJobSchema, assetsTable, teamsTable, usersTable, jobTeamCompletionsTable, jobTaskSkipReasonsTable, mulchingRecordsTable } from "@workspace/db";
import { eq, and, inArray, or, gte, lte, ilike, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { auditLog } from "../lib/audit";
import { FREQ_DAYS } from "../lib/crew-utils";
import { notifyTeam } from "../lib/push-notifications";

const router = Router();

function isPrivilegedRole(role: string): boolean {
  return ["administrator", "manager", "supervisor"].includes(role);
}

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
  const { assetId, status, page, limit } = res.locals.query as JobQuery;
  let { teamId } = res.locals.query as JobQuery;
  const offset = (page - 1) * limit;

  // Non-privileged users may only see their own team's jobs
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!callerTeamId) { res.json({ data: [], page, limit }); return; }
    teamId = callerTeamId;
  }

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
  assetId:    z.string().uuid().optional(),
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

  // Non-privileged users may only see their own team's completed work
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!callerTeamId) { res.json({ data: [], page: q.page, limit: q.limit }); return; }
    (q as any).teamId = callerTeamId;
  }

  const conditions: ReturnType<typeof eq>[] = [eq(jobsTable.status, "completed")];
  if (q.assetId)    conditions.push(eq(jobsTable.assetId, q.assetId) as any);
  if (q.teamId)     conditions.push(eq(jobsTable.teamId, q.teamId) as any);
  if (q.from)       conditions.push(gte(jobsTable.scheduledDate, q.from) as any);
  if (q.to)         conditions.push(lte(jobsTable.scheduledDate, q.to) as any);
  if (q.ward)       conditions.push(eq(assetsTable.ward, q.ward as any) as any);
  if (q.gardenType) conditions.push(eq(assetsTable.gardenType, q.gardenType as any) as any);
  if (q.search) {
    const term = `%${q.search}%`;
    conditions.push(ilike(assetsTable.name, term) as any);
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
      assetDescription: assetsTable.description,
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
// Falls through to mulching_records when the id is not in the jobs table.
router.get("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (job) {
    if (!isPrivilegedRole(req.auth!.role)) {
      const callerTeamId = req.auth!.teamId;
      if (!job.isAllTeams && job.teamId !== callerTeamId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }
    res.json(job); return;
  }

  // Fallback: check mulching_records
  const [mr] = await db
    .select({
      id:                mulchingRecordsTable.id,
      assetId:           mulchingRecordsTable.assetId,
      status:            mulchingRecordsTable.status,
      teamId:            mulchingRecordsTable.assignedTeamId,
      scheduledDate:     mulchingRecordsTable.scheduledDate,
      completedDate:     mulchingRecordsTable.completedDate,
      estimatedTimeMins: mulchingRecordsTable.estimatedMins,
      notes:             mulchingRecordsTable.notes,
      mulchType:         mulchingRecordsTable.mulchType,
      createdAt:         mulchingRecordsTable.createdAt,
      updatedAt:         mulchingRecordsTable.updatedAt,
      assetName:         assetsTable.name,
      assetDesc:         assetsTable.description,
      gardenType:        assetsTable.gardenType,
      suburb:            assetsTable.suburb,
      streetAddress:     assetsTable.streetAddress,
      lat:               assetsTable.lat,
      lng:               assetsTable.lng,
      serviceTimeMins:   assetsTable.serviceTimeMins,
      routeOrder:        assetsTable.routeOrder,
    })
    .from(mulchingRecordsTable)
    .innerJoin(assetsTable, eq(mulchingRecordsTable.assetId, assetsTable.id))
    .where(eq(mulchingRecordsTable.id, id))
    .limit(1);

  if (!mr) { res.status(404).json({ error: "Job not found" }); return; }

  // Authorization: non-privileged users may only read mulching records for their team
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (mr.teamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const mulchStatusMap: Record<string, string> = { scheduled: "pending", completed: "completed" };
  res.json({
    ...mr,
    jobType:           "mulching",
    status:            mulchStatusMap[mr.status] ?? "pending",
    isAllTeams:        false,
    assignedUserId:    null,
    startedAt:         null,
    pausedAt:          null,
    completedAt:       mr.completedDate ? new Date(`${mr.completedDate}T00:00:00Z`) : null,
    actualTimeMins:    null,
    pausedElapsedSecs: 0,
    crewStatus:        null,
  });
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

    // Send push notification to assigned team members
    if (created.teamId || created.isAllTeams) {
      const [asset] = await db
        .select({ name: assetsTable.name })
        .from(assetsTable)
        .where(eq(assetsTable.id, created.assetId))
        .limit(1);
      const assetName = asset?.name ?? "a site";
      const dateStr = typeof created.scheduledDate === "string"
        ? created.scheduledDate
        : (created.scheduledDate as Date).toISOString().slice(0, 10);

      notifyTeam(created.teamId, created.isAllTeams, {
        title: "New job assigned",
        body:  `${assetName} is scheduled for ${dateStr}.`,
        data:  { jobId: created.id, screen: "job" },
      }).catch(err => console.error("[push] notify error:", err));
    }

    res.status(201).json(created);
  },
);

// PATCH /api/jobs/:id
// When a job is marked as "skipped", automatically reschedule it at the next occurrence.
router.patch("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [before] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);

  // Fallback: if the ID belongs to a mulching record, handle completion there
  if (!before) {
    const [mr] = await db
      .select()
      .from(mulchingRecordsTable)
      .where(eq(mulchingRecordsTable.id, id))
      .limit(1);

    if (!mr) { res.status(404).json({ error: "Job not found" }); return; }

    // Authorization: non-privileged users may only update mulching records for their team
    if (!isPrivilegedRole(req.auth!.role)) {
      const callerTeamId = req.auth!.teamId;
      if (mr.assignedTeamId !== callerTeamId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    const patch = req.body as Record<string, unknown>;
    const toStatus = patch.status as string | undefined;

    // Map field-app status → mulching_records status
    const mulchUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (toStatus === "completed" && mr.status !== "completed") {
      mulchUpdates.status = "completed";
      mulchUpdates.completedDate = new Date().toISOString().slice(0, 10);
    } else if (toStatus === "pending" || toStatus === "in_progress") {
      // Allow re-opening (e.g. start → in_progress treated as still scheduled)
      mulchUpdates.status = "scheduled";
    }

    const [updated] = await db
      .update(mulchingRecordsTable)
      .set(mulchUpdates)
      .where(eq(mulchingRecordsTable.id, id))
      .returning();

    await auditLog({
      tableName: "mulching_records", recordId: id, action: "UPDATE",
      changedById: req.auth?.userId ?? null,
      oldData: mr as Record<string, unknown>, newData: updated as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });

    const mulchStatusMap: Record<string, string> = { scheduled: "pending", completed: "completed" };
    res.json({
      ...updated,
      jobType:           "mulching",
      status:            mulchStatusMap[updated.status] ?? "pending",
      isAllTeams:        false,
      startedAt:         null,
      pausedAt:          null,
      completedAt:       updated.completedDate ? new Date(`${updated.completedDate}T00:00:00Z`) : null,
      actualTimeMins:    null,
      pausedElapsedSecs: 0,
      crewStatus:        null,
      assignedUserId:    null,
    });
    return;
  }

  // Authorization: non-privileged users may only update jobs belonging to their team
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!before.isAllTeams && before.teamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const patch = req.body as Record<string, unknown>;

  // Non-privileged users may only change operational status fields, not structural ones
  if (!isPrivilegedRole(req.auth!.role)) {
    const allowedFields = new Set(["status", "notes", "crewStatus", "pausedElapsedSecs", "actualTimeMins", "skipReason", "outOfSequenceReason", "pestsAndDiseases", "plantHealthVigor", "generalComments"]);
    for (const key of Object.keys(patch)) {
      if (!allowedFields.has(key)) delete patch[key];
    }
  }

  // Never trust client-supplied timestamps — server owns these
  delete patch.startedAt;
  delete patch.completedAt;
  delete patch.pausedAt;

  // Status transition logic
  const fromStatus = before.status;
  const toStatus = patch.status as string | undefined;

  if (toStatus === "in_progress") {
    if (fromStatus === "pending") {
      // Fresh start
      patch.startedAt = new Date();
      patch.pausedAt = null;
    } else if (fromStatus === "paused") {
      // Resume — accumulate elapsed time so far into pausedElapsedSecs
      const pausedAt = before.pausedAt ? new Date(before.pausedAt).getTime() : Date.now();
      const additionalSecs = Math.floor((Date.now() - pausedAt) / 1000);
      patch.pausedElapsedSecs = (before.pausedElapsedSecs ?? 0) + additionalSecs;
      patch.pausedAt = null;
    }
  }

  if (toStatus === "paused" && fromStatus === "in_progress") {
    patch.pausedAt = new Date();
  }

  if (toStatus === "completed" && fromStatus !== "completed") {
    const completedAt = new Date();
    patch.completedAt = completedAt;
    // Calculate actual time: wall-clock minus any accumulated paused time
    if (before.startedAt) {
      const wallSecs = Math.floor((completedAt.getTime() - new Date(before.startedAt).getTime()) / 1000);
      const pausedSecs = before.pausedElapsedSecs ?? 0;
      patch.actualTimeMins = Math.max(1, Math.round((wallSecs - pausedSecs) / 60));
    }
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

// GET /api/jobs/:id/task-skip-reasons
router.get("/jobs/:id/task-skip-reasons", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const rows = await db
    .select()
    .from(jobTaskSkipReasonsTable)
    .where(eq(jobTaskSkipReasonsTable.jobId, id))
    .orderBy(jobTaskSkipReasonsTable.taskIndex);
  res.json({ data: rows });
});

// POST /api/jobs/:id/task-skip-reasons
router.post("/jobs/:id/task-skip-reasons", requireAuth, async (req, res) => {
  const id = String(req.params.id);

  // Authorization: verify the caller can act on this job
  const [job] = await db.select({ teamId: jobsTable.teamId, isAllTeams: jobsTable.isAllTeams }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!job.isAllTeams && job.teamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const { taskIndex, taskLabel, reason } = req.body as {
    taskIndex: number;
    taskLabel: string;
    reason: string;
  };
  if (typeof taskIndex !== "number" || !taskLabel || !reason) {
    res.status(400).json({ error: "taskIndex, taskLabel and reason are required" });
    return;
  }
  const [created] = await db
    .insert(jobTaskSkipReasonsTable)
    .values({ jobId: id, taskIndex, taskLabel, reason, createdById: req.auth!.userId })
    .returning();
  res.status(201).json(created);
});

// POST /api/jobs/:id/team-complete — sign off a team's time on an All Teams job
router.post("/jobs/:id/team-complete", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const userId = req.auth!.userId;
  const { actualTimeMins, notes } = req.body as { actualTimeMins?: number; notes?: string };

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!job)            { res.status(404).json({ error: "Job not found" }); return; }
  if (!job.isAllTeams) { res.status(400).json({ error: "Not an All Teams job" }); return; }

  // Authorization: teamId is always derived from the DB — callers can only sign off their own
  // team's participation; the caller must have a team assignment to participate.
  const [userRow] = await db
    .select({ teamId: usersTable.teamId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!userRow?.teamId) {
    res.status(403).json({ error: "Forbidden: user has no team assigned" }); return;
  }
  const teamId = userRow.teamId;

  // Verify the resolved teamId matches the JWT claim (defence-in-depth, prevents token/DB skew)
  if (!isPrivilegedRole(req.auth!.role) && req.auth!.teamId && req.auth!.teamId !== teamId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

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

  // Non-privileged users may only see reactive jobs assigned to their team
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!callerTeamId) { res.json({ data: [] }); return; }
    conditions.push(eq(reactiveJobsTable.assignedTeamId, callerTeamId));
  }

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
router.post("/reactive-jobs", requireAuth, validateBody(insertReactiveJobSchema.omit({ raisedById: true })), async (req, res) => {
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

// GET /api/reactive-jobs/:id
router.get("/reactive-jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.select().from(reactiveJobsTable).where(eq(reactiveJobsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Reactive job not found" }); return; }
  res.json(row);
});

// PATCH /api/reactive-jobs/:id
router.patch("/reactive-jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [before] = await db.select().from(reactiveJobsTable).where(eq(reactiveJobsTable.id, id)).limit(1);
  if (!before) { res.status(404).json({ error: "Reactive job not found" }); return; }

  // Authorization: non-privileged users may only update reactive jobs assigned to their team
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (before.assignedTeamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  // Build an explicit patch to prevent mass-assignment of sensitive fields
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const workerFields = ["status", "notes", "actualTimeMins", "scheduledDate"];
  const managerFields = ["assignedTeamId", "assignedUserId", "priority", "description", "raisedById"];
  const allowedFields = isPrivilegedRole(req.auth!.role)
    ? [...workerFields, ...managerFields]
    : workerFields;
  for (const key of allowedFields) {
    if (key in body) patch[key] = body[key];
  }

  const [updated] = await db
    .update(reactiveJobsTable)
    .set({ ...patch, updatedAt: new Date() })
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
