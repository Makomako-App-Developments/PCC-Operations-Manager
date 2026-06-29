import { Router } from "express";
import {
  db, infillJobsTable, infillOrdersTable, mulchingRecordsTable, mulchDepthReadingsTable,
  assetsTable, teamsTable, usersTable, jobsTable, systemSettingsTable,
  insertInfillJobSchema, insertInfillOrderSchema, insertMulchingRecordSchema,
} from "@workspace/db";
import { eq, and, inArray, desc, gte, lte } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { z } from "zod/v4";
import { auditLog } from "../lib/audit";
import {
  projectNextJobDate, STANDARD_DEPTH_MM, ACTION_THRESHOLD_MM, decayRateForType,
} from "../lib/mulch-decay";

const router = Router();

// ─── Infill Jobs ──────────────────────────────────────────────────────────────

router.get("/infill-jobs", requireAuth, async (req, res) => {
  const { assetId, status } = req.query as Record<string, string | undefined>;
  const conditions = [];
  if (assetId) conditions.push(eq(infillJobsTable.assetId, assetId));
  if (status)  conditions.push(eq(infillJobsTable.status, status as any));

  const jobs = await db
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
      createdAt:       infillJobsTable.createdAt,
      updatedAt:       infillJobsTable.updatedAt,
    })
    .from(infillJobsTable)
    .leftJoin(assetsTable, eq(infillJobsTable.assetId, assetsTable.id))
    .leftJoin(teamsTable,  eq(infillJobsTable.assignedTeamId, teamsTable.id))
    .leftJoin(usersTable,  eq(infillJobsTable.assessedById, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(infillJobsTable.createdAt)
    .limit(300);

  if (jobs.length === 0) {
    res.json({ data: [], total: 0 });
    return;
  }

  const jobIds = jobs.map(j => j.id);
  const orders = await db
    .select()
    .from(infillOrdersTable)
    .where(inArray(infillOrdersTable.infillJobId, jobIds));

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

      const job = await db.transaction(async tx => {
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
      });

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
      const [before] = await db.select().from(infillJobsTable).where(eq(infillJobsTable.id, id)).limit(1);
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

      const [updated] = await db
        .update(infillJobsTable)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(infillJobsTable.id, id))
        .returning();

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
      const [found] = await db.select().from(infillJobsTable).where(eq(infillJobsTable.id, id)).limit(1);
      if (!found) { res.status(404).json({ error: "Infill job not found" }); return; }
      await db.delete(infillJobsTable).where(eq(infillJobsTable.id, id));
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
  const conditions = [];
  if (assetId) conditions.push(eq(infillOrdersTable.assetId, assetId));
  if (status)  conditions.push(eq(infillOrdersTable.status, status as any));

  const rows = await db
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
    .limit(200);

  res.json({ data: rows, total: rows.length });
});

router.post(
  "/infill-orders",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(insertInfillOrderSchema),
  async (req, res) => {
    try {
      const [created] = await db.insert(infillOrdersTable).values(req.body).returning();
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
      const [updated] = await db
        .update(infillOrdersTable)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(infillOrdersTable.id, id))
        .returning();
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
  const conditions = [];
  if (assetId) conditions.push(eq(mulchingRecordsTable.assetId, assetId));
  if (status)  conditions.push(eq(mulchingRecordsTable.status, status as any));

  const rows = await db
    .select({
      id:                  mulchingRecordsTable.id,
      assetId:             mulchingRecordsTable.assetId,
      assetName:           assetsTable.name,
      assetDescription:    assetsTable.description,
      scheduledDate:       mulchingRecordsTable.scheduledDate,
      completedDate:       mulchingRecordsTable.completedDate,
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
    .limit(200);

  res.json({ data: rows, total: rows.length });
});

router.post(
  "/mulching-records",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(insertMulchingRecordSchema),
  async (req, res) => {
    try {
      const [created] = await db.insert(mulchingRecordsTable).values(req.body).returning();
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
      const [updated] = await db
        .update(mulchingRecordsTable)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(mulchingRecordsTable.id, id))
        .returning();
      if (!updated) { res.status(404).json({ error: "Mulching record not found" }); return; }
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

    const [original] = await db
      .select()
      .from(mulchingRecordsTable)
      .where(eq(mulchingRecordsTable.id, id))
      .limit(1);
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

    const [day1] = await db
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
      .returning();

    const siblings = n > 1
      ? await db
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
          .returning()
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

router.get("/mulch-depth-readings", requireAuth, async (req, res) => {
  const { assetId } = req.query as Record<string, string | undefined>;
  const conditions = [];
  if (assetId) conditions.push(eq(mulchDepthReadingsTable.assetId, assetId));

  const rows = await db
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
    .limit(200);

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

    const [sysSettings] = await db.select().from(systemSettingsTable).limit(1);
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

    const nearbyJobs = await db
      .select({ id: jobsTable.id, scheduledDate: jobsTable.scheduledDate })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.assetId, body.assetId),
        inArray(jobsTable.status, ["pending", "in_progress"]),
        gte(jobsTable.scheduledDate, queryStart),
        lte(jobsTable.scheduledDate, queryEnd),
      ));

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

    const result = await db.transaction(async tx => {
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
    });

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

export default router;
