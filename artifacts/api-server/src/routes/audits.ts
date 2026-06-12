import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { db, auditsTable, auditItemsTable, auditPhotosTable, teamsTable, assetsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { auditLog } from "../lib/audit";
import { objectStorageClient } from "../lib/objectStorage";
import { linkQuotaItemIfMatches } from "./audit-quota";

function isPrivilegedRole(role: string): boolean {
  return ["administrator", "manager", "supervisor"].includes(role);
}

async function assertAuditTeamAccess(auditId: string, role: string, callerTeamId: string | null, callerId?: string): Promise<{ audit: { id: string; teamId: string | null } } | { error: string; status: number }> {
  const [audit] = await db.select({ id: auditsTable.id, teamId: auditsTable.teamId, auditorId: auditsTable.auditorId }).from(auditsTable).where(eq(auditsTable.id, auditId)).limit(1);
  if (!audit) return { error: "Audit not found", status: 404 };
  if (role === "manager") {
    if (audit.auditorId !== callerId) return { error: "Forbidden", status: 403 };
  } else if (!isPrivilegedRole(role)) {
    // worker / team_leader have no audit access
    return { error: "Forbidden", status: 403 };
  }
  return { audit };
}

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

async function uploadPhotoToGCS(buffer: Buffer, mimetype: string, originalname: string): Promise<string> {
  const bucketId = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
  if (!bucketId) throw new Error("Object storage not configured");
  const ext = path.extname(originalname) || ".jpg";
  const objectName = `uploads/${randomUUID()}${ext}`;
  const bucket = objectStorageClient.bucket(bucketId);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: mimetype, resumable: false });
  return `/api/uploads/${objectName}`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function buildAuditDetail(auditId: string) {
  const [audit] = await db.select().from(auditsTable).where(eq(auditsTable.id, auditId)).limit(1);
  if (!audit) return null;
  const items = await db
    .select()
    .from(auditItemsTable)
    .where(eq(auditItemsTable.auditId, auditId));
  const photos = items.length
    ? await db
        .select()
        .from(auditPhotosTable)
        .where(
          eq(auditPhotosTable.auditItemId, items[0].id), // workaround — fetch all below
        )
    : [];
  // fetch all photos for all items
  const allPhotos = items.length
    ? await db
        .select()
        .from(auditPhotosTable)
        .where(
          // Use IN logic manually
          eq(auditPhotosTable.auditItemId, items[0].id),
        )
    : [];
  // Actually, fetch photos per item via a join approach
  const photosByItem = new Map<string, typeof allPhotos>();
  if (items.length) {
    const allP = await Promise.all(
      items.map((item) =>
        db.select().from(auditPhotosTable).where(eq(auditPhotosTable.auditItemId, item.id)),
      ),
    );
    items.forEach((item, i) => photosByItem.set(item.id, allP[i] ?? []));
  }
  return {
    ...audit,
    items: items.map((item) => ({
      ...item,
      photos: photosByItem.get(item.id) ?? [],
    })),
  };
}

function calcScore(items: { result: string }[]) {
  const scored = items.filter((i) => i.result === "pass" || i.result === "fail");
  if (!scored.length) return null;
  const passes = scored.filter((i) => i.result === "pass").length;
  return Math.round((passes / scored.length) * 100);
}

// ── GET /api/audits/stats ─────────────────────────────────────────────────────
router.get("/audits/stats", requireAuth, requireRole("manager", "supervisor"), async (_req, res) => {
  // Team average scores
  const teamScores = await db
    .select({
      teamId:     auditsTable.teamId,
      teamName:   teamsTable.name,
      avgScore:   sql<number>`round(avg(${auditsTable.overallScore})::numeric, 1)`,
      auditCount: sql<number>`cast(count(*) as int)`,
    })
    .from(auditsTable)
    .innerJoin(teamsTable, eq(auditsTable.teamId, teamsTable.id))
    .where(sql`${auditsTable.overallScore} is not null`)
    .groupBy(auditsTable.teamId, teamsTable.name);

  // Fail counts per criterion
  const criterionFails = await db
    .select({
      criterion: auditItemsTable.criterion,
      failCount: sql<number>`cast(count(*) as int)`,
    })
    .from(auditItemsTable)
    .where(eq(auditItemsTable.result, "fail"))
    .groupBy(auditItemsTable.criterion)
    .orderBy(desc(sql`count(*)`));

  // Fail counts per specification (gardenType)
  const specificationFails = await db
    .select({
      specification: assetsTable.gardenType,
      failCount:     sql<number>`cast(count(*) as int)`,
    })
    .from(auditItemsTable)
    .innerJoin(auditsTable, eq(auditItemsTable.auditId, auditsTable.id))
    .innerJoin(assetsTable, eq(auditsTable.assetId, assetsTable.id))
    .where(eq(auditItemsTable.result, "fail"))
    .groupBy(assetsTable.gardenType)
    .orderBy(desc(sql`count(*)`));

  res.json({ teamScores, criterionFails, specificationFails });
});

// ── GET /api/audits ───────────────────────────────────────────────────────────
router.get("/audits", requireAuth, async (req, res) => {
  const conditions = [];

  const role = req.auth!.role;
  if (role === "manager") {
    // Managers see only audits they created
    conditions.push(eq(auditsTable.auditorId, req.auth!.userId));
  } else if (!isPrivilegedRole(role)) {
    // worker / team_leader have no audit access
    res.status(403).json({ error: "Forbidden" }); return;
  }
  // administrator / supervisor: no filter — see everything

  const rows = await db
    .select({
      id:           auditsTable.id,
      assetId:          auditsTable.assetId,
      assetName:        assetsTable.name,
      assetDescription: assetsTable.description,
      teamId:           auditsTable.teamId,
      auditorId:    auditsTable.auditorId,
      auditorName:  usersTable.name,
      conductedAt:  auditsTable.conductedAt,
      overallScore: auditsTable.overallScore,
      status:       auditsTable.status,
      auditType:    auditsTable.auditType,
      notes:        auditsTable.notes,
      createdAt:    auditsTable.createdAt,
      updatedAt:    auditsTable.updatedAt,
    })
    .from(auditsTable)
    .leftJoin(assetsTable, eq(auditsTable.assetId, assetsTable.id))
    .leftJoin(usersTable, eq(auditsTable.auditorId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditsTable.conductedAt))
    .limit(500);
  res.json({ data: rows });
});

// ── GET /api/audits/:id ───────────────────────────────────────────────────────
router.get("/audits/:id", requireAuth, async (req, res) => {
  const auditId = String(req.params.id);
  const access = await assertAuditTeamAccess(auditId, req.auth!.role, req.auth!.teamId, req.auth!.userId);
  if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }
  const detail = await buildAuditDetail(auditId);
  if (!detail) { res.status(404).json({ error: "Audit not found" }); return; }
  res.json(detail);
});

// ── POST /api/audits ──────────────────────────────────────────────────────────
router.post("/audits", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  const { assetId, teamId, conductedAt, notes, auditType } = req.body as Record<string, string>;
  if (!assetId) { res.status(400).json({ error: "assetId required" }); return; }
  const [created] = await db
    .insert(auditsTable)
    .values({
      assetId,
      auditorId: req.auth!.userId,
      teamId: teamId ?? null,
      conductedAt: conductedAt ? new Date(conductedAt) : new Date(),
      status: "pending",
      notes: notes ?? null,
      auditType: (auditType as any) ?? null,
    })
    .returning();
  await auditLog({ tableName: "audits", recordId: created.id, action: "INSERT", changedById: req.auth?.userId ?? null, newData: created as Record<string, unknown>, ipAddress: req.ip ?? null });
  res.status(201).json(created);
});

// ── PATCH /api/audits/:id ─────────────────────────────────────────────────────
router.patch("/audits/:id", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  const id = String(req.params.id);
  const [before] = await db.select().from(auditsTable).where(eq(auditsTable.id, id)).limit(1);
  if (!before) { res.status(404).json({ error: "Audit not found" }); return; }
  const { teamId, conductedAt, overallScore, status, notes, auditType } = req.body as Record<string, any>;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (teamId !== undefined) updateData.teamId = teamId;
  if (conductedAt !== undefined) updateData.conductedAt = new Date(conductedAt);
  if (overallScore !== undefined) updateData.overallScore = String(overallScore);
  if (status !== undefined) updateData.status = status;
  if (notes !== undefined) updateData.notes = notes;
  if (auditType !== undefined) updateData.auditType = auditType;
  const [updated] = await db.update(auditsTable).set(updateData).where(eq(auditsTable.id, id)).returning();
  await auditLog({ tableName: "audits", recordId: id, action: "UPDATE", changedById: req.auth?.userId ?? null, oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>, ipAddress: req.ip ?? null });
  res.json(updated);
});

// ── DELETE /api/audits/:id ────────────────────────────────────────────────────
router.delete("/audits/:id", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  const id = String(req.params.id);
  await db.delete(auditItemsTable).where(eq(auditItemsTable.auditId, id)); // cascade
  await db.delete(auditsTable).where(eq(auditsTable.id, id));
  res.status(204).end();
});

// ── PUT /api/audits/:id/responses (bulk upsert) ───────────────────────────────
router.put("/audits/:id/responses", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  const auditId = String(req.params.id);
  const [audit] = await db.select().from(auditsTable).where(eq(auditsTable.id, auditId)).limit(1);
  if (!audit) { res.status(404).json({ error: "Audit not found" }); return; }

  const { responses } = req.body as { responses: Array<{ criterion: string; result: string; notes?: string; failLat?: number; failLng?: number; pestPlantsPresent?: string[] }> };
  if (!Array.isArray(responses)) { res.status(400).json({ error: "responses array required" }); return; }

  // Upsert each response
  for (const r of responses) {
    const existing = await db
      .select()
      .from(auditItemsTable)
      .where(and(eq(auditItemsTable.auditId, auditId), eq(auditItemsTable.criterion, r.criterion)))
      .limit(1);

    const itemData = {
      result: r.result as "pass" | "fail" | "na",
      notes: r.notes ?? null,
      failLat: r.failLat != null ? String(r.failLat) : null,
      failLng: r.failLng != null ? String(r.failLng) : null,
      pestPlantsPresent: r.pestPlantsPresent?.length ? JSON.stringify(r.pestPlantsPresent) : null,
      updatedAt: new Date(),
    };

    if (existing.length) {
      await db.update(auditItemsTable).set(itemData).where(eq(auditItemsTable.id, existing[0].id));
    } else {
      await db.insert(auditItemsTable).values({ auditId, criterion: r.criterion, ...itemData });
    }
  }

  // Recalculate score
  const allItems = await db.select().from(auditItemsTable).where(eq(auditItemsTable.auditId, auditId));
  const score = calcScore(allItems);
  const newStatus = score === null ? "pending" : score >= 80 ? "passed" : "failed";
  await db.update(auditsTable).set({ overallScore: score !== null ? String(score) : null, status: newStatus, updatedAt: new Date() }).where(eq(auditsTable.id, auditId));

  const detail = await buildAuditDetail(auditId);

  // Link to weekly quota once the audit is fully scored (passed or failed)
  // Uses auditorId from the audit record — not the caller — so it correctly
  // attributes the completion to the supervisor who created the audit.
  const [freshAudit] = await db.select({ assetId: auditsTable.assetId, auditorId: auditsTable.auditorId, status: auditsTable.status })
    .from(auditsTable).where(eq(auditsTable.id, auditId)).limit(1);
  if (freshAudit && (freshAudit.status === "passed" || freshAudit.status === "failed")) {
    linkQuotaItemIfMatches(freshAudit.assetId, freshAudit.auditorId, auditId).catch((err: unknown) => {
      console.error("[quota-link] Failed to link quota item for audit", auditId, err);
    });
  }

  res.json(detail);
});

// ── GET /api/audits/:id/items/:itemId/photos ──────────────────────────────────
router.get("/audits/:id/items/:itemId/photos", requireAuth, async (req, res) => {
  const auditId = String(req.params.id);
  const itemId  = String(req.params.itemId);

  const access = await assertAuditTeamAccess(auditId, req.auth!.role, req.auth!.teamId, req.auth!.userId);
  if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

  // Verify the item belongs to the referenced audit (prevents cross-audit ID enumeration)
  const [item] = await db.select({ id: auditItemsTable.id })
    .from(auditItemsTable)
    .where(and(eq(auditItemsTable.id, itemId), eq(auditItemsTable.auditId, auditId)))
    .limit(1);
  if (!item) { res.status(404).json({ error: "Audit item not found" }); return; }

  const photos = await db.select().from(auditPhotosTable).where(eq(auditPhotosTable.auditItemId, itemId));
  res.json({ data: photos });
});

// ── POST /api/audits/:id/items/:itemId/photos ─────────────────────────────────
router.post(
  "/audits/:id/items/:itemId/photos",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    const itemId = String(req.params.itemId);
    const auditId = String(req.params.id);
    if (!req.file) { res.status(400).json({ error: "No photo uploaded" }); return; }
    const userId = req.auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorised" }); return; }

    // Authorization: verify the caller can act on this audit
    const access = await assertAuditTeamAccess(auditId, req.auth!.role, req.auth!.teamId, req.auth!.userId);
    if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

    // Ensure the audit item exists
    const existing = await db.select().from(auditItemsTable).where(and(eq(auditItemsTable.id, itemId), eq(auditItemsTable.auditId, auditId))).limit(1);
    if (!existing.length) { res.status(404).json({ error: "Audit item not found" }); return; }

    const blobUrl = await uploadPhotoToGCS(req.file.buffer, req.file.mimetype, req.file.originalname);
    const [photo] = await db.insert(auditPhotosTable).values({ auditItemId: itemId, uploadedBy: userId, blobUrl }).returning();
    res.status(201).json(photo);
  },
);

// ── DELETE /api/audits/:id/items/:itemId/photos/:photoId ─────────────────────
router.delete("/audits/:id/items/:itemId/photos/:photoId", requireAuth, async (req, res) => {
  const auditId = String(req.params.id);
  const itemId  = String(req.params.itemId);
  const photoId = String(req.params.photoId);

  // Authorization: verify the caller can act on this audit
  const access = await assertAuditTeamAccess(auditId, req.auth!.role, req.auth!.teamId, req.auth!.userId);
  if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

  // Verify item belongs to this audit before operating on its photos
  const [item] = await db.select({ id: auditItemsTable.id })
    .from(auditItemsTable)
    .where(and(eq(auditItemsTable.id, itemId), eq(auditItemsTable.auditId, auditId)))
    .limit(1);
  if (!item) { res.status(404).json({ error: "Audit item not found" }); return; }

  // Delete only if the photo actually belongs to this item (prevents cross-hierarchy tampering)
  await db.delete(auditPhotosTable).where(
    and(eq(auditPhotosTable.id, photoId), eq(auditPhotosTable.auditItemId, itemId)),
  );
  res.status(204).end();
});

// ── GET /api/audits/:id/pdf ───────────────────────────────────────────────────
router.get("/audits/:id/pdf", requireAuth, async (req, res) => {
  const auditId = String(req.params.id);

  // Authorization: enforce the same team-access rules as GET /api/audits/:id
  const access = await assertAuditTeamAccess(auditId, req.auth!.role, req.auth!.teamId, req.auth!.userId);
  if ("error" in access) { res.status(access.status).json({ error: access.error }); return; }

  const detail = await buildAuditDetail(auditId);
  if (!detail) { res.status(404).json({ error: "Audit not found" }); return; }

  // Dynamic import of PDFKit
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="audit-${detail.id}.pdf"`);
  doc.pipe(res);

  // Header
  const auditLabel = (detail as any).auditType === "completed-works" ? "Completed Works Audit"
    : (detail as any).auditType === "outcomes" ? "Outcomes Based Audit"
    : "Garden Audit";
  doc.fontSize(20).font("Helvetica-Bold").text(auditLabel, 50, 50);
  doc.fontSize(10).font("Helvetica").fillColor("#666").text("Porirua City Council", 50, 75);

  // Score
  const score = detail.overallScore != null ? `${detail.overallScore}%` : "—";
  doc.fontSize(36).font("Helvetica-Bold").fillColor(Number(detail.overallScore) >= 80 ? "#16a34a" : "#dc2626")
    .text(score, 400, 50, { width: 150, align: "right" });
  doc.fontSize(9).font("Helvetica").fillColor("#666").text("AUDIT SCORE", 400, 90, { width: 150, align: "right" });

  doc.moveTo(50, 115).lineTo(545, 115).strokeColor("#e5e7eb").stroke();

  // Meta
  doc.y = 125; doc.x = 50;
  const conducted = new Date(detail.conductedAt);
  const dateStr = conducted.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#999").text("DATE", 50, 130);
  doc.fontSize(11).font("Helvetica").fillColor("#111").text(dateStr, 50, 143);
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#999").text("STATUS", 200, 130);
  doc.fontSize(11).font("Helvetica").fillColor("#111").text(String(detail.status).toUpperCase(), 200, 143);

  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.5);

  // KPI results
  const SECTIONS: Record<string, string[]> = {
    "Garden Condition": ["litter", "weeds", "plant_pests", "mulch", "pruning", "dead_heading", "pests_diseases"],
    "Edges & Borders": ["edging"],
    "Plant Support & Protection": ["stakes_ties", "damage"],
  };
  const KPI_LABELS: Record<string, string> = {
    litter: "Litter", weeds: "Weeds", plant_pests: "Pest Plants", mulch: "Mulch",
    pruning: "Pruning", dead_heading: "Dead Heading", pests_diseases: "Pests & Diseases",
    edging: "Edging", stakes_ties: "Stakes & Ties", damage: "Damage",
  };

  for (const [section, kpis] of Object.entries(SECTIONS)) {
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#00AECD").text(section, 50, doc.y + 10);
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").stroke();
    doc.moveDown(0.3);

    for (const kpi of kpis) {
      const item = detail.items.find((i) => i.criterion === kpi);
      const resultText = item ? item.result.toUpperCase() : "—";
      const resultColor = item?.result === "pass" ? "#16a34a" : item?.result === "fail" ? "#dc2626" : "#6b7280";
      const yPos = doc.y;
      doc.fontSize(10).font("Helvetica").fillColor("#111").text(KPI_LABELS[kpi] ?? kpi, 50, yPos);
      doc.fontSize(10).font("Helvetica-Bold").fillColor(resultColor).text(resultText, 400, yPos, { width: 145, align: "right" });
      if (item?.notes) {
        doc.moveDown(0.2);
        doc.fontSize(8).font("Helvetica").fillColor("#666").text(item.notes, 65, doc.y, { width: 460 });
      }
      doc.moveDown(0.6);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#f3f4f6").stroke();
      doc.moveDown(0.2);
    }
    doc.moveDown(0.5);
  }

  // Footer
  doc.fontSize(8).font("Helvetica").fillColor("#999")
    .text(`Generated on ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}`, 50, doc.page.height - 60, { align: "center", width: 495 });

  doc.end();
});

export default router;
