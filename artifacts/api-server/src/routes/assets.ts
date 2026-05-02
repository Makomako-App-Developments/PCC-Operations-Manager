import { Router } from "express";
import { db, assetsTable, insertAssetSchema } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { auditLog } from "../lib/audit";

const router = Router();

const listQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(200).default(50),
  search:     z.string().optional(),
  gardenType: z.string().optional(),
  teamId:     z.string().uuid().optional(),
  ward:       z.string().optional(),
  isActive:   z.coerce.boolean().default(true),
});

type ListQuery = z.infer<typeof listQuerySchema>;

// GET /api/assets
router.get("/assets", requireAuth, validateQuery(listQuerySchema), async (req, res) => {
  const { page, limit, isActive } = res.locals.query as ListQuery;
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.isActive, isActive))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(assetsTable)
    .where(eq(assetsTable.isActive, isActive));

  res.json({ data: rows, total: Number(count), page, limit });
});

// GET /api/assets/:id
router.get("/assets/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id)).limit(1);
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json(asset);
});

// POST /api/assets
router.post("/assets", requireAuth, requireRole("manager", "supervisor"), validateBody(insertAssetSchema), async (req, res) => {
  const [created] = await db.insert(assetsTable).values(req.body).returning();
  await auditLog({ tableName: "assets", recordId: created.id, action: "INSERT", changedById: req.auth?.userId ?? null, newData: created as Record<string, unknown>, ipAddress: req.ip ?? null });
  res.status(201).json(created);
});

// PATCH /api/assets/:id
router.patch("/assets/:id", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  const id = String(req.params.id);
  const [before] = await db.select().from(assetsTable).where(eq(assetsTable.id, id)).limit(1);
  if (!before) { res.status(404).json({ error: "Asset not found" }); return; }
  const [updated] = await db
    .update(assetsTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(assetsTable.id, id))
    .returning();
  await auditLog({ tableName: "assets", recordId: id, action: "UPDATE", changedById: req.auth?.userId ?? null, oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>, ipAddress: req.ip ?? null });
  res.json(updated);
});

// DELETE /api/assets/:id  (soft delete)
router.delete("/assets/:id", requireAuth, requireRole("manager"), async (req, res) => {
  const id = String(req.params.id);
  const [before] = await db.select().from(assetsTable).where(eq(assetsTable.id, id)).limit(1);
  const [updated] = await db
    .update(assetsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(assetsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Asset not found" }); return; }
  await auditLog({ tableName: "assets", recordId: id, action: "DELETE", changedById: req.auth?.userId ?? null, oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>, ipAddress: req.ip ?? null });
  res.json({ ok: true });
});

export default router;
