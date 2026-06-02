import { Router } from "express";
import { db, infillJobsTable, infillOrdersTable, mulchingRecordsTable, assetsTable, teamsTable, usersTable, insertInfillJobSchema, insertInfillOrderSchema, insertMulchingRecordSchema } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { z } from "zod/v4";
import { auditLog } from "../lib/audit";

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
      assetId:         infillJobsTable.assetId,
      assetName:       assetsTable.name,
      assessedById:    infillJobsTable.assessedById,
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

  // Fetch all species lines for returned jobs
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

// Only mutable fields allowed in PATCH — no arbitrary column overwrite
const patchInfillJobSchema = z.object({
  assignedTeamId:  z.string().uuid().nullable().optional(),
  plannedDate:     z.string().nullable().optional(),
  estimatedMins:   z.number().int().nonnegative().nullable().optional(),
  assessmentNotes: z.string().nullable().optional(),
  status: z.enum(["draft", "scheduled", "in_progress", "completed", "cancelled"]).optional(),
});

// Valid state-machine transitions for infill jobs
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
    const { species, ...jobData } = req.body as z.infer<typeof createInfillJobSchema>;
    const [job] = await db.insert(infillJobsTable).values({
      ...jobData,
      assessedById: req.auth!.userId,
    }).returning();

    if (species.length > 0) {
      await db.insert(infillOrdersTable).values(
        species.map(sp => ({
          assetId:         job.assetId,
          infillJobId:     job.id,
          speciesName:     sp.speciesName,
          speciesCategory: sp.speciesCategory,
          quantity:        sp.quantity,
          notes:           sp.notes,
          orderedById:     req.auth!.userId,
        }))
      );
    }

    await auditLog({
      tableName: "infill_jobs", recordId: job.id, action: "INSERT",
      changedById: req.auth?.userId ?? null, newData: job as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(job);
  },
);

router.patch(
  "/infill-jobs/:id",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(patchInfillJobSchema),
  async (req, res) => {
    const id = String(req.params.id);
    const [before] = await db.select().from(infillJobsTable).where(eq(infillJobsTable.id, id)).limit(1);
    if (!before) { res.status(404).json({ error: "Infill job not found" }); return; }

    const patch = (res.locals.body ?? req.body) as z.infer<typeof patchInfillJobSchema>;

    // Enforce state machine if status is being changed
    if (patch.status && patch.status !== before.status) {
      const allowed = ALLOWED_TRANSITIONS[before.status as InfillJobStatus] ?? [];
      if (!allowed.includes(patch.status as InfillJobStatus)) {
        res.status(422).json({
          error: `Cannot transition job from '${before.status}' to '${patch.status}'. Allowed transitions: ${allowed.join(", ") || "none"}.`,
        });
        return;
      }
    }

    // Require team + planned date when scheduling
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
  },
);

router.delete(
  "/infill-jobs/:id",
  requireAuth,
  requireRole("manager", "supervisor"),
  async (req, res) => {
    const id = String(req.params.id);
    const [found] = await db.select().from(infillJobsTable).where(eq(infillJobsTable.id, id)).limit(1);
    if (!found) { res.status(404).json({ error: "Infill job not found" }); return; }
    await db.delete(infillJobsTable).where(eq(infillJobsTable.id, id));
    res.status(204).send();
  },
);

// ─── Infill Orders (legacy single-line endpoint) ──────────────────────────────

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
    const [created] = await db.insert(infillOrdersTable).values(req.body).returning();
    res.status(201).json(created);
  },
);

router.patch(
  "/infill-orders/:id",
  requireAuth,
  requireRole("manager", "supervisor"),
  async (req, res) => {
    const id = String(req.params.id);
    const [updated] = await db
      .update(infillOrdersTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(infillOrdersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Infill order not found" }); return; }
    res.json(updated);
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
      id:            mulchingRecordsTable.id,
      assetId:       mulchingRecordsTable.assetId,
      assetName:     assetsTable.name,
      scheduledDate: mulchingRecordsTable.scheduledDate,
      completedDate: mulchingRecordsTable.completedDate,
      volumeM3:      mulchingRecordsTable.volumeM3,
      status:        mulchingRecordsTable.status,
      mulchType:     mulchingRecordsTable.mulchType,
      contractor:    mulchingRecordsTable.contractor,
      costNzd:       mulchingRecordsTable.costNzd,
      notes:         mulchingRecordsTable.notes,
      createdAt:     mulchingRecordsTable.createdAt,
      updatedAt:     mulchingRecordsTable.updatedAt,
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
    const [created] = await db.insert(mulchingRecordsTable).values(req.body).returning();
    res.status(201).json(created);
  },
);

router.patch(
  "/mulching-records/:id",
  requireAuth,
  requireRole("manager", "supervisor"),
  async (req, res) => {
    const id = String(req.params.id);
    const [updated] = await db
      .update(mulchingRecordsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(mulchingRecordsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Mulching record not found" }); return; }
    res.json(updated);
  },
);

export default router;
