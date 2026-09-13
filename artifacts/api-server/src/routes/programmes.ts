import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { createHash } from "crypto";
import {
  db, infillJobsTable, infillOrdersTable, mulchingRecordsTable, mulchDepthReadingsTable,
  assetsTable, teamsTable, usersTable, jobsTable, systemSettingsTable,
  insertInfillJobSchema, insertInfillOrderSchema, insertMulchingRecordSchema,
  executeWithCircuitBreaker,
} from "@workspace/db";
import { eq, and, inArray, desc, gte, lte, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { z } from "zod/v4";
import { auditLog } from "../lib/audit";
import {
  projectNextJobDate, STANDARD_DEPTH_MM, ACTION_THRESHOLD_MM, decayRateForType,
} from "../lib/mulch-decay";
import { mulchingCompletionAudit, programmeCompletionAudit } from "../lib/programme-completion";

const router = Router();
const mulchImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.originalname.toLowerCase().endsWith(".xlsx")
    ) cb(null, true);
    else cb(new Error("Upload an Excel .xlsx workbook."));
  },
});

// ─── Infill Jobs ──────────────────────────────────────────────────────────────

router.get("/infill-jobs", requireAuth, async (req, res) => {
  const { assetId, status } = req.query as Record<string, string | undefined>;
  const conditions: any[] = [];
  if (assetId) conditions.push(eq(infillJobsTable.assetId, assetId));
  if (status)  conditions.push(eq(infillJobsTable.status, status as any));

  const jobs = await executeWithCircuitBreaker(() => db
    .select({
      id:              infillJobsTable.id,
      assetId:          infillJobsTable.assetId,
      assetName:        assetsTable.name,
      assetDescription: assetsTable.description,
      assessedById:     infillJobsTable.assessedById,
      assessorName:    usersTable.name,
      assessmentDate:  infillJobsTable.assessmentDate,
      assessmentNotes: infillJobsTable.assessmentNotes,
      assignedTeamId:  infillJobsTable.assignedTeamId,
      teamName:        teamsTable.name,
      plannedDate:     infillJobsTable.plannedDate,
      estimatedMins:   infillJobsTable.estimatedMins,
      status:          infillJobsTable.status,
      completedAt:     infillJobsTable.completedAt,
      completedById:   infillJobsTable.completedById,
      createdAt:       infillJobsTable.createdAt,
      updatedAt:       infillJobsTable.updatedAt,
    })
    .from(infillJobsTable)
    .leftJoin(assetsTable, eq(infillJobsTable.assetId, assetsTable.id))
    .leftJoin(teamsTable,  eq(infillJobsTable.assignedTeamId, teamsTable.id))
    .leftJoin(usersTable,  eq(infillJobsTable.assessedById, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(infillJobsTable.createdAt)
    .limit(300));

  if (jobs.length === 0) {
    res.json({ data: [], total: 0 });
    return;
  }

  const jobIds = jobs.map(j => j.id);
  const orders = await executeWithCircuitBreaker(() => db
    .select()
    .from(infillOrdersTable)
    .where(inArray(infillOrdersTable.infillJobId, jobIds)));

  const ordersByJob = orders.reduce<Record<string, typeof orders>>((acc, o) => {
    if (!acc[o.infillJobId!]) acc[o.infillJobId!] = [];
    acc[o.infillJobId!].push(o);
    return acc;
  }, {});

  const result = jobs.map(j => ({
    ...j,
    species: ordersByJob[j.id] ?? [],
  }));

  res.json({ data: result, total: result.length });
});

const createInfillJobSchema = insertInfillJobSchema.extend({
  species: z.array(z.object({
    speciesName:     z.string().min(1),
    speciesCategory: z.string().min(1),
    quantity:        z.number().int().positive(),
    notes:           z.string().optional(),
  })).min(1),
});

const patchInfillJobSchema = z.object({
  assignedTeamId:  z.string().uuid().nullable().optional(),
  plannedDate:     z.string().nullable().optional(),
  estimatedMins:   z.number().int().nonnegative().nullable().optional(),
  assessmentNotes: z.string().nullable().optional(),
  assessmentDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["draft", "scheduled", "in_progress", "completed", "cancelled"]).optional(),
});

type InfillJobStatus = "draft" | "scheduled" | "in_progress" | "completed" | "cancelled";
const ALLOWED_TRANSITIONS: Record<InfillJobStatus, InfillJobStatus[]> = {
  draft:       ["scheduled", "cancelled"],
  scheduled:   ["in_progress", "draft", "cancelled"],
  in_progress: ["completed", "scheduled", "cancelled"],
  completed:   [],
  cancelled:   ["draft"],
};

router.post(
  "/infill-jobs",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(createInfillJobSchema),
  async (req, res) => {
    try {
      const { species, ...jobData } = req.body as z.infer<typeof createInfillJobSchema>;

      // Atomicity required: the infill job and its species-order lines must be
      // created together — a partial insert (job with no orders, or orders with
      // no parent job) leaves the data in an inconsistent state.  The audit log
      // is written OUTSIDE the transaction so that a logging failure (e.g. a
      // constraint violation on audit_log) cannot roll back the committed job
      // and order lines. auditLog() swallows its own errors and returns false.
      const job = await executeWithCircuitBreaker(() => db.transaction(async tx => {
        const [created] = await tx.insert(infillJobsTable).values({
          ...jobData,
          assessedById: req.auth!.userId,
          status: "draft",
        }).returning();

        await tx.insert(infillOrdersTable).values(
          species.map(sp => ({
            assetId:         created.assetId,
            infillJobId:     created.id,
            speciesName:     sp.speciesName,
            speciesCategory: sp.speciesCategory,
            quantity:        sp.quantity,
            notes:           sp.notes,
            orderedById:     req.auth!.userId,
          }))
        );

        return created;
      }));

      await auditLog({
        tableName: "infill_jobs", recordId: job.id, action: "INSERT",
        changedById: req.auth?.userId ?? null, newData: job as Record<string, unknown>,
        ipAddress: req.ip ?? null,
      });

      res.status(201).json(job);
    } catch (err) {
      console.error("POST /infill-jobs error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.patch(
  "/infill-jobs/:id",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(patchInfillJobSchema),
  async (req, res) => {
    try {
      const id = String(req.params.id);
      const [before] = await executeWithCircuitBreaker(() => db.select().from(infillJobsTable).where(eq(infillJobsTable.id, id)).limit(1));
      if (!before) { res.status(404).json({ error: "Infill job not found" }); return; }

      const patch = (res.locals.body ?? req.body) as z.infer<typeof patchInfillJobSchema>;

      if (patch.status && patch.status !== before.status) {
        const allowed = ALLOWED_TRANSITIONS[before.status as InfillJobStatus] ?? [];
        if (!allowed.includes(patch.status as InfillJobStatus)) {
          res.status(422).json({
            error: `Cannot transition job from '${before.status}' to '${patch.status}'. Allowed transitions: ${allowed.join(", ") || "none"}.`,
          });
          return;
        }
      }

      if (patch.status === "scheduled") {
        const resolvedTeam = patch.assignedTeamId ?? before.assignedTeamId;
        const resolvedDate = patch.plannedDate ?? before.plannedDate;
        if (!resolvedTeam || !resolvedDate) {
          res.status(422).json({ error: "Scheduling a job requires an assigned team and a planned date." });
          return;
        }
      }

      const completionAudit = programmeCompletionAudit(
        before.status,
        patch.status,
        req.auth!.userId,
      );
      const isFirstCompletion = "completedAt" in completionAudit;
      const [updated] = await executeWithCircuitBreaker(() => db
        .update(infillJobsTable)
        .set({ ...patch, ...completionAudit, updatedAt: new Date() } as any)
        .where(isFirstCompletion
          ? and(
              eq(infillJobsTable.id, id),
              eq(infillJobsTable.status, before.status),
              isNull(infillJobsTable.completedAt),
            )
          : eq(infillJobsTable.id, id))
        .returning());
      if (!updated) {
        res.status(409).json({ error: "Infill job was completed by another user." });
        return;
      }

      await auditLog({
        tableName: "infill_jobs", recordId: id, action: "UPDATE",
        changedById: req.auth?.userId ?? null,
        oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>,
        ipAddress: req.ip ?? null,
      });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /infill-jobs/:id error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.delete(
  "/infill-jobs/:id",
  requireAuth,
  requireRole("manager", "supervisor"),
  async (req, res) => {
    try {
      const id = String(req.params.id);
      const [found] = await executeWithCircuitBreaker(() => db.select().from(infillJobsTable).where(eq(infillJobsTable.id, id)).limit(1));
      if (!found) { res.status(404).json({ error: "Infill job not found" }); return; }
      await executeWithCircuitBreaker(() => db.delete(infillJobsTable).where(eq(infillJobsTable.id, id)));
      res.status(204).send();
    } catch (err) {
      console.error("DELETE /infill-jobs/:id error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Infill Orders ────────────────────────────────────────────────────────────

router.get("/infill-orders", requireAuth, async (req, res) => {
  const { assetId, status } = req.query as Record<string, string | undefined>;
  const conditions: any[] = [];
  if (assetId) conditions.push(eq(infillOrdersTable.assetId, assetId));
  if (status)  conditions.push(eq(infillOrdersTable.status, status as any));

  const rows = await executeWithCircuitBreaker(() => db
    .select({
      id:              infillOrdersTable.id,
      assetId:         infillOrdersTable.assetId,
      assetName:       assetsTable.name,
      infillJobId:     infillOrdersTable.infillJobId,
      speciesName:     infillOrdersTable.speciesName,
      speciesCategory: infillOrdersTable.speciesCategory,
      quantity:        infillOrdersTable.quantity,
      status:          infillOrdersTable.status,
      orderedById:     infillOrdersTable.orderedById,
      orderDate:       infillOrdersTable.orderDate,
      deliveryDate:    infillOrdersTable.deliveryDate,
      plantedDate:     infillOrdersTable.plantedDate,
      supplierRef:     infillOrdersTable.supplierRef,
      unitCostNzd:     infillOrdersTable.unitCostNzd,
      notes:           infillOrdersTable.notes,
      createdAt:       infillOrdersTable.createdAt,
      updatedAt:       infillOrdersTable.updatedAt,
    })
    .from(infillOrdersTable)
    .leftJoin(assetsTable, eq(infillOrdersTable.assetId, assetsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(infillOrdersTable.createdAt)
    .limit(200));

  res.json({ data: rows, total: rows.length });
});

router.post(
  "/infill-orders",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(insertInfillOrderSchema),
  async (req, res) => {
    try {
      const [created] = await executeWithCircuitBreaker(() => db.insert(infillOrdersTable).values(req.body).returning());
      res.status(201).json(created);
    } catch (err) {
      console.error("POST /infill-orders error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.patch(
  "/infill-orders/:id",
  requireAuth,
  requireRole("manager", "supervisor"),
  async (req, res) => {
    try {
      const id = String(req.params.id);
      const [updated] = await executeWithCircuitBreaker(() => db
        .update(infillOrdersTable)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(infillOrdersTable.id, id))
        .returning());
      if (!updated) { res.status(404).json({ error: "Infill order not found" }); return; }
      res.json(updated);
    } catch (err) {
      console.error("PATCH /infill-orders/:id error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Mulching Records ─────────────────────────────────────────────────────────

router.get("/mulching-records", requireAuth, async (req, res) => {
  const { assetId, status } = req.query as Record<string, string | undefined>;
  const conditions: any[] = [];
  if (assetId) conditions.push(eq(mulchingRecordsTable.assetId, assetId));
  if (status)  conditions.push(eq(mulchingRecordsTable.status, status as any));

  const rows = await executeWithCircuitBreaker(() => db
    .select({
      id:                  mulchingRecordsTable.id,
      assetId:             mulchingRecordsTable.assetId,
      assetName:           assetsTable.name,
      assetDescription:    assetsTable.description,
      scheduledDate:       mulchingRecordsTable.scheduledDate,
      completedDate:       mulchingRecordsTable.completedDate,
      completedAt:         mulchingRecordsTable.completedAt,
      completedById:       mulchingRecordsTable.completedById,
      volumeM3:            mulchingRecordsTable.volumeM3,
      status:              mulchingRecordsTable.status,
      mulchType:           mulchingRecordsTable.mulchType,
      contractor:          mulchingRecordsTable.contractor,
      costNzd:             mulchingRecordsTable.costNzd,
      notes:               mulchingRecordsTable.notes,
      sourceReadingId:     mulchingRecordsTable.sourceReadingId,
      projectedDepthAtDue: mulchingRecordsTable.projectedDepthAtDue,
      assignedTeamId:      mulchingRecordsTable.assignedTeamId,
      estimatedMins:       mulchingRecordsTable.estimatedMins,
      alignedJobId:        mulchingRecordsTable.alignedJobId,
      alignedJobDate:      mulchingRecordsTable.alignedJobDate,
      splitGroupId:        mulchingRecordsTable.splitGroupId,
      splitDayIndex:       mulchingRecordsTable.splitDayIndex,
      splitTotalDays:      mulchingRecordsTable.splitTotalDays,
      createdAt:           mulchingRecordsTable.createdAt,
      updatedAt:           mulchingRecordsTable.updatedAt,
    })
    .from(mulchingRecordsTable)
    .leftJoin(assetsTable, eq(mulchingRecordsTable.assetId, assetsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(mulchingRecordsTable.createdAt)
    .limit(200));

  res.json({ data: rows, total: rows.length });
});

router.post(
  "/mulching-records",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(insertMulchingRecordSchema),
  async (req, res) => {
    try {
      const completionAudit = mulchingCompletionAudit(
        "due",
        req.body.status,
        req.auth!.userId,
      );
      const [created] = await executeWithCircuitBreaker(() => db
        .insert(mulchingRecordsTable)
        .values({ ...req.body, ...completionAudit })
        .returning());
      res.status(201).json(created);
    } catch (err) {
      console.error("POST /mulching-records error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.patch(
  "/mulching-records/:id",
  requireAuth,
  requireRole("manager", "supervisor"),
  async (req, res) => {
    try {
      const id = String(req.params.id);
      const [before] = await executeWithCircuitBreaker(() => db
        .select()
        .from(mulchingRecordsTable)
        .where(eq(mulchingRecordsTable.id, id))
        .limit(1));
      if (!before) { res.status(404).json({ error: "Mulching record not found" }); return; }
      const patch = req.body as Record<string, unknown>;
      delete patch.completedAt;
      delete patch.completedById;
      const completionAudit = mulchingCompletionAudit(
        before.status,
        patch.status,
        req.auth!.userId,
      );
      const isFirstCompletion = "completedAt" in completionAudit;
      const [updated] = await executeWithCircuitBreaker(() => db
        .update(mulchingRecordsTable)
        .set({ ...patch, ...completionAudit, updatedAt: new Date() })
        .where(isFirstCompletion
          ? and(
              eq(mulchingRecordsTable.id, id),
              eq(mulchingRecordsTable.status, before.status),
              isNull(mulchingRecordsTable.completedAt),
            )
          : eq(mulchingRecordsTable.id, id))
        .returning());
      if (!updated) {
        res.status(409).json({ error: "Mulching record was completed by another user." });
        return;
      }
      res.json(updated);
    } catch (err) {
      console.error("PATCH /mulching-records/:id error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/mulching-records/:id/split — split one draft/scheduled record across N days
const splitMulchingSchema = z.object({
  dates:     z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(2).max(7),
  teamId:    z.string().uuid(),
  totalMins: z.number().int().positive(),
});

router.post(
  "/mulching-records/:id/split",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(splitMulchingSchema),
  async (req, res) => {
    try {
    const id = String(req.params.id);
    const { dates, teamId, totalMins } = res.locals.body as z.infer<typeof splitMulchingSchema>;

    const [original] = await executeWithCircuitBreaker(() => db
      .select()
      .from(mulchingRecordsTable)
      .where(eq(mulchingRecordsTable.id, id))
      .limit(1));
    if (!original) { res.status(404).json({ error: "Mulching record not found" }); return; }

    const n = dates.length;
    const minsPerDay = Math.floor(totalMins / n);
    const lastDayMins = totalMins - minsPerDay * (n - 1);
    const groupId = crypto.randomUUID();

    // Distribute volumeM3 proportionally by time fraction.
    // Each day gets round(fraction * total, 2); last day gets the remainder.
    const totalVolumeM3 = original.volumeM3 != null ? parseFloat(String(original.volumeM3)) : null;
    function dayVolume(dayMins: number, isLast: boolean, accruedVol: number): string | null {
      if (totalVolumeM3 == null) return null;
      if (isLast) return String(Math.round((totalVolumeM3 - accruedVol) * 100) / 100);
      return String(Math.round((dayMins / totalMins) * totalVolumeM3 * 100) / 100);
    }
    const day1Vol = dayVolume(minsPerDay, n === 1, 0);

    const [day1] = await executeWithCircuitBreaker(() => db
      .update(mulchingRecordsTable)
      .set({
        scheduledDate:  dates[0],
        assignedTeamId: teamId,
        estimatedMins:  minsPerDay,
        volumeM3:       day1Vol,
        status:         "scheduled",
        splitGroupId:   groupId,
        splitDayIndex:  1,
        splitTotalDays: n,
        updatedAt:      new Date(),
      })
      .where(eq(mulchingRecordsTable.id, id))
      .returning());

    const siblings = n > 1
      ? await executeWithCircuitBreaker(() => db
          .insert(mulchingRecordsTable)
          .values(
            dates.slice(1).map((date: string, i: number) => {
              const isLast = i === n - 2;
              const sibMins = isLast ? lastDayMins : minsPerDay;
              const accruedVol = totalVolumeM3 != null
                ? parseFloat(day1Vol ?? "0") +
                  dates.slice(1, i + 1).reduce((acc, _, j) => {
                    const m = j === n - 2 ? lastDayMins : minsPerDay;
                    return acc + Math.round((m / totalMins) * totalVolumeM3 * 100) / 100;
                  }, 0)
                : 0;
              return {
                assetId:         original.assetId,
                scheduledDate:   date,
                assignedTeamId:  teamId,
                estimatedMins:   sibMins,
                volumeM3:        dayVolume(sibMins, isLast, accruedVol),
                status:          "scheduled" as const,
                mulchType:       original.mulchType,
                notes:           original.notes,
                sourceReadingId: original.sourceReadingId,
                splitGroupId:    groupId,
                splitDayIndex:   i + 2,
                splitTotalDays:  n,
              };
            }),
          )
          .returning())
      : [];

    res.json({ groupId, records: [day1, ...siblings] });
    } catch (err) {
      console.error("POST /mulching-records/:id/split error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Mulch Depth Readings ─────────────────────────────────────────────────────

const createDepthReadingSchema = z.object({
  assetId:            z.string().uuid(),
  depthMm:            z.number().int().nonnegative(),
  mulchType:          z.string().max(100).nullable().optional(),
  recordedAt:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:              z.string().nullable().optional(),
  isFreshApplication: z.boolean().optional().default(false),
});

type DepthReadingInput = z.infer<typeof createDepthReadingSchema> & {
  importNote?: string | null;
};

/**
 * The one authoritative path from a recorded depth to its manager-only draft.
 * Both the individual form and historical workbook import use this function so
 * their projection, capacity alignment, volume and duration stay identical.
 */
async function createDepthReadingAndDraft(
  tx: any,
  body: DepthReadingInput,
  settings: { mulchDecayRateMmPerMonth?: number | null; mulchSpreadingRateM3PerHour?: number | null } | undefined,
  recordedById: string | null,
) {
  const configDecayRate = settings?.mulchDecayRateMmPerMonth ?? 5;
  const configSpreadingRate = settings?.mulchSpreadingRateM3PerHour ?? 2;
  const effectiveDepth = body.isFreshApplication ? STANDARD_DEPTH_MM : body.depthMm;
  const projectedJobDate = projectNextJobDate(effectiveDepth, body.mulchType, body.recordedAt);

  const ALIGN_FLEX_DAYS = 14;
  const FORWARD_LOOK_DAYS = 45;
  const isImmediate = effectiveDepth <= ACTION_THRESHOLD_MM;
  const projectedMs = new Date(`${projectedJobDate}T00:00:00Z`).getTime();
  let queryStart: string;
  let queryEnd: string;
  if (isImmediate) {
    queryStart = body.recordedAt;
    queryEnd = new Date(new Date(`${body.recordedAt}T00:00:00Z`).getTime() + FORWARD_LOOK_DAYS * 86400000).toISOString().slice(0, 10);
  } else {
    queryStart = new Date(projectedMs - ALIGN_FLEX_DAYS * 86400000).toISOString().slice(0, 10);
    queryEnd = new Date(projectedMs + ALIGN_FLEX_DAYS * 86400000).toISOString().slice(0, 10);
    if (queryStart < body.recordedAt) queryStart = body.recordedAt;
  }

  const nearbyJobs = await tx
    .select({ id: jobsTable.id, scheduledDate: jobsTable.scheduledDate })
    .from(jobsTable)
    .where(and(
      eq(jobsTable.assetId, body.assetId),
      inArray(jobsTable.status, ["pending", "in_progress"]),
      gte(jobsTable.scheduledDate, queryStart),
      lte(jobsTable.scheduledDate, queryEnd),
    ));
  const nearestJob = nearbyJobs.length
    ? nearbyJobs.reduce((best: { id: string; scheduledDate: string }, job: { id: string; scheduledDate: string }) =>
        job.scheduledDate < best.scheduledDate ? job : best, nearbyJobs[0])
    : null;
  const finalJobDate = nearestJob ? nearestJob.scheduledDate : projectedJobDate;
  const alignedJobId = nearestJob?.id ?? null;
  const alignedJobDate = nearestJob?.scheduledDate ?? null;

  const [reading] = await tx.insert(mulchDepthReadingsTable).values({
    assetId: body.assetId,
    depthMm: effectiveDepth,
    mulchType: body.mulchType ?? null,
    recordedAt: body.recordedAt,
    recordedById,
    notes: body.importNote ?? body.notes ?? null,
    isFreshApplication: body.isFreshApplication ?? false,
    projectedJobDate,
  }).returning();

  const rate = decayRateForType(body.mulchType, configDecayRate);
  const readingDate = new Date(`${body.recordedAt}T00:00:00Z`);
  const finalDate = new Date(`${finalJobDate}T00:00:00Z`);
  const projectedDepthAtDue = Math.max(0, Math.round(
    effectiveDepth - rate * ((finalDate.getTime() - readingDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
  ));
  const [asset] = await tx.select({ areaM2: assetsTable.areaM2 }).from(assetsTable)
    .where(eq(assetsTable.id, body.assetId)).limit(1);
  const areaM2 = asset ? parseFloat(asset.areaM2 ?? "0") : 0;
  const volumeM3 = areaM2 > 0 ? Math.round((Math.max(0, STANDARD_DEPTH_MM - projectedDepthAtDue) / 1000 * areaM2) * 100) / 100 : null;
  const estimatedMins = volumeM3 != null && configSpreadingRate > 0
    ? Math.max(5, Math.round((volumeM3 / configSpreadingRate) * 60 / 5) * 5)
    : null;
  const [existingDraft] = await tx.select().from(mulchingRecordsTable).where(and(
    eq(mulchingRecordsTable.assetId, body.assetId),
    eq(mulchingRecordsTable.status, "draft"),
  )).limit(1);

  const [draft] = existingDraft
    ? await tx.update(mulchingRecordsTable).set({
        scheduledDate: finalJobDate, mulchType: body.mulchType ?? existingDraft.mulchType,
        sourceReadingId: reading.id, projectedDepthAtDue,
        volumeM3: volumeM3 !== null ? String(volumeM3) : existingDraft.volumeM3,
        estimatedMins: estimatedMins ?? existingDraft.estimatedMins,
        alignedJobId, alignedJobDate, updatedAt: new Date(),
      }).where(eq(mulchingRecordsTable.id, existingDraft.id)).returning()
    : await tx.insert(mulchingRecordsTable).values({
        assetId: body.assetId, status: "draft", scheduledDate: finalJobDate,
        mulchType: body.mulchType ?? null, sourceReadingId: reading.id,
        projectedDepthAtDue, volumeM3: volumeM3 !== null ? String(volumeM3) : null,
        estimatedMins, alignedJobId, alignedJobDate,
      }).returning();
  return { reading, draft, draftAction: existingDraft ? "updated" as const : "created" as const };
}

type ImportRow = {
  rowNumber: number;
  globalId: string;
  siteName: string;
  recordedAt: string;
  depthMm: number;
  assetId?: string;
  warning?: string;
  error?: string;
};

function normaliseGlobalId(value: unknown): string {
  return String(value ?? "").trim().replace(/^\{|\}$/g, "").toUpperCase();
}
function normaliseSiteName(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function asIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) return value.trim().slice(0, 10);
  return null;
}

async function inspectMulchImport(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets["Mulch Depths"];
  const batchKey = createHash("sha256").update(buffer).digest("hex");
  if (!sheet) return { batchKey, rows: [] as ImportRow[], errors: ["Workbook must include a sheet named “Mulch Depths”."], warnings: [] as string[] };
  const cells = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const headers = (cells[0] ?? []).map(v => String(v ?? "").trim().toLowerCase());
  const required = ["date", "globalid", "site name", "mulch depth (mm)"];
  const missing = required.filter(header => !headers.includes(header));
  if (missing.length) return { batchKey, rows: [] as ImportRow[], errors: [`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`], warnings: [] as string[] };
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  cells.slice(1).forEach((row, offset) => {
    if (!row.some(value => value !== null && value !== "")) return;
    const rowNumber = offset + 2;
    const globalId = normaliseGlobalId(row[index.globalid]);
    const siteName = String(row[index["site name"]] ?? "").trim();
    const recordedAt = asIsoDate(row[index.date]);
    const rawDepth = row[index["mulch depth (mm)"]];
    const depthMm = typeof rawDepth === "number" ? rawDepth : Number(rawDepth);
    const item: ImportRow = { rowNumber, globalId, siteName, recordedAt: recordedAt ?? "", depthMm };
    if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(globalId)) item.error = "Invalid GlobalID.";
    else if (seen.has(globalId)) item.error = "Duplicate GlobalID in workbook.";
    else if (!recordedAt) item.error = "Invalid reading date.";
    else if (!Number.isInteger(depthMm) || depthMm < 0) item.error = "Depth must be a non-negative whole number.";
    seen.add(globalId);
    if (item.error) errors.push(`Row ${rowNumber}: ${item.error}`);
    rows.push(item);
  });
  if (!rows.length) errors.push("Workbook has no data rows.");
  if (rows.length > 500) errors.push("Workbook exceeds the 500-row import limit.");

  const activeAssets = await executeWithCircuitBreaker(() => db.select({
    id: assetsTable.id, globalId: assetsTable.globalId, name: assetsTable.name,
  }).from(assetsTable).where(eq(assetsTable.isActive, true)));
  const assetsByGlobalId = new Map(activeAssets.map(asset => [normaliseGlobalId(asset.globalId), asset]));
  const warnings: string[] = [];
  for (const row of rows) {
    if (row.error) continue;
    const asset = assetsByGlobalId.get(row.globalId);
    if (!asset) {
      row.error = "No active production asset matches this GlobalID.";
      errors.push(`Row ${row.rowNumber}: ${row.error}`);
      continue;
    }
    row.assetId = asset.id;
    if (row.siteName && normaliseSiteName(row.siteName) !== normaliseSiteName(asset.name)) {
      row.warning = `Workbook site name “${row.siteName}” differs from current asset name “${asset.name}”.`;
      warnings.push(`Row ${row.rowNumber}: ${row.warning}`);
    }
  }
  return { batchKey, rows, errors, warnings };
}

router.get("/mulch-depth-readings", requireAuth, async (req, res) => {
  const { assetId } = req.query as Record<string, string | undefined>;
  const conditions: any[] = [];
  if (assetId) conditions.push(eq(mulchDepthReadingsTable.assetId, assetId));

  const rows = await executeWithCircuitBreaker(() => db
    .select({
      id:                 mulchDepthReadingsTable.id,
      assetId:            mulchDepthReadingsTable.assetId,
      assetName:          assetsTable.name,
      depthMm:            mulchDepthReadingsTable.depthMm,
      mulchType:          mulchDepthReadingsTable.mulchType,
      recordedAt:         mulchDepthReadingsTable.recordedAt,
      recordedById:       mulchDepthReadingsTable.recordedById,
      recordedByName:     usersTable.name,
      notes:              mulchDepthReadingsTable.notes,
      isFreshApplication: mulchDepthReadingsTable.isFreshApplication,
      projectedJobDate:   mulchDepthReadingsTable.projectedJobDate,
      createdAt:          mulchDepthReadingsTable.createdAt,
    })
    .from(mulchDepthReadingsTable)
    .leftJoin(assetsTable, eq(mulchDepthReadingsTable.assetId, assetsTable.id))
    .leftJoin(usersTable,  eq(mulchDepthReadingsTable.recordedById, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(mulchDepthReadingsTable.recordedAt), desc(mulchDepthReadingsTable.createdAt))
    .limit(200));

  res.json({ data: rows, total: rows.length });
});

router.post(
  "/mulch-depth-readings",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(createDepthReadingSchema),
  async (req, res) => {
    try {
    const body = (res.locals.body ?? req.body) as z.infer<typeof createDepthReadingSchema>;

    const [sysSettings] = await executeWithCircuitBreaker(() => db.select().from(systemSettingsTable).limit(1));
    const configDecayRate    = sysSettings?.mulchDecayRateMmPerMonth   ?? 5;
    const configSpreadingRate = sysSettings?.mulchSpreadingRateM3PerHour ?? 2;

    const effectiveDepth = body.isFreshApplication ? STANDARD_DEPTH_MM : body.depthMm;
    const projectedJobDate = projectNextJobDate(effectiveDepth, body.mulchType, body.recordedAt);

    // ── Schedule alignment ────────────────────────────────────────────────────
    // Two distinct strategies depending on whether the job is needed immediately
    // or in the future:
    //
    // IMMEDIATE (depth ≤ threshold): mulch is already critically low — find the
    //   earliest pending/in-progress visit within the next FORWARD_LOOK_DAYS days
    //   so the crew can do the top-up on their next visit.
    //
    // FUTURE (depth > threshold): mulch will degrade to threshold at projectedJobDate —
    //   only look for a visit within ±ALIGN_FLEX_DAYS of that projected date.
    //   This prevents a nearby-but-unrelated service (e.g. a visit next week) from
    //   being incorrectly selected when the mulch isn't needed for months.
    const ALIGN_FLEX_DAYS   = 14;
    const FORWARD_LOOK_DAYS = 45;
    const isImmediate = effectiveDepth <= ACTION_THRESHOLD_MM;
    const projMs = new Date(projectedJobDate + "T00:00:00Z").getTime();

    let queryStart: string;
    let queryEnd: string;

    if (isImmediate) {
      // Immediate: any upcoming visit in the next 45 days
      queryStart = body.recordedAt;
      queryEnd   = new Date(new Date(body.recordedAt + "T00:00:00Z").getTime() + FORWARD_LOOK_DAYS * 86400000).toISOString().slice(0, 10);
    } else {
      // Future: only visits within ±14 days of the projected due date
      queryStart = new Date(projMs - ALIGN_FLEX_DAYS * 86400000).toISOString().slice(0, 10);
      queryEnd   = new Date(projMs + ALIGN_FLEX_DAYS * 86400000).toISOString().slice(0, 10);
      // Clamp to reading date so we never pick a past visit
      if (queryStart < body.recordedAt) queryStart = body.recordedAt;
    }

    const nearbyJobs = await executeWithCircuitBreaker(() => db
      .select({ id: jobsTable.id, scheduledDate: jobsTable.scheduledDate })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.assetId, body.assetId),
        inArray(jobsTable.status, ["pending", "in_progress"]),
        gte(jobsTable.scheduledDate, queryStart),
        lte(jobsTable.scheduledDate, queryEnd),
      )));

    // Pick the earliest candidate in the valid window
    const nearestJob = nearbyJobs.length > 0
      ? nearbyJobs.reduce<{ id: string; scheduledDate: string }>((best, job) =>
          job.scheduledDate < best.scheduledDate ? job : best
        , nearbyJobs[0])
      : null;

    // Use aligned date if a nearby job exists, otherwise use the projected date
    const finalJobDate  = nearestJob ? nearestJob.scheduledDate : projectedJobDate;
    const alignedJobId   = nearestJob?.id ?? null;
    const alignedJobDate = nearestJob?.scheduledDate ?? null;

    // Atomicity required: the depth reading and the linked mulching-record draft
    // must be created (or updated) together — a reading with no corresponding
    // draft, or a draft whose sourceReadingId points to a non-existent reading,
    // leaves the mulch-scheduling data in an inconsistent state.  The audit log
    // is written OUTSIDE the transaction so that a logging failure cannot roll
    // back the committed reading and draft. auditLog() swallows its own errors.
    const result = await executeWithCircuitBreaker(() => db.transaction(async tx => {
      const [reading] = await tx
        .insert(mulchDepthReadingsTable)
        .values({
          assetId:            body.assetId,
          depthMm:            effectiveDepth,
          mulchType:          body.mulchType ?? null,
          recordedAt:         body.recordedAt,
          recordedById:       req.auth?.userId ?? null,
          notes:              body.notes ?? null,
          isFreshApplication: body.isFreshApplication ?? false,
          projectedJobDate,
        })
        .returning();

      // Projected remaining depth at the final (possibly aligned) due date
      const rate = decayRateForType(body.mulchType, configDecayRate);
      const readingDate    = new Date(body.recordedAt + "T00:00:00Z");
      const finalDate      = new Date(finalJobDate + "T00:00:00Z");
      const monthsToTarget = (finalDate.getTime() - readingDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      const projectedDepthAtDue = Math.max(0, Math.round(effectiveDepth - rate * monthsToTarget));

      // Volume to apply = (target depth − projected depth at due date) × area ÷ 1000
      // Target depth = STANDARD_DEPTH_MM (100 mm per KPI specification)
      const [asset] = await tx.select({ areaM2: assetsTable.areaM2 }).from(assetsTable).where(eq(assetsTable.id, body.assetId)).limit(1);
      const areaM2 = asset ? parseFloat(asset.areaM2 ?? "0") : 0;
      const depthToApplyMm = Math.max(0, STANDARD_DEPTH_MM - projectedDepthAtDue);
      const volumeM3 = areaM2 > 0 ? Math.round(depthToApplyMm / 1000 * areaM2 * 100) / 100 : null;

      // Auto-estimate job duration from volume ÷ spreading rate (rounded to nearest 5 min)
      const estimatedMins = volumeM3 != null && configSpreadingRate > 0
        ? Math.max(5, Math.round((volumeM3 / configSpreadingRate) * 60 / 5) * 5)
        : null;

      // Check for an existing draft mulching record for this asset
      const [existingDraft] = await tx
        .select()
        .from(mulchingRecordsTable)
        .where(and(
          eq(mulchingRecordsTable.assetId, body.assetId),
          eq(mulchingRecordsTable.status, "draft"),
        ))
        .limit(1);

      let draft;
      if (existingDraft) {
        // Update the existing draft's projected date, source reading, volume and estimated time
        const [updated] = await tx
          .update(mulchingRecordsTable)
          .set({
            scheduledDate:       finalJobDate,
            mulchType:           body.mulchType ?? existingDraft.mulchType,
            sourceReadingId:     reading.id,
            projectedDepthAtDue,
            volumeM3:            volumeM3 !== null ? String(volumeM3) : existingDraft.volumeM3,
            estimatedMins:       estimatedMins ?? existingDraft.estimatedMins,
            alignedJobId,
            alignedJobDate,
            updatedAt:           new Date(),
          })
          .where(eq(mulchingRecordsTable.id, existingDraft.id))
          .returning();
        draft = updated;
      } else {
        // Create a new draft mulching record with calculated volume and estimated time
        const [created] = await tx
          .insert(mulchingRecordsTable)
          .values({
            assetId:             body.assetId,
            status:              "draft",
            scheduledDate:       finalJobDate,
            mulchType:           body.mulchType ?? null,
            sourceReadingId:     reading.id,
            projectedDepthAtDue,
            volumeM3:            volumeM3 !== null ? String(volumeM3) : null,
            estimatedMins:       estimatedMins ?? null,
            alignedJobId,
            alignedJobDate,
          })
          .returning();
        draft = created;
      }

      return { reading, draft };
    }));

    await auditLog({
      tableName:   "mulch_depth_readings",
      recordId:    result.reading.id,
      action:      "INSERT",
      changedById: req.auth?.userId ?? null,
      newData:     result.reading as Record<string, unknown>,
      ipAddress:   req.ip ?? null,
    });

    res.status(201).json(result);
    } catch (err) {
      console.error("POST /mulch-depth-readings error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Historical mulch-depth workbook import ──────────────────────────────────
// Preview and commit deliberately accept the same file. The deterministic hash
// makes the confirmation stateless and prevents a changed workbook being
// committed after a manager has reviewed an earlier preview.
router.post(
  "/mulch-depth-import/preview",
  requireAuth,
  requireRole("manager"),
  mulchImportUpload.single("workbook"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Attach an Excel .xlsx workbook." });
      const inspection = await inspectMulchImport(req.file.buffer);
      const validRows = inspection.rows.filter(row => !row.error).length;
      const tag = `Workbook mulch-depth import ${inspection.batchKey}`;
      const existing = validRows
        ? await executeWithCircuitBreaker(() => db.select({ id: mulchDepthReadingsTable.id })
            .from(mulchDepthReadingsTable).where(eq(mulchDepthReadingsTable.notes, tag)))
        : [];
      res.json({
        batchKey: inspection.batchKey,
        valid: inspection.errors.length === 0,
        summary: {
          totalRows: inspection.rows.length,
          validRows,
          invalidRows: inspection.rows.length - validRows,
          warnings: inspection.warnings.length,
          alreadyImported: existing.length === validRows && validRows > 0,
        },
        rows: inspection.rows.map(row => ({
          rowNumber: row.rowNumber, globalId: row.globalId, siteName: row.siteName,
          recordedAt: row.recordedAt, depthMm: row.depthMm, warning: row.warning, error: row.error,
        })),
        errors: inspection.errors,
        warnings: inspection.warnings,
      });
    } catch (error) {
      console.error("POST /mulch-depth-import/preview error:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to read workbook." });
    }
  },
);

router.post(
  "/mulch-depth-import/commit",
  requireAuth,
  requireRole("manager"),
  mulchImportUpload.single("workbook"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Attach the validated Excel workbook again to confirm import." });
      const inspection = await inspectMulchImport(req.file.buffer);
      const submittedKey = String(req.body?.batchKey ?? "");
      if (!/^[a-f0-9]{64}$/.test(submittedKey) || submittedKey !== inspection.batchKey) {
        return res.status(409).json({ error: "This workbook differs from the reviewed batch. Preview it again before confirming." });
      }
      if (inspection.errors.length) {
        return res.status(422).json({ error: "Workbook validation failed.", errors: inspection.errors, warnings: inspection.warnings });
      }
      const rows = inspection.rows as (ImportRow & { assetId: string })[];
      const importNote = `Workbook mulch-depth import ${inspection.batchKey}`;
      const [sysSettings] = await executeWithCircuitBreaker(() => db.select().from(systemSettingsTable).limit(1));
      const result = await executeWithCircuitBreaker(() => db.transaction(async tx => {
        const alreadyImported = await tx.select({ id: mulchDepthReadingsTable.id })
          .from(mulchDepthReadingsTable).where(eq(mulchDepthReadingsTable.notes, importNote));
        if (alreadyImported.length) {
          if (alreadyImported.length !== rows.length) throw new Error("This batch has an incomplete import marker and requires administrator review.");
          return { createdReadings: 0, createdDrafts: 0, updatedDrafts: 0, alreadyImported: true };
        }
        let createdDrafts = 0;
        let updatedDrafts = 0;
        for (const row of rows) {
          const created = await createDepthReadingAndDraft(tx, {
            assetId: row.assetId,
            depthMm: row.depthMm,
            mulchType: "wood_chip",
            recordedAt: row.recordedAt,
            notes: undefined,
            isFreshApplication: false,
            importNote,
          }, sysSettings, req.auth?.userId ?? null);
          if (created.draftAction === "created") createdDrafts++;
          else updatedDrafts++;
        }
        return { createdReadings: rows.length, createdDrafts, updatedDrafts, alreadyImported: false };
      }));
      await auditLog({
        tableName: "mulch_depth_import",
        recordId: null,
        action: "INSERT",
        changedById: req.auth?.userId ?? null,
        newData: { batchKey: inspection.batchKey, source: "Mulch Depths workbook", ...result },
        ipAddress: req.ip ?? null,
      });
      res.status(result.alreadyImported ? 200 : 201).json({
        batchKey: inspection.batchKey,
        ...result,
        message: result.alreadyImported
          ? "This workbook was already imported; no duplicate readings or drafts were created."
          : "Mulch-depth readings imported as manager-review drafts. No field work was scheduled or assigned.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import workbook.";
      console.error("POST /mulch-depth-import/commit error:", error);
      res.status(message.includes("incomplete import marker") ? 409 : 500).json({ error: message });
    }
  },
);

export default router;
