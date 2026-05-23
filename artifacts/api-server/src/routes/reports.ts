import { Router } from "express";
import { db, auditLogTable, usersTable, assetsTable } from "@workspace/db";
import { and, eq, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateQuery } from "../middlewares/validate";

const router = Router();

const FIELD_LABELS: Record<string, string> = {
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
  notes:           "Notes",
  isActive:        "Active",
};

function computeDiff(oldData: Record<string, any> | null, newData: Record<string, any> | null) {
  if (!oldData || !newData) return [];
  const changes: Array<{ field: string; label: string; old: any; new: any }> = [];
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    if (String(oldData[field] ?? "") !== String(newData[field] ?? "")) {
      changes.push({ field, label, old: oldData[field] ?? null, new: newData[field] ?? null });
    }
  }
  return changes;
}

const querySchema = z.object({
  from:   z.string().optional(),
  to:     z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/reports/asset-changes  (manager/supervisor only)
router.get(
  "/reports/asset-changes",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateQuery(querySchema),
  async (_req, res) => {
    const { from, to, limit, offset } = res.locals.query as z.infer<typeof querySchema>;

    const conditions = [eq(auditLogTable.tableName, "assets")];
    if (from) conditions.push(gte(auditLogTable.changedAt, new Date(from)));
    if (to)   conditions.push(lte(auditLogTable.changedAt, new Date(to)));
    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogTable)
      .where(where);

    const rows = await db
      .select({
        id:            auditLogTable.id,
        recordId:      auditLogTable.recordId,
        action:        auditLogTable.action,
        changedAt:     auditLogTable.changedAt,
        oldData:       auditLogTable.oldData,
        newData:       auditLogTable.newData,
        changedByName: usersTable.name,
      })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.changedById, usersTable.id))
      .where(where)
      .orderBy(desc(auditLogTable.changedAt))
      .limit(limit)
      .offset(offset);

    const assetIds = [...new Set(rows.map(r => r.recordId).filter(Boolean))] as string[];
    const assets = assetIds.length > 0
      ? await db
          .select({ id: assetsTable.id, name: assetsTable.name, reference: assetsTable.reference })
          .from(assetsTable)
          .where(inArray(assetsTable.id, assetIds))
      : [];
    const assetMap = new Map(assets.map(a => [a.id, a]));

    const data = rows.map(row => {
      const info = row.recordId ? assetMap.get(row.recordId) : null;
      const oldD = row.oldData as Record<string, any> | null;
      const newD = row.newData as Record<string, any> | null;
      return {
        id:             row.id,
        assetId:        row.recordId,
        assetName:      info?.name     ?? (newD?.name)      ?? "Unknown",
        assetReference: info?.reference ?? (newD?.reference) ?? "—",
        action:         row.action,
        changedAt:      row.changedAt,
        changedByName:  row.changedByName ?? "System",
        changes:        row.action === "UPDATE" ? computeDiff(oldD, newD) : [],
      };
    });

    res.json({ data, total: Number(count) });
  },
);

export default router;
