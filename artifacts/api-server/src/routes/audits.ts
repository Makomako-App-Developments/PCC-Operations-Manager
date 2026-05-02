import { Router } from "express";
import { db, auditsTable, auditItemsTable, insertAuditSchema, insertAuditItemSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { auditLog } from "../lib/audit";

const auditCreateSchema = insertAuditSchema.omit({ auditorId: true });

const router = Router();

// GET /api/audits
router.get("/audits", requireAuth, async (_req, res) => {
  const rows = await db.select().from(auditsTable).limit(100);
  res.json({ data: rows });
});

// GET /api/audits/:id
router.get("/audits/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [audit] = await db.select().from(auditsTable).where(eq(auditsTable.id, id)).limit(1);
  if (!audit) { res.status(404).json({ error: "Audit not found" }); return; }
  const items = await db.select().from(auditItemsTable).where(eq(auditItemsTable.auditId, audit.id));
  res.json({ ...audit, items });
});

// POST /api/audits
router.post(
  "/audits",
  requireAuth,
  requireRole("manager", "supervisor", "team_leader"),
  validateBody(auditCreateSchema),
  async (req, res) => {
    const [created] = await db
      .insert(auditsTable)
      .values({ ...req.body, auditorId: req.auth!.userId })
      .returning();
    await auditLog({ tableName: "audits", recordId: created.id, action: "INSERT", changedById: req.auth?.userId ?? null, newData: created as Record<string, unknown>, ipAddress: req.ip ?? null });
    res.status(201).json(created);
  },
);

// PATCH /api/audits/:id
router.patch(
  "/audits/:id",
  requireAuth,
  requireRole("manager", "supervisor", "team_leader"),
  async (req, res) => {
    const id = String(req.params.id);
    const [before] = await db.select().from(auditsTable).where(eq(auditsTable.id, id)).limit(1);
    if (!before) { res.status(404).json({ error: "Audit not found" }); return; }
    const [updated] = await db
      .update(auditsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(auditsTable.id, id))
      .returning();
    await auditLog({ tableName: "audits", recordId: id, action: "UPDATE", changedById: req.auth?.userId ?? null, oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>, ipAddress: req.ip ?? null });
    res.json(updated);
  },
);

// POST /api/audits/:id/items
router.post("/audits/:id/items", requireAuth, validateBody(insertAuditItemSchema), async (req, res) => {
  const id = String(req.params.id);
  const [created] = await db
    .insert(auditItemsTable)
    .values({ ...req.body, auditId: id })
    .returning();
  res.status(201).json(created);
});

export default router;
