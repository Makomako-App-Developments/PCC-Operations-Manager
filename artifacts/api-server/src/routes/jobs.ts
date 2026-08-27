import { Router } from "express";
import path from "path";
import { db, executeWithCircuitBreaker, jobsTable, reactiveJobsTable, insertJobSchema, insertReactiveJobSchema, assetsTable, teamsTable, usersTable, jobTeamCompletionsTable, jobTaskSkipReasonsTable, mulchingRecordsTable, jobPhotosTable, auditLogTable } from "@workspace/db";
import { eq, and, inArray, notInArray, or, gte, lte, ilike, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { z as zV4 } from "zod/v4";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { auditLog } from "../lib/audit";
import { notifyTeam, notifyUsers } from "../lib/push-notifications";
import { objectStorageClient } from "../lib/objectStorage";
import { checkDayCapacity, computeTotalScheduledMins } from "../lib/day-capacity";

const LOGO_PATH = path.resolve(
  process.cwd(),
  process.env.NODE_ENV === "production"
    ? "artifacts/api-server/src/assets/porirua-city-logo.png"
    : "src/assets/porirua-city-logo.png"
);

const router = Router();

function isPrivilegedRole(role: string): boolean {
  return ["administrator", "manager", "supervisor"].includes(role);
}

const jobQuerySchema = z.object({
  assetId:  z.string().uuid().optional(),
  teamId:   z.string().uuid().optional(),
  status:   z.string().optional(),
  from:     z.string().optional(),
  to:       z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(5000).default(50),
});

type JobQuery = z.infer<typeof jobQuerySchema>;

// GET /api/jobs/skips — dedicated skipped-jobs review list (managers/admins only)
// Must be declared BEFORE /jobs/:id to avoid route shadowing.
const skipsQuerySchema = z.object({
  teamId: z.string().uuid().optional(),
  from:   z.string().optional(),
  to:     z.string().optional(),
  reviewed: z.enum(["yes", "no", "all"]).default("all"),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(500).default(100),
});

router.get("/jobs/skips", requireAuth, requireRole("administrator", "manager"), validateQuery(skipsQuerySchema), async (req, res) => {
  const { teamId, from, to, reviewed, page, limit } = res.locals.query as z.infer<typeof skipsQuerySchema>;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [eq(jobsTable.status, "skipped") as any];
  if (teamId) conditions.push(or(eq(jobsTable.teamId, teamId), eq(jobsTable.isAllTeams, true)) as any);
  if (from)   conditions.push(gte(jobsTable.scheduledDate, from) as any);
  if (to)     conditions.push(lte(jobsTable.scheduledDate, to) as any);
  if (reviewed === "yes") conditions.push(sql`${jobsTable.skipReviewedAt} IS NOT NULL` as any);
  if (reviewed === "no")  conditions.push(sql`${jobsTable.skipReviewedAt} IS NULL` as any);

  const [countRow, jobs] = await Promise.all([
    executeWithCircuitBreaker(() => db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobsTable)
      .where(and(...conditions))
      .then(rows => rows[0])),
    executeWithCircuitBreaker(() => db
      .select({
        id:                jobsTable.id,
        assetId:           jobsTable.assetId,
        jobType:           jobsTable.jobType,
        status:            jobsTable.status,
        teamId:            jobsTable.teamId,
        isAllTeams:        jobsTable.isAllTeams,
        scheduledDate:     jobsTable.scheduledDate,
        skipReason:        jobsTable.skipReason,
        notes:             jobsTable.notes,
        skipReviewedAt:    jobsTable.skipReviewedAt,
        skipReviewedById:  jobsTable.skipReviewedById,
        skipReviewOutcome: jobsTable.skipReviewOutcome,
        skipReviewNotes:   jobsTable.skipReviewNotes,
        createdAt:         jobsTable.createdAt,
        updatedAt:         jobsTable.updatedAt,
        // reviewer info
        reviewerName:      usersTable.name,
        reviewerInitials:  usersTable.initials,
        // team info
        teamName:          teamsTable.name,
        // asset info
        assetName:         assetsTable.name,
      })
      .from(jobsTable)
      .leftJoin(usersTable, eq(jobsTable.skipReviewedById, usersTable.id))
      .leftJoin(teamsTable, eq(jobsTable.teamId, teamsTable.id))
      .leftJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(and(...conditions))
      // unreviewed first, then most recent
      .orderBy(sql`${jobsTable.skipReviewedAt} IS NOT NULL`, desc(jobsTable.scheduledDate))
      .limit(limit)
      .offset(offset)),
  ]);

  // Fetch per-task skip reasons for all returned jobs
  const jobIds = jobs.map(j => j.id);
  const taskSkipReasons = jobIds.length > 0
    ? await executeWithCircuitBreaker(() => db
        .select()
        .from(jobTaskSkipReasonsTable)
        .where(inArray(jobTaskSkipReasonsTable.jobId, jobIds))
        .orderBy(jobTaskSkipReasonsTable.jobId, jobTaskSkipReasonsTable.taskIndex))
    : [];

  // Group task skip reasons by jobId
  const reasonsByJob = new Map<string, typeof taskSkipReasons>();
  for (const r of taskSkipReasons) {
    if (!reasonsByJob.has(r.jobId)) reasonsByJob.set(r.jobId, []);
    reasonsByJob.get(r.jobId)!.push(r);
  }

  const data = jobs.map(j => ({
    ...j,
    taskSkipReasons: reasonsByJob.get(j.id) ?? [],
  }));

  res.json({ data, page, limit, total: countRow?.count ?? data.length });
});

// GET /api/jobs/drafts — accepted skips awaiting deliberate placement.
// Must be declared before /jobs/:id to avoid route shadowing.
const draftsQuerySchema = z.object({
  teamId: z.string().uuid().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(500).default(100),
});

router.get("/jobs/drafts", requireAuth, requireRole("administrator", "manager"), validateQuery(draftsQuerySchema), async (_req, res) => {
  const { teamId, page, limit } = res.locals.query as z.infer<typeof draftsQuerySchema>;
  const offset = (page - 1) * limit;
  const conditions: ReturnType<typeof eq>[] = [eq(jobsTable.status, "draft") as any];
  if (teamId) conditions.push(or(eq(jobsTable.teamId, teamId), eq(jobsTable.draftOriginalTeamId, teamId)) as any);

  const [countRow, rows] = await Promise.all([
    executeWithCircuitBreaker(() => db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobsTable)
      .where(and(...conditions))
      .then(result => result[0])),
    executeWithCircuitBreaker(() => db
      .select({
        id:                        jobsTable.id,
        assetId:                   jobsTable.assetId,
        jobType:                   jobsTable.jobType,
        status:                    jobsTable.status,
        teamId:                    jobsTable.teamId,
        scheduledDate:             jobsTable.scheduledDate,
        assignedUserId:            jobsTable.assignedUserId,
        estimatedTimeMins:         jobsTable.estimatedTimeMins,
        crewStatus:                jobsTable.crewStatus,
        notes:                     jobsTable.notes,
        skipReason:                jobsTable.skipReason,
        skipReviewedAt:            jobsTable.skipReviewedAt,
        skipReviewedById:          jobsTable.skipReviewedById,
        skipReviewOutcome:         jobsTable.skipReviewOutcome,
        skipReviewNotes:           jobsTable.skipReviewNotes,
        draftOriginalTeamId:       jobsTable.draftOriginalTeamId,
        draftOriginalScheduledDate: jobsTable.draftOriginalScheduledDate,
        assetName:                 assetsTable.name,
        assetDescription:          assetsTable.description,
      })
      .from(jobsTable)
      .innerJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(and(...conditions))
      .orderBy(desc(jobsTable.skipReviewedAt), jobsTable.createdAt)
      .limit(limit)
      .offset(offset)),
  ]);

  res.json({ data: rows, page, limit, total: countRow?.count ?? rows.length });
});

// GET /api/jobs
router.get("/jobs", requireAuth, validateQuery(jobQuerySchema), async (req, res) => {
  const { assetId, status, page, limit } = res.locals.query as JobQuery;
  let { teamId } = res.locals.query as JobQuery;
  const offset = (page - 1) * limit;
  const conditions: any[] = [];

  // Only administrators and managers may list jobs across all teams;
  // supervisors and field workers are restricted to their own team.
  if (!["administrator", "manager"].includes(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!callerTeamId) { res.json({ data: [], page, limit }); return; }
    teamId = callerTeamId;
    // Drafts are an internal manager queue, never worker-visible work.
    conditions.push(notInArray(jobsTable.status, ["draft"]));
  }

  if (assetId) conditions.push(eq(jobsTable.assetId, assetId));
  if (teamId)  conditions.push(or(eq(jobsTable.teamId, teamId), eq(jobsTable.isAllTeams, true)));
  if (status) {
    const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(jobsTable.status, statuses[0] as any));
    } else if (statuses.length > 1) {
      conditions.push(inArray(jobsTable.status, statuses as any[]));
    }
  }

  const rows = await executeWithCircuitBreaker(() => db
    .select()
    .from(jobsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit)
    .offset(offset));
  res.json({ data: rows, page, limit });
});

// GET /api/completed-works  — enriched view joining jobs + assets + teams
const completedWorksQuerySchema = z.object({
  assetId:    z.string().uuid().optional(),
  teamId:     z.string().uuid().optional(),
  ward:       z.string().optional(),
  gardenType: z.string().optional(),
  from:       z.string().optional(),
  to:         z.string().optional(),
  search:     z.string().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(1000).default(100),
});

router.get("/completed-works", requireAuth, validateQuery(completedWorksQuerySchema), async (req, res) => {
  const q = res.locals.query as z.infer<typeof completedWorksQuerySchema>;

  // Non-privileged users may only see their own team's completed work
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!callerTeamId) { res.json({ data: [], page: q.page, limit: q.limit }); return; }
    (q as any).teamId = callerTeamId;
  }

  const conditions: ReturnType<typeof eq>[] = [eq(jobsTable.status, "completed")];
  if (q.assetId)    conditions.push(eq(jobsTable.assetId, q.assetId) as any);
  if (q.teamId)     conditions.push(eq(jobsTable.teamId, q.teamId) as any);
  if (q.from)       conditions.push(gte(jobsTable.scheduledDate, q.from) as any);
  if (q.to)         conditions.push(lte(jobsTable.scheduledDate, q.to) as any);
  if (q.ward)       conditions.push(eq(assetsTable.ward, q.ward as any) as any);
  if (q.gardenType) conditions.push(eq(assetsTable.gardenType, q.gardenType as any) as any);
  if (q.search) {
    const term = `%${q.search}%`;
    conditions.push(ilike(assetsTable.name, term) as any);
  }

  const offset = (q.page - 1) * q.limit;

  const rows = await executeWithCircuitBreaker(() => db
    .select({
      id:               jobsTable.id,
      jobType:          jobsTable.jobType,
      scheduledDate:    jobsTable.scheduledDate,
      startedAt:        jobsTable.startedAt,
      completedAt:      jobsTable.completedAt,
      actualTimeMins:   jobsTable.actualTimeMins,
      estimatedTimeMins: jobsTable.estimatedTimeMins,
      notes:            jobsTable.notes,
      crewStatus:       jobsTable.crewStatus,
      isAllTeams:       jobsTable.isAllTeams,
      teamId:           jobsTable.teamId,
      teamName:         teamsTable.name,
      assetId:          assetsTable.id,
      assetName:        assetsTable.name,
      assetDescription: assetsTable.description,
      gardenType:       assetsTable.gardenType,
      ward:             assetsTable.ward,
      suburb:           assetsTable.suburb,
      areaM2:           assetsTable.areaM2,
    })
    .from(jobsTable)
    .leftJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
    .leftJoin(teamsTable, eq(jobsTable.teamId, teamsTable.id))
    .where(and(...conditions))
    .orderBy(desc(jobsTable.scheduledDate))
    .limit(q.limit)
    .offset(offset));

  res.json({ data: rows, page: q.page, limit: q.limit });
});

// GET /api/jobs/:id/pdf
router.get("/jobs/:id/pdf", requireAuth, async (req, res) => {
  const id = String(req.params.id);

  const [row] = await executeWithCircuitBreaker(() => db
    .select({
      id:               jobsTable.id,
      jobType:          jobsTable.jobType,
      scheduledDate:    jobsTable.scheduledDate,
      startedAt:        jobsTable.startedAt,
      completedAt:      jobsTable.completedAt,
      actualTimeMins:   jobsTable.actualTimeMins,
      estimatedTimeMins: jobsTable.estimatedTimeMins,
      notes:            jobsTable.notes,
      crewStatus:       jobsTable.crewStatus,
      isAllTeams:       jobsTable.isAllTeams,
      teamId:           jobsTable.teamId,
      teamName:         teamsTable.name,
      assetId:          assetsTable.id,
      assetName:        assetsTable.name,
      assetDescription: assetsTable.description,
      gardenType:       assetsTable.gardenType,
      ward:             assetsTable.ward,
      suburb:           assetsTable.suburb,
      areaM2:           assetsTable.areaM2,
    })
    .from(jobsTable)
    .leftJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
    .leftJoin(teamsTable, eq(jobsTable.teamId, teamsTable.id))
    .where(and(eq(jobsTable.id, id), eq(jobsTable.status, "completed")))
    .limit(1));

  if (!row) { res.status(404).json({ error: "Completed job not found" }); return; }

  // Authorization
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!row.isAllTeams && row.teamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  // Fetch photos
  const photos = await executeWithCircuitBreaker(() => db
    .select({ id: jobPhotosTable.id, blobUrl: jobPhotosTable.blobUrl, caption: jobPhotosTable.caption })
    .from(jobPhotosTable)
    .where(eq(jobPhotosTable.jobId, id)));

  // Download image buffers from GCS (images only, skip docs/PDFs)
  const IMAGE_EXTS = /\.(jpe?g|png|webp|gif)$/i;
  const bucketId = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"] ?? "";
  const photoBuffers: { buf: Buffer; caption: string | null }[] = [];
  for (const p of photos) {
    if (!IMAGE_EXTS.test(p.blobUrl)) continue;
    try {
      // blobUrl format: /api/uploads/<objectName>  e.g. /api/uploads/uploads/123-uuid.jpg
      const objectName = p.blobUrl.replace(/^\/api\/uploads\//, "");
      const [buf] = await objectStorageClient.bucket(bucketId).file(objectName).download();
      photoBuffers.push({ buf: buf as Buffer, caption: p.caption });
    } catch {
      // skip unreadable photos
    }
  }

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const siteName = row.assetName ?? "Unknown Site";
  // Build a safe filename: "<Site Name> - YYYY-MM-DD.pdf"
  const safeSiteName = siteName.replace(/[\\/:*?"<>|]/g, "").trim();
  const dateLabel = row.scheduledDate ?? row.completedAt?.toISOString().slice(0, 10) ?? "unknown-date";
  const pdfFilename = `${safeSiteName} - ${dateLabel}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
  doc.pipe(res);

  const TEAL = "#00AECD";
  const NAVY = "#0f2a36";
  const GREY = "#6b7280";

  function addFooter() {
    doc.fontSize(8).font("Helvetica").fillColor(GREY)
      .text(
        `Generated on ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })} — Porirua City Council Gardens Manager`,
        50, doc.page.height - 60, { align: "center", width: 495 },
      );
  }

  // ── Header ────────────────────────────────────────────────────────────────
  // Logo top-right (120pt wide, aspect ~1.92:1 → ~62pt tall, centred in 50–100 band)
  try {
    doc.image(LOGO_PATH, 415, 38, { width: 130 });
  } catch {
    // skip if logo file missing
  }
  doc.fontSize(20).font("Helvetica-Bold").fillColor(NAVY).text("Completed Works Record", 50, 50);
  doc.fontSize(10).font("Helvetica").fillColor(GREY).text("Porirua City Council — Gardens Manager", 50, 75);
  doc.moveTo(50, 105).lineTo(545, 105).strokeColor("#e5e7eb").stroke();

  // ── Site name ─────────────────────────────────────────────────────────────
  doc.fontSize(16).font("Helvetica-Bold").fillColor(NAVY).text(siteName, 50, 112);
  if (row.assetDescription) {
    doc.fontSize(9).font("Helvetica").fillColor(GREY).text(row.assetDescription, 50, doc.y + 2);
  }

  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.6);

  // ── Key details grid ─────────────────────────────────────────────────────
  const JOB_TYPE_LABELS: Record<string, string> = {
    scheduled: "Scheduled", reactive: "Reactive", mulching: "Mulching", audit: "Audit",
  };
  const WARD_LABELS: Record<string, string> = {
    northern: "Northern", eastern: "Eastern", southern: "Southern", central: "Central", western: "Western",
  };
  const GARDEN_TYPE_LABELS: Record<string, string> = {
    ornamental: "Ornamental", amenity: "Amenity", civic: "Civic",
    mixed: "Mixed", natural: "Natural", sports: "Sports",
  };

  function fmt9(label: string, value: string | null | undefined, col: number, y: number) {
    if (!value) return;
    doc.fontSize(8).font("Helvetica-Bold").fillColor(GREY).text(label.toUpperCase(), col, y);
    doc.fontSize(10).font("Helvetica").fillColor(NAVY).text(value, col, y + 11);
  }

  const scheduledStr = row.scheduledDate
    ? new Date(`${row.scheduledDate}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })
    : "—";
  const completedStr = row.completedAt
    ? new Date(row.completedAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const teamStr = row.isAllTeams ? "Full crew" : (row.teamName ?? "—");
  const jobTypeStr = JOB_TYPE_LABELS[row.jobType] ?? row.jobType;
  const wardStr = row.ward ? (WARD_LABELS[row.ward] ?? row.ward) : "—";
  const gardenTypeStr = row.gardenType ? (GARDEN_TYPE_LABELS[row.gardenType] ?? row.gardenType) : "—";
  const areaStr = row.areaM2 != null ? `${Number(row.areaM2).toFixed(1)} m²` : null;
  const suburbStr = row.suburb ?? null;

  const startY = doc.y;
  fmt9("Scheduled Date", scheduledStr, 50, startY);
  fmt9("Completed", completedStr, 220, startY);
  fmt9("Team", teamStr, 400, startY);
  doc.moveDown(2.4);

  const row2Y = doc.y;
  fmt9("Job Type", jobTypeStr, 50, row2Y);
  fmt9("Ward", wardStr, 220, row2Y);
  fmt9("Garden Type", gardenTypeStr, 400, row2Y);
  doc.moveDown(2.4);

  if (suburbStr || areaStr) {
    const row3Y = doc.y;
    fmt9("Suburb", suburbStr, 50, row3Y);
    if (areaStr) fmt9("Area", areaStr, 220, row3Y);
    doc.moveDown(2.4);
  }

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.6);

  // ── Time ──────────────────────────────────────────────────────────────────
  doc.fontSize(12).font("Helvetica-Bold").fillColor(TEAL).text("Time", 50, doc.y);
  doc.moveDown(0.4);

  function formatMinsStr(m: number | null): string {
    if (m == null) return "—";
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h === 0) return `${min}m`;
    return min === 0 ? `${h}h` : `${h}h ${min}m`;
  }

  const startedStr = row.startedAt
    ? new Date(row.startedAt).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: true })
    : null;

  const timeRows: [string, string][] = [];
  if (startedStr) timeRows.push(["Start time", startedStr]);
  timeRows.push(
    ["Scheduled", formatMinsStr(row.estimatedTimeMins)],
    ["Actual", formatMinsStr(row.actualTimeMins)],
  );
  if (row.actualTimeMins != null && row.estimatedTimeMins != null) {
    const v = row.actualTimeMins - row.estimatedTimeMins;
    const vStr = v === 0 ? "On time" : v > 0 ? `+${formatMinsStr(v)} over` : `${formatMinsStr(Math.abs(v))} under`;
    timeRows.push(["Variance", vStr]);
  }
  for (const [label, val] of timeRows) {
    const ty = doc.y;
    doc.fontSize(9).font("Helvetica").fillColor(GREY).text(label, 50, ty);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(NAVY).text(val, 400, ty, { width: 145, align: "right" });
    doc.moveDown(0.6);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#f3f4f6").stroke();
    doc.moveDown(0.2);
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (row.notes) {
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").stroke();
    doc.moveDown(0.6);
    doc.fontSize(12).font("Helvetica-Bold").fillColor(TEAL).text("Worker Notes", 50, doc.y);
    doc.moveDown(0.4);
    doc.fontSize(10).font("Helvetica").fillColor("#374151").text(row.notes, 50, doc.y, { width: 495 });
  }

  // ── Photos ────────────────────────────────────────────────────────────────
  if (photoBuffers.length > 0) {
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").stroke();
    doc.moveDown(0.6);
    doc.fontSize(12).font("Helvetica-Bold").fillColor(TEAL).text(`Photos (${photoBuffers.length})`, 50, doc.y);
    doc.moveDown(0.6);

    const IMG_W = 240;
    const IMG_H = 170;
    const GAP   = 15;
    const COLS  = 2;

    for (let i = 0; i < photoBuffers.length; i++) {
      const col = i % COLS;
      const isNewRow = col === 0;

      // Check page space: need room for image + optional caption
      if (isNewRow && doc.y + IMG_H + 30 > doc.page.height - 80) {
        addFooter();
        doc.addPage();
        doc.y = 50;
      }

      const x = col === 0 ? 50 : 50 + IMG_W + GAP;
      const y = doc.y;

      doc.image(photoBuffers[i].buf, x, y, { width: IMG_W, height: IMG_H, fit: [IMG_W, IMG_H] });

      if (photoBuffers[i].caption) {
        doc.fontSize(8).font("Helvetica").fillColor(GREY)
          .text(photoBuffers[i].caption!, x, y + IMG_H + 3, { width: IMG_W });
      }

      // After placing right-hand column (or last photo), advance y
      if (col === COLS - 1 || i === photoBuffers.length - 1) {
        doc.y = y + IMG_H + (photoBuffers[i].caption ? 18 : 8) + GAP;
      }
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  addFooter();
  doc.end();
});

// GET /api/jobs/:id
// Falls through to mulching_records when the id is not in the jobs table.
router.get("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [job] = await executeWithCircuitBreaker(() => db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1));
  if (job) {
    // Accepted-skip drafts are exclusively manager work. Do this before the
    // broader privileged-role check because supervisors may normally view
    // their team's operational jobs.
    if (job.status === "draft" && !["administrator", "manager"].includes(req.auth!.role)) {
      res.status(404).json({ error: "Job not found" }); return;
    }
    if (!isPrivilegedRole(req.auth!.role)) {
      const callerTeamId = req.auth!.teamId;
      if (!job.isAllTeams && job.teamId !== callerTeamId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }
    res.json(job); return;
  }

  // Fallback: check mulching_records
  const [mr] = await executeWithCircuitBreaker(() => db
    .select({
      id:                mulchingRecordsTable.id,
      assetId:           mulchingRecordsTable.assetId,
      status:            mulchingRecordsTable.status,
      teamId:            mulchingRecordsTable.assignedTeamId,
      scheduledDate:     mulchingRecordsTable.scheduledDate,
      completedDate:     mulchingRecordsTable.completedDate,
      estimatedTimeMins: mulchingRecordsTable.estimatedMins,
      notes:             mulchingRecordsTable.notes,
      mulchType:         mulchingRecordsTable.mulchType,
      createdAt:         mulchingRecordsTable.createdAt,
      updatedAt:         mulchingRecordsTable.updatedAt,
      assetName:         assetsTable.name,
      assetDesc:         assetsTable.description,
      gardenType:        assetsTable.gardenType,
      suburb:            assetsTable.suburb,
      streetAddress:     assetsTable.streetAddress,
      lat:               assetsTable.lat,
      lng:               assetsTable.lng,
      serviceTimeMins:   assetsTable.serviceTimeMins,
      routeOrder:        assetsTable.routeOrder,
    })
    .from(mulchingRecordsTable)
    .innerJoin(assetsTable, eq(mulchingRecordsTable.assetId, assetsTable.id))
    .where(eq(mulchingRecordsTable.id, id))
    .limit(1));

  if (!mr) { res.status(404).json({ error: "Job not found" }); return; }

  // Authorization: non-privileged users may only read mulching records for their team
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (mr.teamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const mulchStatusMap: Record<string, string> = { scheduled: "pending", completed: "completed" };
  res.json({
    ...mr,
    jobType:           "mulching",
    status:            mulchStatusMap[mr.status] ?? "pending",
    isAllTeams:        false,
    assignedUserId:    null,
    startedAt:         null,
    pausedAt:          null,
    completedAt:       mr.completedDate ? new Date(`${mr.completedDate}T00:00:00Z`) : null,
    actualTimeMins:    null,
    pausedElapsedSecs: 0,
    crewStatus:        null,
  });
});

// POST /api/jobs
// Accepts an optional `force: boolean` field alongside the standard job
// schema. When force is false (default) and the job would put the team over
// productive-time capacity for that day, returns
// { capacityConflict: true, capacity: { ... } } instead of inserting.
// Callers can re-submit with force: true to bypass the check (e.g. after
// showing the push-forward dialog and the user chose "Place Anyway").
const createJobSchema = insertJobSchema.extend({
  // insertJobSchema is generated with Zod v4, so extensions must use the
  // same instance. Mixing the route's legacy Zod import here throws at parse
  // time before the lifecycle guard can run.
  force: zV4.boolean().default(false),
});

router.post(
  "/jobs",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(createJobSchema),
  async (req, res) => {
    const { force, ...jobData } = res.locals.body as Record<string, any>;
    // Regular job drafts are a review-only lifecycle state. They are created
    // solely by accepting a skipped scheduled job, never by the general create
    // endpoint (which is also available to supervisors).
    if (
      jobData.status === "draft"
      || Object.hasOwn(req.body as Record<string, unknown>, "draftOriginalTeamId")
      || Object.hasOwn(req.body as Record<string, unknown>, "draftOriginalScheduledDate")
    ) {
      res.status(409).json({ error: "Draft jobs can only be created by accepting a skipped job review" });
      return;
    }

    // ── Capacity conflict check ───────────────────────────────────────────
    // Only relevant when a teamId and scheduledDate are set (not all-teams jobs).
    const teamId       = jobData.teamId as string | null | undefined;
    const scheduledDate = jobData.scheduledDate as string | null | undefined;

    if (!force && teamId && scheduledDate) {
      // Estimate the job's time contribution (estimatedTimeMins or asset's serviceTimeMins)
      let newJobMins = (jobData.estimatedTimeMins as number | null | undefined) ?? 0;
      if (!newJobMins && jobData.assetId) {
        const [asset] = await executeWithCircuitBreaker(() => db
          .select({ serviceTimeMins: assetsTable.serviceTimeMins })
          .from(assetsTable)
          .where(eq(assetsTable.id, jobData.assetId as string))
          .limit(1));
        newJobMins = asset?.serviceTimeMins ?? 0;
      }

      if (newJobMins > 0) {
        const conflict = await checkDayCapacity(teamId, scheduledDate, newJobMins);
        if (conflict) {
          if (!conflict.capacityDataReliable) {
            // Capacity data is unreliable (silent middleware failure detected).
            // Return 503 so the caller knows this is a data-quality block, not
            // a genuine over-capacity condition.
            res.status(503).json({
              error: "Capacity data is temporarily unreliable — scheduling blocked to prevent over-commitment",
              capacity: conflict,
            });
            return;
          }
          // Use 409 Conflict so existing consumers that rely on response.ok
          // treat this as an error (false) rather than a silent success.
          res.status(409).json({ capacityConflict: true, capacity: conflict });
          return;
        }
      }
    }

    // The insert and the audit log are intentionally separate operations (not
    // wrapped in a transaction) so that an audit-log failure (e.g. a constraint
    // violation on audit_log) cannot roll back the committed job insert.
    // auditLog() swallows its own errors and returns false on failure.
    const [created] = await executeWithCircuitBreaker(() => db.insert(jobsTable).values(jobData as any).returning());
    await auditLog({
      tableName: "jobs", recordId: created.id, action: "INSERT",
      changedById: req.auth?.userId ?? null, newData: created as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });

    // Send push notification to assigned crew
    if (created.assignedUserId || created.teamId || created.isAllTeams) {
      const [asset] = await executeWithCircuitBreaker(() => db
        .select({ name: assetsTable.name })
        .from(assetsTable)
        .where(eq(assetsTable.id, created.assetId as string))
        .limit(1));
      const assetName = asset?.name ?? "a site";
      const dateStr = typeof created.scheduledDate === "string"
        ? created.scheduledDate
        : (created.scheduledDate as Date).toISOString().slice(0, 10);

      if (created.assignedUserId) {
        // Individual assignment — notify only that crew member
        notifyUsers([created.assignedUserId], {
          title: "Job assigned to you",
          body:  `${assetName} is scheduled for ${dateStr}.`,
          data:  { jobId: created.id, screen: "job" },
        }).catch(err => console.error("[push] notify error:", err));
      } else {
        // Team-wide assignment
        notifyTeam(created.teamId, created.isAllTeams, {
          title: "New job assigned",
          body:  `${assetName} is scheduled for ${dateStr}.`,
          data:  { jobId: created.id, screen: "job" },
        }).catch(err => console.error("[push] notify error:", err));
      }
    }

    res.status(201).json(created);
  },
);

// PATCH /api/jobs/:id
router.patch("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [before] = await executeWithCircuitBreaker(() => db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1));

  // Fallback: if the ID belongs to a mulching record, handle completion there
  if (!before) {
    const [mr] = await executeWithCircuitBreaker(() => db
      .select()
      .from(mulchingRecordsTable)
      .where(eq(mulchingRecordsTable.id, id))
      .limit(1));

    if (!mr) { res.status(404).json({ error: "Job not found" }); return; }

    // Authorization: non-privileged users may only update mulching records for their team
    if (!isPrivilegedRole(req.auth!.role)) {
      const callerTeamId = req.auth!.teamId;
      if (mr.assignedTeamId !== callerTeamId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    const patch = req.body as Record<string, unknown>;
    const toStatus = patch.status as string | undefined;

    // Map field-app status → mulching_records status
    const mulchUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (toStatus === "completed" && mr.status !== "completed") {
      mulchUpdates.status = "completed";
      mulchUpdates.completedDate = new Date().toISOString().slice(0, 10);
    } else if (toStatus === "pending" || toStatus === "in_progress") {
      // Allow re-opening (e.g. start → in_progress treated as still scheduled)
      mulchUpdates.status = "scheduled";
    }

    const [updated] = await executeWithCircuitBreaker(() => db
      .update(mulchingRecordsTable)
      .set(mulchUpdates)
      .where(eq(mulchingRecordsTable.id, id))
      .returning());

    // Audit log is written after the update commits so that a logging failure
    // cannot roll back the committed record change. auditLog() swallows errors.
    await auditLog({
      tableName: "mulching_records", recordId: id, action: "UPDATE",
      changedById: req.auth?.userId ?? null,
      oldData: mr as Record<string, unknown>, newData: updated as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });

    const mulchStatusMap: Record<string, string> = { scheduled: "pending", completed: "completed" };
    res.json({
      ...updated,
      jobType:           "mulching",
      status:            mulchStatusMap[updated.status] ?? "pending",
      isAllTeams:        false,
      startedAt:         null,
      pausedAt:          null,
      completedAt:       updated.completedDate ? new Date(`${updated.completedDate}T00:00:00Z`) : null,
      actualTimeMins:    null,
      pausedElapsedSecs: 0,
      crewStatus:        null,
      assignedUserId:    null,
    });
    return;
  }

  // Authorization: non-privileged users may only update jobs belonging to their team
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!before.isAllTeams && before.teamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const patch = req.body as Record<string, unknown>;
  if (before.status === "draft" || patch.status === "draft") {
    res.status(409).json({ error: "Draft jobs can only be placed through the draft placement flow" });
    return;
  }

  // Non-privileged users may only change operational status fields, not structural ones
  if (!isPrivilegedRole(req.auth!.role)) {
    const allowedFields = new Set(["status", "notes", "crewStatus", "pausedElapsedSecs", "actualTimeMins", "skipReason", "outOfSequenceReason", "pestsAndDiseases", "plantHealthVigor", "generalComments"]);
    for (const key of Object.keys(patch)) {
      if (!allowedFields.has(key)) delete patch[key];
    }
  }

  // Skip-review fields are managed exclusively by POST /api/jobs/:id/skip-review.
  // Strip them unconditionally so no role can bypass the dedicated endpoint.
  delete patch.skipReviewedAt;
  delete patch.skipReviewedById;
  delete patch.skipReviewOutcome;
  delete patch.skipReviewNotes;

  // Never trust client-supplied timestamps — server owns these
  delete patch.startedAt;
  delete patch.completedAt;
  delete patch.pausedAt;

  // Status transition logic
  const fromStatus = before.status;
  const toStatus = patch.status as string | undefined;

  if (toStatus === "in_progress") {
    if (fromStatus === "pending") {
      // Fresh start
      patch.startedAt = new Date();
      patch.pausedAt = null;
    } else if (fromStatus === "paused") {
      // Resume — accumulate elapsed time so far into pausedElapsedSecs
      const pausedAt = before.pausedAt ? new Date(before.pausedAt).getTime() : Date.now();
      const additionalSecs = Math.floor((Date.now() - pausedAt) / 1000);
      patch.pausedElapsedSecs = (before.pausedElapsedSecs ?? 0) + additionalSecs;
      patch.pausedAt = null;
    }
  }

  if (toStatus === "paused" && fromStatus === "in_progress") {
    patch.pausedAt = new Date();
  }

  if (toStatus === "completed" && fromStatus !== "completed") {
    const completedAt = new Date();
    patch.completedAt = completedAt;
    // Calculate actual time: wall-clock minus any accumulated paused time
    if (before.startedAt) {
      const wallSecs = Math.floor((completedAt.getTime() - new Date(before.startedAt).getTime()) / 1000);
      const pausedSecs = before.pausedElapsedSecs ?? 0;
      patch.actualTimeMins = Math.max(1, Math.round((wallSecs - pausedSecs) / 60));
    }
  }

  const [updated] = await executeWithCircuitBreaker(() => db
    .update(jobsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(jobsTable.id, id))
    .returning());

  // Audit log is written after the update commits so that a logging failure
  // cannot roll back the committed record change. auditLog() swallows errors.
  await auditLog({
    tableName: "jobs", recordId: id, action: "UPDATE",
    changedById: req.auth?.userId ?? null,
    oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>,
    ipAddress: req.ip ?? null,
  });

  // ── Assignment notification ──────────────────────────────────────────────────
  // Notify the crew member when a job is directly assigned (or reassigned) to them.
  const newAssignedUserId = updated.assignedUserId ?? null;
  const oldAssignedUserId = before.assignedUserId ?? null;
  if (newAssignedUserId && newAssignedUserId !== oldAssignedUserId) {
    const [asset] = await executeWithCircuitBreaker(() => db
      .select({ name: assetsTable.name })
      .from(assetsTable)
      .where(eq(assetsTable.id, updated.assetId))
      .limit(1));
    const assetName = asset?.name ?? "a site";
    const dateStr = typeof updated.scheduledDate === "string"
      ? updated.scheduledDate
      : updated.scheduledDate
        ? (updated.scheduledDate as Date).toISOString().slice(0, 10)
        : "TBD";

    notifyUsers([newAssignedUserId], {
      title: "Job assigned to you",
      body:  `${assetName} is scheduled for ${dateStr}.`,
      data:  { jobId: updated.id, screen: "job" },
    }).catch(err => console.error("[push] notify error:", err));
  }

  res.json(updated);
});

// POST /api/jobs/:id/skip-review — manager accepts or rejects a skip reason (manager/admin only)
router.post("/jobs/:id/skip-review", requireAuth, requireRole("administrator", "manager"), async (req, res) => {
  const id = String(req.params.id);
  const { outcome, notes } = req.body as { outcome?: string; notes?: string };
  if (outcome !== "accepted" && outcome !== "rejected") {
    res.status(400).json({ error: "outcome must be 'accepted' or 'rejected'" }); return;
  }

  const [job] = await executeWithCircuitBreaker(() => db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, id))
    .limit(1));

  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  if (job.status !== "skipped") {
    if (job.skipReviewOutcome && job.skipReviewOutcome === outcome) {
      res.json({ ...job, idempotent: true });
      return;
    }
    if (!job.skipReviewOutcome) {
      res.status(409).json({ error: "Job is not in skipped status" }); return;
    }
    res.status(409).json({ error: "Skip has already been reviewed with a different outcome" }); return;
  }
  if (job.jobType !== "scheduled") {
    res.status(409).json({ error: "Only regular scheduled jobs can be moved through the skip-review lifecycle" });
    return;
  }

  const now     = new Date();
  const callerId = req.auth!.userId;
  const ip      = req.ip ?? null;

  // Atomically update the job in a transaction that includes a WHERE status='skipped'
  // guard to catch concurrent status changes between the pre-flight read and this write.
  // The audit log is written AFTER the transaction commits so that an audit failure
  // (e.g. constraint violation) cannot roll back and silently discard the review.
  let updated: typeof job | undefined;
  try {
    updated = await executeWithCircuitBreaker(() => db.transaction(async tx => {
      const [row] = await tx
        .update(jobsTable)
        .set({
          status:            outcome === "accepted" ? "draft" : "pending",
          skipReviewedAt:    now,
          skipReviewedById:  callerId,
          skipReviewOutcome: outcome,
          skipReviewNotes:   notes ?? null,
          ...(outcome === "accepted" ? {
            draftOriginalTeamId:       job.teamId,
            draftOriginalScheduledDate: job.scheduledDate,
          } : {}),
          updatedAt:         now,
        })
        .where(and(eq(jobsTable.id, id), eq(jobsTable.status, "skipped")))
        .returning();

      if (!row) {
        // Status changed between read and write — throw to abort the transaction
        const err: NodeJS.ErrnoException = new Error("Job is no longer in skipped status");
        (err as any).statusCode = 409;
        throw err;
      }

      return row;
    }));
  } catch (err: any) {
    if (err?.statusCode === 409) {
      res.status(409).json({ error: err.message }); return;
    }
    throw err;
  }

  // Write the audit log outside the transaction so a logging failure cannot
  // roll back the committed review.  auditLog() swallows its own errors and
  // returns false — a warning is sufficient.
  const logged = await auditLog({
    tableName:   "jobs",
    recordId:    id,
    action:      "UPDATE",
    changedById: callerId,
    oldData:     job     as Record<string, unknown>,
    newData:     updated as Record<string, unknown>,
    ipAddress:   ip,
  });
  if (!logged) {
    console.warn(`[skip-review] Audit log failed for job ${id}; review was already committed`);
  }

  res.json(updated);
});

const placeDraftSchema = z.object({
  teamId:        z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  force:         z.boolean().default(false),
});

// POST /api/jobs/:id/place-draft — manager deliberately returns an accepted
// skip to a live schedule. Only a draft can make this one-way transition.
router.post("/jobs/:id/place-draft", requireAuth, requireRole("administrator", "manager"), validateBody(placeDraftSchema), async (req, res) => {
  const id = String(req.params.id);
  const { teamId, scheduledDate, force } = res.locals.body as z.infer<typeof placeDraftSchema>;

  const [draft] = await executeWithCircuitBreaker(() => db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, id))
    .limit(1));
  if (!draft) { res.status(404).json({ error: "Job not found" }); return; }

  if (draft.status !== "draft") {
    if (draft.status === "pending" && draft.teamId === teamId && draft.scheduledDate === scheduledDate) {
      res.json({ ...draft, idempotent: true });
      return;
    }
    res.status(409).json({ error: "Job is no longer awaiting draft placement" });
    return;
  }

  const now = new Date();
  let placed: typeof draft | undefined;

  if (!force) {
    let newJobMins = draft.estimatedTimeMins ?? 0;
    if (!newJobMins) {
      const [asset] = await executeWithCircuitBreaker(() => db
        .select({ serviceTimeMins: assetsTable.serviceTimeMins })
        .from(assetsTable)
        .where(eq(assetsTable.id, draft.assetId))
        .limit(1));
      newJobMins = asset?.serviceTimeMins ?? 0;
    }

    if (newJobMins > 0) {
      const result = await executeWithCircuitBreaker(() => db.transaction(async tx => {
        // Serialize capacity decisions for a team/day. The lock lasts through
        // the re-check and update, so two drafts cannot both consume the same
        // remaining minutes unless the manager explicitly forces placement.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${teamId} || ':' || ${scheduledDate}))`);
        const conflict = await checkDayCapacity(teamId, scheduledDate, newJobMins, tx as unknown as typeof db);
        if (conflict) return { conflict };
        const [updated] = await tx
          .update(jobsTable)
          .set({
            status: "pending",
            teamId,
            scheduledDate,
            isAllTeams: false,
            updatedAt: now,
          })
          .where(and(eq(jobsTable.id, id), eq(jobsTable.status, "draft")))
          .returning();
        return { placed: updated };
      }));

      if (result.conflict) {
        if (!result.conflict.capacityDataReliable) {
          res.status(503).json({ error: "Capacity data is unreliable; placement has been blocked", capacity: result.conflict });
          return;
        }
        res.status(409).json({ capacityConflict: true, capacity: result.conflict });
        return;
      }
      placed = result.placed;
    }
  }

  if (!placed) {
    [placed] = await executeWithCircuitBreaker(() => db
      .update(jobsTable)
      .set({
        status: "pending",
        teamId,
        scheduledDate,
        isAllTeams: false,
        updatedAt: now,
      })
      .where(and(eq(jobsTable.id, id), eq(jobsTable.status, "draft")))
      .returning());
  }

  if (!placed) {
    res.status(409).json({ error: "Job is no longer awaiting draft placement" });
    return;
  }

  await auditLog({
    tableName: "jobs",
    recordId: id,
    action: "UPDATE",
    changedById: req.auth!.userId,
    oldData: draft as Record<string, unknown>,
    newData: placed as Record<string, unknown>,
    ipAddress: req.ip ?? null,
  });

  res.json(placed);
});

// GET /api/jobs/:id/task-skip-reasons
router.get("/jobs/:id/task-skip-reasons", requireAuth, async (req, res) => {
  const id = String(req.params.id);

  // Authorization: verify the caller can read this job
  const [job] = await executeWithCircuitBreaker(() => db.select({ teamId: jobsTable.teamId, isAllTeams: jobsTable.isAllTeams, status: jobsTable.status }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  if (job.status === "draft" && !["administrator", "manager"].includes(req.auth!.role)) {
    res.status(404).json({ error: "Job not found" }); return;
  }
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!job.isAllTeams && job.teamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const rows = await executeWithCircuitBreaker(() => db
    .select()
    .from(jobTaskSkipReasonsTable)
    .where(eq(jobTaskSkipReasonsTable.jobId, id))
    .orderBy(jobTaskSkipReasonsTable.taskIndex));
  res.json({ data: rows });
});

// POST /api/jobs/:id/task-skip-reasons
router.post("/jobs/:id/task-skip-reasons", requireAuth, async (req, res) => {
  const id = String(req.params.id);

  // Authorization: verify the caller can act on this job
  const [job] = await executeWithCircuitBreaker(() => db.select({ teamId: jobsTable.teamId, isAllTeams: jobsTable.isAllTeams, status: jobsTable.status }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  if (job.status === "draft") {
    res.status(409).json({ error: "Draft jobs cannot be changed until a manager places them" }); return;
  }
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!job.isAllTeams && job.teamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const { taskIndex, taskLabel, reason } = req.body as {
    taskIndex: number;
    taskLabel: string;
    reason: string;
  };
  if (typeof taskIndex !== "number" || !taskLabel || !reason) {
    res.status(400).json({ error: "taskIndex, taskLabel and reason are required" });
    return;
  }
  const [created] = await executeWithCircuitBreaker(() => db
    .insert(jobTaskSkipReasonsTable)
    .values({ jobId: id, taskIndex, taskLabel, reason, createdById: req.auth!.userId })
    .returning());
  res.status(201).json(created);
});

// POST /api/jobs/:id/team-complete — sign off a team's time on an All Teams job
router.post("/jobs/:id/team-complete", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const userId = req.auth!.userId;
  const { actualTimeMins, notes } = req.body as { actualTimeMins?: number; notes?: string };

  const [job] = await executeWithCircuitBreaker(() => db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1));
  if (!job)            { res.status(404).json({ error: "Job not found" }); return; }
  if (job.status === "draft") {
    res.status(409).json({ error: "Draft jobs cannot be completed until a manager places them" }); return;
  }
  if (!job.isAllTeams) { res.status(400).json({ error: "Not an All Teams job" }); return; }

  // Authorization: teamId is always derived from the DB — callers can only sign off their own
  // team's participation; the caller must have a team assignment to participate.
  const [userRow] = await executeWithCircuitBreaker(() => db
    .select({ teamId: usersTable.teamId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1));
  if (!userRow?.teamId) {
    res.status(403).json({ error: "Forbidden: user has no team assigned" }); return;
  }
  const teamId = userRow.teamId;

  // Verify the resolved teamId matches the JWT claim (defence-in-depth, prevents token/DB skew)
  if (!isPrivilegedRole(req.auth!.role) && req.auth!.teamId && req.auth!.teamId !== teamId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [existing] = await executeWithCircuitBreaker(() => db
    .select({ id: jobTeamCompletionsTable.id })
    .from(jobTeamCompletionsTable)
    .where(and(eq(jobTeamCompletionsTable.jobId, id), eq(jobTeamCompletionsTable.teamId, teamId)))
    .limit(1));

  let completion;
  if (existing) {
    [completion] = await executeWithCircuitBreaker(() => db
      .update(jobTeamCompletionsTable)
      .set({ actualTimeMins: actualTimeMins ?? null, notes: notes ?? null, completedAt: new Date(), completedById: userId })
      .where(and(eq(jobTeamCompletionsTable.jobId, id), eq(jobTeamCompletionsTable.teamId, teamId)))
      .returning());
  } else {
    [completion] = await executeWithCircuitBreaker(() => db
      .insert(jobTeamCompletionsTable)
      .values({ jobId: id, teamId, actualTimeMins: actualTimeMins ?? null, notes: notes ?? null, completedById: userId })
      .returning());
  }

  if (job.status === "pending") {
    await executeWithCircuitBreaker(() => db.update(jobsTable).set({ status: "in_progress", startedAt: new Date(), updatedAt: new Date() }).where(eq(jobsTable.id, id)));
  }

  const allTeams  = await executeWithCircuitBreaker(() => db.select({ id: teamsTable.id }).from(teamsTable));
  const allSigned = await executeWithCircuitBreaker(() => db.select({ teamId: jobTeamCompletionsTable.teamId }).from(jobTeamCompletionsTable).where(eq(jobTeamCompletionsTable.jobId, id)));
  const signedIds = new Set(allSigned.map(r => r.teamId));
  const allDone   = allTeams.every(t => signedIds.has(t.id));

  if (allDone) {
    await executeWithCircuitBreaker(() => db.update(jobsTable)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobsTable.id, id)));
  }

  res.json({ completion, allDone, signedCount: signedIds.size, totalTeams: allTeams.length });
});

// ── Reactive jobs ────────────────────────────────────────────────────────────

// GET /api/reactive-jobs
router.get("/reactive-jobs", requireAuth, async (req, res) => {
  const assetId = req.query.assetId as string | undefined;
  const statusFilter = req.query.status as string | undefined;
  const conditions: any[] = [];
  if (assetId) conditions.push(eq(reactiveJobsTable.assetId, assetId));

  // Non-privileged users may only see reactive jobs assigned to their team
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (!callerTeamId) { res.json({ data: [] }); return; }
    conditions.push(eq(reactiveJobsTable.assignedTeamId, callerTeamId));
  }

  if (statusFilter) {
    const statuses = statusFilter.split(",").map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(reactiveJobsTable.status, statuses[0] as any));
    } else if (statuses.length > 1) {
      conditions.push(inArray(reactiveJobsTable.status, statuses as any[]));
    }
  }
  const rows = await executeWithCircuitBreaker(() => db
    .select({
      ...(reactiveJobsTable as any),
      raisedByName: usersTable.name,
      assetDescription: assetsTable.description,
    })
    .from(reactiveJobsTable)
    .leftJoin(usersTable, eq(reactiveJobsTable.raisedById, usersTable.id))
    .leftJoin(assetsTable, eq(reactiveJobsTable.assetId, assetsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(5000));
  res.json({ data: rows });
});

// POST /api/reactive-jobs
router.post("/reactive-jobs", requireAuth, validateBody(insertReactiveJobSchema.omit({ raisedById: true, origin: true })), async (req, res) => {
  const role = req.auth!.role;
  const isManager = role === "manager" || role === "administrator";
  const isSupervisor = role === "supervisor" || role === "team_leader";
  const origin = isManager ? "manager" : isSupervisor ? "supervisor" : "field_worker";

  // Field workers may only supply basic issue details.
  // Privileged assignment/scheduling fields are reserved for supervisors and above.
  // Status is always forced to "raised" on creation — no role may skip the workflow.
  const {
    assignedTeamId,
    assignedUserId,
    scheduledDate,
    estimatedTimeMins,
    priority,
    status: _status,  // always ignored — forced below
    ...allowedBody
  } = req.body;

  const privilegedFields = isManager || isSupervisor
    ? { assignedTeamId, assignedUserId, scheduledDate, estimatedTimeMins, priority }
    : {};

  // The insert and the audit log are intentionally separate operations (not
  // wrapped in a transaction) so that an audit-log failure cannot roll back
  // the committed reactive-job insert. auditLog() swallows its own errors.
  const [created] = await executeWithCircuitBreaker(() => db
    .insert(reactiveJobsTable)
    .values({ ...allowedBody, ...privilegedFields, status: "raised", raisedById: req.auth!.userId, origin })
    .returning());
  await auditLog({
    tableName: "reactive_jobs", recordId: created.id, action: "INSERT",
    changedById: req.auth?.userId ?? null, newData: created as Record<string, unknown>,
    ipAddress: req.ip ?? null,
  });

  if (created.assignedTeamId) {
    let assetName = "a site";
    if (created.assetId) {
      const [asset] = await executeWithCircuitBreaker(() => db
        .select({ name: assetsTable.name })
        .from(assetsTable)
        .where(eq(assetsTable.id, created.assetId))
        .limit(1));
      assetName = asset?.name ?? "a site";
    }
    const priority = created.priority ?? "medium";

    notifyTeam(created.assignedTeamId, false, {
      title: "Urgent job raised",
      body: `${assetName} — priority: ${priority}.`,
      data: { reactiveJobId: created.id, screen: "reactive-job" },
    }).catch(err => console.error("[push] notify error:", err));
  }

  res.status(201).json(created);
});

// GET /api/reactive-jobs/:id
router.get("/reactive-jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [row] = await executeWithCircuitBreaker(() => db
    .select({
      ...reactiveJobsTable,
      raisedByName: usersTable.name,
      assetDescription: assetsTable.description,
    })
    .from(reactiveJobsTable)
    .leftJoin(usersTable, eq(reactiveJobsTable.raisedById, usersTable.id))
    .leftJoin(assetsTable, eq(reactiveJobsTable.assetId, assetsTable.id))
    .where(eq(reactiveJobsTable.id, id))
    .limit(1));
  if (!row) { res.status(404).json({ error: "Reactive job not found" }); return; }

  // Authorization: non-privileged users may only read reactive jobs assigned to their team
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (row.assignedTeamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  res.json(row);
});

// PATCH /api/reactive-jobs/:id
router.patch("/reactive-jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [before] = await executeWithCircuitBreaker(() => db.select().from(reactiveJobsTable).where(eq(reactiveJobsTable.id, id)).limit(1));
  if (!before) { res.status(404).json({ error: "Reactive job not found" }); return; }

  // Authorization: non-privileged users may only update reactive jobs assigned to their team
  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (before.assignedTeamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  // Build an explicit patch to prevent mass-assignment of sensitive fields
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const workerFields = ["status", "notes", "actualTimeMins", "scheduledDate"];
  const managerFields = ["assignedTeamId", "assignedUserId", "priority", "description", "raisedById", "issueType", "estimatedTimeMins", "location", "locationLat", "locationLng"];
  const allowedFields = isPrivilegedRole(req.auth!.role)
    ? [...workerFields, ...managerFields]
    : workerFields;

  const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
  const VALID_STATUSES   = new Set(["raised", "assigned", "in_progress", "completed", "cancelled"]);
  const NOT_NULL_FIELDS  = new Set(["issueType", "description"]);

  for (const key of allowedFields) {
    if (!(key in body)) continue;
    const val = body[key];
    // Skip values that would violate NOT NULL constraints
    if (NOT_NULL_FIELDS.has(key) && (val === null || val === undefined || val === "")) continue;
    // Validate enum fields
    if (key === "priority" && typeof val === "string" && !VALID_PRIORITIES.has(val)) {
      res.status(400).json({ error: `Invalid priority value: ${val}` }); return;
    }
    if (key === "status" && typeof val === "string" && !VALID_STATUSES.has(val)) {
      res.status(400).json({ error: `Invalid status value: ${val}` }); return;
    }
    patch[key] = val;
  }

  const [updated] = await executeWithCircuitBreaker(() => db
    .update(reactiveJobsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(reactiveJobsTable.id, id))
    .returning());
  // Audit log is written after the update commits so that a logging failure
  // cannot roll back the committed record change. auditLog() swallows errors.
  await auditLog({
    tableName: "reactive_jobs", recordId: id, action: "UPDATE",
    changedById: req.auth?.userId ?? null,
    oldData: before as Record<string, unknown>, newData: updated as Record<string, unknown>,
    ipAddress: req.ip ?? null,
  });
  res.json(updated);
});

export default router;
