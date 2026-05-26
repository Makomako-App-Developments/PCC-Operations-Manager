import { Router } from "express";
import { db, assetsTable, insertAssetSchema, auditLogTable, usersTable } from "@workspace/db";
import { and, eq, ilike, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { auditLog } from "../lib/audit";

const ASSET_FIELD_LABELS: Record<string, string> = {
  name:            "Site Name",
  gardenType:      "Specification",
  standard:        "Standard",
  areaM2:          "Area (m²)",
  serviceTimeMins: "Service Time (mins)",
  frequency:       "Frequency",
  teamId:          "Team",
  siteType:        "Site Type",
  ward:            "Ward",
  suburb:          "Suburb",
  streetAddress:   "Street Address",
  description:     "Description",
  notes:           "Notes",
  isActive:        "Active",
};

function diffAsset(oldD: Record<string, any>, newD: Record<string, any>) {
  const changes: Array<{ field: string; label: string; old: any; new: any }> = [];
  for (const [field, label] of Object.entries(ASSET_FIELD_LABELS)) {
    if (String(oldD[field] ?? "") !== String(newD[field] ?? "")) {
      changes.push({ field, label, old: oldD[field] ?? null, new: newD[field] ?? null });
    }
  }
  return changes;
}

const router = Router();

const listQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(2000).default(50),
  search:     z.string().optional(),
  gardenType: z.string().optional(),
  teamId:     z.string().uuid().optional(),
  ward:       z.string().optional(),
  isActive:   z.coerce.boolean().default(true),
});

type ListQuery = z.infer<typeof listQuerySchema>;

// GET /api/assets
router.get("/assets", requireAuth, validateQuery(listQuerySchema), async (req, res) => {
  const { page, limit, isActive, gardenType, teamId, ward, search } = res.locals.query as ListQuery;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(assetsTable.isActive, isActive),
    ...(gardenType ? [eq(assetsTable.gardenType, gardenType as any)] : []),
    ...(teamId ? [eq(assetsTable.teamId, teamId)] : []),
    ...(ward ? [eq(assetsTable.ward, ward)] : []),
    ...(search ? [ilike(assetsTable.name, `%${search}%`)] : []),
  ];
  const where = and(...conditions);

  const rows = await db
    .select()
    .from(assetsTable)
    .where(where)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(assetsTable)
    .where(where);

  res.json({ data: rows, total: Number(count), page, limit });
});

// GET /api/assets/by-team-route?teamId=xxx
// Must be registered BEFORE /assets/:id to avoid Express matching "by-team-route" as an id.
router.get("/assets/by-team-route", requireAuth, async (req, res) => {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId) { res.status(400).json({ error: "teamId required" }); return; }

  const rows = await db
    .select({
      id:         assetsTable.id,
      name:       assetsTable.name,
      suburb:     assetsTable.suburb,
      gardenType: assetsTable.gardenType,
      routeOrder: assetsTable.routeOrder,
      lat:        assetsTable.lat,
      lng:        assetsTable.lng,
    })
    .from(assetsTable)
    .where(and(eq(assetsTable.teamId, teamId), eq(assetsTable.isActive, true)))
    .orderBy(sql`${assetsTable.routeOrder} NULLS LAST`, assetsTable.name);

  res.json(rows);
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

// GET /api/assets/:id/history
router.get("/assets/:id/history", requireAuth, async (req, res) => {
  const id = String(req.params.id);

  const entries = await db
    .select({
      id:            auditLogTable.id,
      action:        auditLogTable.action,
      changedAt:     auditLogTable.changedAt,
      oldData:       auditLogTable.oldData,
      newData:       auditLogTable.newData,
      changedByName: usersTable.name,
    })
    .from(auditLogTable)
    .leftJoin(usersTable, eq(auditLogTable.changedById, usersTable.id))
    .where(and(
      eq(auditLogTable.tableName, "assets"),
      eq(auditLogTable.recordId,  id),
    ))
    .orderBy(desc(auditLogTable.changedAt))
    .limit(100);

  const result = entries.map(entry => ({
    id:            entry.id,
    action:        entry.action,
    changedAt:     entry.changedAt,
    changedByName: entry.changedByName ?? "System",
    changes: entry.action === "UPDATE"
      ? diffAsset(
          entry.oldData as Record<string, any> ?? {},
          entry.newData as Record<string, any> ?? {},
        )
      : [],
  }));

  res.json(result);
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
