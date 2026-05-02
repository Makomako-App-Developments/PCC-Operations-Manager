import { Router } from "express";
import { db, infillOrdersTable, mulchingRecordsTable, assetsTable, insertInfillOrderSchema, insertMulchingRecordSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";

const router = Router();

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
      assetRef:        assetsTable.reference,
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
      assetRef:      assetsTable.reference,
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
