import { Router } from "express";
import { db, assetsTable, insertAssetSchema, auditLogTable, usersTable, executeWithCircuitBreaker } from "@workspace/db";
import { and, eq, ilike, or, sql, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { auditLog } from "../lib/audit";
import { DEPARTMENT_RULES, DEPARTMENT_VALUES, STORMWATER_OPTIONS, isSchedulableDepartment } from "@workspace/asset-definitions";
import { reconcilePendingScheduledJobDurations } from "../lib/crew-utils";

const ASSET_FIELD_LABELS: Record<string, string> = {
  name:            "Site Name",
  department:      "Department / Function",
  gardenType:      "Specification",
  standard:        "Standard",
  areaM2:          "Area (m²)",
  serviceTimeMins: "Service Time (mins)",
  frequency:       "Frequency",
  isSchedulable:   "Recurring schedule",
  globalId:        "Global ID",
  teamId:          "Team",
  siteType:        "Site Type",
  ward:            "Ward",
  suburb:          "Suburb",
  streetAddress:   "Street Address",
  description:     "Description",
  notes:           "Notes",
  knownHazards:    "Known Hazards",
  departmentDetails: "Department-specific details",
  isActive:        "Active",
};

function diffAsset(oldD: Record<string, any>, newD: Record<string, any>) {
  const changes: Array<{ field: string; label: string; old: any; new: any }> = [];
  for (const [field, label] of Object.entries(ASSET_FIELD_LABELS)) {
    if (field === "departmentDetails") {
      const keys = new Set([...Object.keys(oldD.departmentDetails ?? {}), ...Object.keys(newD.departmentDetails ?? {})]);
      const detailLabels: Record<string, string> = { placemarkId: "Placemark ID", contractor: "Contractor", assetType: "Asset Type", priority: "Priority", hotspot: "Hotspot" };
      for (const key of keys) {
        if ((oldD.departmentDetails?.[key] ?? null) !== (newD.departmentDetails?.[key] ?? null)) {
          changes.push({ field: `departmentDetails.${key}`, label: detailLabels[key] ?? key, old: oldD.departmentDetails?.[key] ?? null, new: newD.departmentDetails?.[key] ?? null });
        }
      }
      continue;
    }
    if (JSON.stringify(oldD[field] ?? null) !== JSON.stringify(newD[field] ?? null)) {
      changes.push({ field, label, old: oldD[field] ?? null, new: newD[field] ?? null });
    }
  }
  return changes;
}

const router = Router();

const departmentSchema = z.enum(DEPARTMENT_VALUES);
const gardenTypeSchema = z.enum(["annuals", "roses_perennials", "ornamental", "amenity", "rain_garden", "reveg", "bush", "tree_planter_pits", "hedge"]);
const standardSchema = z.enum(["high", "medium", "low"]);
const departmentDetailsSchema = z.record(z.string(), z.union([z.string(), z.number()])).nullable().optional();

function validateDepartmentFields(data: {
  department?: string;
  gardenType?: string | null;
  standard?: string | null;
  areaM2?: string | null;
  departmentDetails?: Record<string, string | number> | null;
  serviceTimeMins?: number | null;
  frequency?: string | null;
}, ctx: z.RefinementCtx) {
  const department = data.department ?? "horticulture";
  const rule = DEPARTMENT_RULES[department as keyof typeof DEPARTMENT_RULES];
  if (!rule) return;

  if (department === "horticulture") {
    if (!data.gardenType) ctx.addIssue({ code: "custom", path: ["gardenType"], message: "Garden type is required for Horticulture assets" });
    if (!data.standard) ctx.addIssue({ code: "custom", path: ["standard"], message: "Standard is required for Horticulture assets" });
  } else if (rule.specificationRequired && !data.departmentDetails?.[rule.specificationKey]) {
    ctx.addIssue({ code: "custom", path: ["departmentDetails", rule.specificationKey], message: `${rule.specificationLabel} is required` });
  }

  if (rule.areaRequired && (!data.areaM2 || Number(data.areaM2) <= 0)) {
    ctx.addIssue({ code: "custom", path: ["areaM2"], message: `${rule.areaLabel} must be greater than 0` });
  }
  if (rule.schedulable) {
    if (!data.serviceTimeMins || data.serviceTimeMins <= 0) ctx.addIssue({ code: "custom", path: ["serviceTimeMins"], message: "Service time must be greater than 0" });
    if (!data.frequency) ctx.addIssue({ code: "custom", path: ["frequency"], message: "Frequency is required" });
  }
  if (department === "stormwater") {
    const details = data.departmentDetails ?? {};
    const allowed = (values: readonly string[], key: string, label: string) => {
      const value = details[key];
      if (!value || !values.includes(String(value))) ctx.addIssue({ code: "custom", path: ["departmentDetails", key], message: `${label} is required` });
    };
    allowed(["inlet", "outlet", "culvert"], "assetType", "Asset type");
    allowed(STORMWATER_OPTIONS.contractors, "contractor", "Contractor");
    allowed(STORMWATER_OPTIONS.priorities, "priority", "Priority");
    allowed(STORMWATER_OPTIONS.hotspots, "hotspot", "Hotspot");
  }
}

const assetCreateSchema = insertAssetSchema
  .omit({ gardenType: true, standard: true, areaM2: true, departmentDetails: true })
  .extend({
    department: departmentSchema,
    gardenType: gardenTypeSchema.nullable().optional(),
    standard: standardSchema.nullable().optional(),
    areaM2: z.string().nullable().optional(),
    departmentDetails: departmentDetailsSchema,
  })
  .superRefine((data, ctx) => validateDepartmentFields(data, ctx));

const assetUpdateSchema = assetCreateSchema.partial();

const listQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(2000).default(50),
  search:     z.string().optional(),
  gardenType: z.string().optional(),
  department: departmentSchema.optional(),
  teamId:     z.string().uuid().optional(),
  ward:       z.string().optional(),
  isActive:   z.coerce.boolean().default(true),
});

type ListQuery = z.infer<typeof listQuerySchema>;

// GET /api/assets
router.get("/assets", requireAuth, validateQuery(listQuerySchema), async (req, res) => {
  const { page, limit, isActive, gardenType, department, teamId, ward, search } = res.locals.query as ListQuery;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(assetsTable.isActive, isActive),
    ...(gardenType ? [eq(assetsTable.gardenType, gardenType as any)] : []),
    ...(department ? [eq(assetsTable.department, department)] : []),
    ...(teamId ? [eq(assetsTable.teamId, teamId)] : []),
    ...(ward ? [eq(assetsTable.ward, ward as any)] : []),
    ...(search ? [or(ilike(assetsTable.name, `%${search}%`), ilike(assetsTable.globalId, `%${search}%`))] : []),
  ];
  const where = and(...conditions);

  const rows = await executeWithCircuitBreaker(() => db
    .select()
    .from(assetsTable)
    .where(where)
    .limit(limit)
    .offset(offset));

  const [{ count }] = await executeWithCircuitBreaker(() => db
    .select({ count: sql<number>`count(*)` })
    .from(assetsTable)
    .where(where));

  res.json({ data: rows, total: Number(count), page, limit });
});

// GET /api/assets/by-team-route?teamId=xxx
// Must be registered BEFORE /assets/:id to avoid Express matching "by-team-route" as an id.
router.get("/assets/by-team-route", requireAuth, async (req, res) => {
  const teamId = req.query.teamId as string | undefined;
  if (!teamId) { res.status(400).json({ error: "teamId required" }); return; }

  const rows = await executeWithCircuitBreaker(() => db
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
    .orderBy(sql`${assetsTable.routeOrder} NULLS LAST`, assetsTable.name));

  res.json(rows);
});

// GET /api/assets/:id
router.get("/assets/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [asset] = await executeWithCircuitBreaker(() => db.select().from(assetsTable).where(eq(assetsTable.id, id)).limit(1));
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json(asset);
});

// Coerce JS numbers to strings for Postgres `numeric` columns before schema validation.
// drizzle-zod maps numeric columns to z.string(); the frontend form sends JS numbers.
function coerceAssetNumerics(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  if (typeof out.areaM2 === "number") out.areaM2 = String(out.areaM2);
  if (typeof out.lat    === "number") out.lat    = String(out.lat);
  if (typeof out.lng    === "number") out.lng    = String(out.lng);
  return out;
}

function normalizeDepartmentFields<T extends {
  department?: string;
  gardenType?: unknown;
  standard?: unknown;
  departmentDetails?: unknown;
}>(data: T): T {
  if (data.department === "horticulture") return { ...data, departmentDetails: null };
  const schedulable = isSchedulableDepartment(data.department);
  return { ...data, gardenType: null, standard: null, isSchedulable: schedulable, ...(schedulable ? {} : { serviceTimeMins: null, frequency: null, areaM2: null }) };
}

function normalizeDepartmentChanges<T extends object>(data: T, department: string): T {
  if (department === "horticulture") return { ...data, departmentDetails: null };
  const schedulable = isSchedulableDepartment(department);
  return { ...data, gardenType: null, standard: null, isSchedulable: schedulable, ...(schedulable ? {} : { serviceTimeMins: null, frequency: null, areaM2: null }) };
}

// POST /api/assets
router.post("/assets", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  try {
    const parsed = assetCreateSchema.safeParse(coerceAssetNumerics(req.body));
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
      return;
    }
    const values = normalizeDepartmentFields(parsed.data);
    const [created] = await executeWithCircuitBreaker(() => db.insert(assetsTable).values(values as any).returning());
    await auditLog({ tableName: "assets", recordId: created.id, action: "INSERT", changedById: req.auth?.userId ?? null, newData: created as Record<string, unknown>, ipAddress: req.ip ?? null });
    res.status(201).json(created);
  } catch (err) {
    console.error("POST /assets error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const routeOrderSchema = z.object({
  updates: z.array(z.object({
    id: z.string().uuid(),
    routeOrder: z.number().int(),
  })).min(1),
});

// PATCH /api/assets/route-order
// Must be registered BEFORE /assets/:id to avoid Express matching "route-order" as an id.
// Body: { updates: [{ id: string, routeOrder: number }] }
router.patch("/assets/route-order", requireAuth, requireRole("manager", "supervisor"), validateBody(routeOrderSchema), async (req, res) => {
  try {
    const { updates } = req.body as z.infer<typeof routeOrderSchema>;

    const ids    = updates.map(u => u.id);
    const orders = updates.map(u => u.routeOrder);

    await executeWithCircuitBreaker(() => db.execute(sql`
      UPDATE assets
      SET route_order = v.ord,
          updated_at  = NOW()
      FROM (
        SELECT unnest(${sql.raw(`ARRAY[${ids.map(id => `'${id}'`).join(",")}]::uuid[]`)}) AS id,
               unnest(${sql.raw(`ARRAY[${orders.join(",")}]::int[]`)})                   AS ord
      ) v
      WHERE assets.id = v.id
    `));

    res.json({ updated: updates.length });
  } catch (err) {
    console.error("PATCH /assets/route-order error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/assets/:id
router.patch("/assets/:id", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  try {
    const id = String(req.params.id);
    const [before] = await executeWithCircuitBreaker(() => db.select().from(assetsTable).where(eq(assetsTable.id, id)).limit(1));
    if (!before) { res.status(404).json({ error: "Asset not found" }); return; }
    const parsed = assetUpdateSchema.safeParse(coerceAssetNumerics(req.body));
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
      return;
    }
    const merged = { ...before, ...parsed.data };
    const departmentValidation = assetCreateSchema.safeParse(merged);
    if (!departmentValidation.success) {
      res.status(400).json({ error: "Validation error", issues: departmentValidation.error.issues });
      return;
    }
    const changes = normalizeDepartmentChanges(parsed.data, String(merged.department));
    const [updated] = await executeWithCircuitBreaker(() => db
      .update(assetsTable)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(assetsTable.id, id))
      .returning());
    if (
      changes.serviceTimeMins !== undefined
      && changes.serviceTimeMins !== before.serviceTimeMins
    ) {
      await reconcilePendingScheduledJobDurations(id);
    }
    await auditLog({ tableName: "assets", recordId: id, action: "UPDATE", changedById: req.auth?.userId ?? null, oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>, ipAddress: req.ip ?? null });
    res.json(updated);
  } catch (err) {
    console.error("PATCH /assets/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/assets/:id/history
router.get("/assets/:id/history", requireAuth, async (req, res) => {
  const id = String(req.params.id);

  const entries = await executeWithCircuitBreaker(() => db
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
    .limit(100));

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
  try {
    const id = String(req.params.id);
    const [before] = await executeWithCircuitBreaker(() => db.select().from(assetsTable).where(eq(assetsTable.id, id)).limit(1));
    const [updated] = await executeWithCircuitBreaker(() => db
      .update(assetsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(assetsTable.id, id))
      .returning());
    if (!updated) { res.status(404).json({ error: "Asset not found" }); return; }
    await auditLog({ tableName: "assets", recordId: id, action: "DELETE", changedById: req.auth?.userId ?? null, oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>, ipAddress: req.ip ?? null });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /assets/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
