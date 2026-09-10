import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { createHash, randomUUID } from "crypto";
import {
  db, executeWithCircuitBreaker, stormEventsTable, stormWorkPackagesTable, stormJobsTable,
  stormCheckResultsTable, stormObservationsTable, stormAlertsTable, stormPatrolSettingsTable,
  stormPhotosTable, reactiveJobsTable, assetsTable, teamsTable, usersTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { auditLog } from "../lib/audit";
import { notifyUsers } from "../lib/push-notifications";
import { objectStorageClient } from "../lib/objectStorage";
import { arePublishableStormwaterAssets, calculateStormChargeCents, escapeCsvCell, requiresStormVisualCheckComments } from "../lib/storm-patrol";
import { deliverStormAlertEmail } from "../lib/storm-patrol-email";

const router = Router();
const managers = ["administrator", "manager"];
const privileged = (role: string) => ["administrator", "manager", "supervisor"].includes(role);
const phases = z.enum(["pre", "mid", "post"]);
const workTypes = z.enum(["silt_clearance", "litter_clearance", "debris_clearance", "visual_check_only", "litter_debris_removed_from_site", "site_too_dangerous", "site_made_safe"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype.startsWith("image/")) callback(null, true);
    else callback(new Error("Storm Patrol attachments must be images."));
  },
});
function safeUploadContext(req: Request) {
  return {
    path: req.path.replace(/\/[0-9a-f-]{8,}/gi, "/:id"),
    contentType: req.get("content-type")?.split(";")[0] ?? "missing",
    contentLength: req.get("content-length") ?? "unknown",
    bodyFields: Object.keys(req.body ?? {}).sort(),
  };
}
function stormPhotoUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("photo")(req, res, error => {
    if (error) {
      console.warn("[storm-photo-upload-rejected]", JSON.stringify({
        ...safeUploadContext(req),
        reason: error instanceof multer.MulterError ? error.code : error instanceof Error ? error.message : "unknown",
      }));
      res.status(error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
        .json({ error: error instanceof Error ? error.message : "Photo upload was rejected." });
      return;
    }
    next();
  });
}
const workbookUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.originalname.toLowerCase().endsWith(".xlsx")),
});

type StormAssetImportRow = {
  rowNumber: number;
  globalId: string;
  name: string;
  streetAddress: string | null;
  suburb: string | null;
  contractor: string;
  assetType: string;
  description: string | null;
  priority: string;
  hotspot: string;
  lat: string;
  lng: string;
  routeOrder: number;
  placemarkId: string | null;
  error?: string;
};

function normalizeGlobalId(value: unknown) {
  return String(value ?? "").trim().replace(/^\{|\}$/g, "").toUpperCase();
}

async function inspectStormAssetWorkbook(buffer: Buffer) {
  const batchKey = createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets["Survey Data"];
  if (!sheet) return { batchKey, rows: [] as StormAssetImportRow[], errors: ["Workbook must include a “Survey Data” sheet."], warnings: [] as string[] };
  const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  const rows: StormAssetImportRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  source.forEach((raw, index) => {
    const rowNumber = index + 2;
    const globalId = normalizeGlobalId(raw.globalid);
    const name = String(raw["Asset name"] ?? "").trim();
    const latNumber = Number(raw.latitude);
    const lngNumber = Number(raw.longitude);
    const contractorRaw = String(raw.contractor ?? "").trim();
    const assetTypeRaw = String(raw["Asset type"] ?? "").trim().toLowerCase();
    const priorityRaw = String(raw.Priority ?? "").trim();
    const hotspotRaw = String(raw["Hotspot?"] ?? "").trim().toUpperCase();
    const item: StormAssetImportRow = {
      rowNumber,
      globalId,
      name,
      streetAddress: String(raw.actual_address ?? "").trim() || null,
      suburb: String(raw.suburb ?? "").trim() || null,
      contractor: contractorRaw.toLowerCase() === "other" ? "Other" : contractorRaw,
      assetType: assetTypeRaw,
      description: String(raw["Location description"] ?? "").trim() || null,
      priority: priorityRaw || "Low",
      hotspot: hotspotRaw === "Y" ? "Yes" : "No",
      lat: Number.isFinite(latNumber) ? latNumber.toFixed(6) : "",
      lng: Number.isFinite(lngNumber) ? lngNumber.toFixed(6) : "",
      routeOrder: index + 1,
      placemarkId: String(raw.placemark_id ?? "").trim() || null,
    };
    if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(globalId)) item.error = "Invalid Global ID.";
    else if (seen.has(globalId)) item.error = "Duplicate Global ID.";
    else if (!name) item.error = "Asset name is required.";
    else if (!item.lat || !item.lng) item.error = "Valid latitude and longitude are required.";
    else if (!["Parks", "Transport", "WGTN Regional", "Taiki Wai", "Other"].includes(item.contractor)) item.error = `Unsupported contractor “${item.contractor}”.`;
    else if (!["inlet", "outlet", "culvert", "other"].includes(item.assetType)) item.error = `Unsupported asset type “${item.assetType}”.`;
    else if (!["High", "Medium", "Low"].includes(item.priority)) item.error = `Unsupported priority “${item.priority}”.`;
    seen.add(globalId);
    if (!priorityRaw) warnings.push(`Row ${rowNumber}: blank Priority will import as Low.`);
    if (!hotspotRaw) warnings.push(`Row ${rowNumber}: blank Hotspot will import as No.`);
    if (item.error) errors.push(`Row ${rowNumber}: ${item.error}`);
    rows.push(item);
  });
  if (!rows.length) errors.push("Workbook has no data rows.");
  if (rows.length > 500) errors.push("Workbook exceeds the 500-row import limit.");
  const existing = await executeWithCircuitBreaker(() => db.select({
    id: assetsTable.id, globalId: assetsTable.globalId, department: assetsTable.department, departmentDetails: assetsTable.departmentDetails,
  }).from(assetsTable));
  const existingByGlobalId = new Map(existing.map(asset => [normalizeGlobalId(asset.globalId), asset]));
  for (const row of rows) {
    const match = existingByGlobalId.get(row.globalId);
    if (match && match.department !== "stormwater") {
      row.error = "Global ID already belongs to a non-Stormwater asset.";
      errors.push(`Row ${row.rowNumber}: ${row.error}`);
    }
  }
  const alreadyImported = rows.length > 0 && rows.every(row => {
    const match = existingByGlobalId.get(row.globalId);
    return match?.department === "stormwater"
      && (match.departmentDetails as Record<string, unknown> | null)?.importFingerprint === batchKey;
  });
  return { batchKey, rows, errors, warnings, alreadyImported, existingByGlobalId };
}

async function activeEvent() {
  const [event] = await executeWithCircuitBreaker(() => db.select().from(stormEventsTable).where(eq(stormEventsTable.status, "active")).limit(1));
  return event;
}
async function ownJob(id: string, userId: string, teamId: string | null, role: string) {
  const [job] = await executeWithCircuitBreaker(() => db.select().from(stormJobsTable).where(eq(stormJobsTable.id, id)).limit(1));
  if (!job) return { error: 404, job: null };
  if (!privileged(role) && (job.teamId !== teamId || (job.assignedUserId && job.assignedUserId !== userId))) return { error: 403, job: null };
  return { job, error: null };
}
function cents(minutes: number, rate: number) { return calculateStormChargeCents(minutes, rate); }
async function enrichedStormJobs(where: any) {
  const jobs = await executeWithCircuitBreaker(() => db.select({
    id: stormJobsTable.id, eventId: stormJobsTable.eventId, workPackageId: stormJobsTable.workPackageId,
    phase: stormJobsTable.phase, assetId: stormJobsTable.assetId, teamId: stormJobsTable.teamId,
    assignedUserId: stormJobsTable.assignedUserId, routeOrder: stormJobsTable.routeOrder,
    status: stormJobsTable.status, startedAt: stormJobsTable.startedAt, completedAt: stormJobsTable.completedAt,
    actualTimeMins: stormJobsTable.actualTimeMins, comments: stormJobsTable.comments, createdAt: stormJobsTable.createdAt,
    assetName: assetsTable.name, assetDescription: assetsTable.description, streetAddress: assetsTable.streetAddress,
    suburb: assetsTable.suburb, lat: assetsTable.lat, lng: assetsTable.lng, departmentDetails: assetsTable.departmentDetails,
    teamName: teamsTable.name, workerName: usersTable.name,
  }).from(stormJobsTable).innerJoin(assetsTable, eq(stormJobsTable.assetId, assetsTable.id))
    .leftJoin(teamsTable, eq(stormJobsTable.teamId, teamsTable.id))
    .leftJoin(usersTable, eq(stormJobsTable.assignedUserId, usersTable.id))
    .where(where).orderBy(asc(stormJobsTable.routeOrder), asc(stormJobsTable.createdAt)));
  if (!jobs.length) return jobs.map(job => ({ ...job, workTypes: [] as string[] }));
  const results = await executeWithCircuitBreaker(() => db.select().from(stormCheckResultsTable).where(inArray(stormCheckResultsTable.stormJobId, jobs.map(job => job.id))));
  const types = new Map<string, string[]>();
  for (const result of results) types.set(result.stormJobId, [...(types.get(result.stormJobId) ?? []), result.workType]);
  return jobs.map(job => ({ ...job, workTypes: types.get(job.id) ?? [] }));
}

router.post("/storm-patrol/assets/import/preview", requireAuth, requireRole("manager"), workbookUpload.single("workbook"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "Attach the 7 September Storm Patrol .xlsx workbook." }); return; }
    const inspection = await inspectStormAssetWorkbook(req.file.buffer);
    res.json({
      batchKey: inspection.batchKey,
      valid: inspection.errors.length === 0,
      summary: {
        totalRows: inspection.rows.length,
        validRows: inspection.rows.filter(row => !row.error).length,
        invalidRows: inspection.rows.filter(row => row.error).length,
        warnings: inspection.warnings.length,
        alreadyImported: inspection.alreadyImported,
      },
      errors: inspection.errors,
      warnings: inspection.warnings,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to read workbook." });
  }
});

router.post("/storm-patrol/assets/import/commit", requireAuth, requireRole("manager"), workbookUpload.single("workbook"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "Attach the reviewed workbook again to confirm import." }); return; }
    const inspection = await inspectStormAssetWorkbook(req.file.buffer);
    const submittedKey = String(req.body?.batchKey ?? "");
    if (!/^[a-f0-9]{64}$/.test(submittedKey) || submittedKey !== inspection.batchKey) {
      res.status(409).json({ error: "This workbook differs from the reviewed file. Preview it again." }); return;
    }
    if (inspection.errors.length) { res.status(422).json({ error: "Workbook validation failed.", errors: inspection.errors }); return; }
    if (inspection.alreadyImported) {
      res.json({ batchKey: inspection.batchKey, created: 0, updated: 0, alreadyImported: true });
      return;
    }
    const result = await executeWithCircuitBreaker(() => db.transaction(async tx => {
      let created = 0;
      let updated = 0;
      for (const row of inspection.rows) {
        const values = {
          globalId: row.globalId,
          name: row.name,
          department: "stormwater",
          gardenType: null,
          standard: null,
          areaM2: null,
          serviceTimeMins: null,
          frequency: null,
          isSchedulable: false,
          departmentDetails: {
            placemarkId: row.placemarkId,
            contractor: row.contractor,
            assetType: row.assetType,
            priority: row.priority,
            hotspot: row.hotspot,
            importFingerprint: inspection.batchKey,
          },
          teamId: null,
          siteType: null,
          suburb: row.suburb,
          streetAddress: row.streetAddress,
          lat: row.lat,
          lng: row.lng,
          routeOrder: row.routeOrder,
          description: row.description,
          isActive: true,
          updatedAt: new Date(),
        } as const;
        const existing = inspection.existingByGlobalId.get(row.globalId);
        if (existing) {
          await tx.update(assetsTable).set(values).where(eq(assetsTable.id, existing.id));
          updated++;
        } else {
          await tx.insert(assetsTable).values(values);
          created++;
        }
      }
      return { created, updated };
    }));
    await auditLog({ tableName: "stormwater_asset_import", recordId: null, action: "INSERT", changedById: req.auth!.userId, newData: { batchKey: inspection.batchKey, ...result } });
    res.status(201).json({ batchKey: inspection.batchKey, ...result, alreadyImported: false });
  } catch (error) {
    console.error("POST /storm-patrol/assets/import/commit error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unable to import workbook." });
  }
});

router.get("/storm-patrol/current", requireAuth, async (req, res) => {
  const event = await activeEvent();
  if (!event) { res.json({ data: null }); return; }
  const where = !privileged(req.auth!.role) ? and(eq(stormJobsTable.eventId, event.id), eq(stormJobsTable.teamId, req.auth!.teamId ?? "")) : eq(stormJobsTable.eventId, event.id);
  const jobs = await enrichedStormJobs(where);
  const completed = jobs.filter(j => j.status === "completed" || j.status === "too_dangerous");
  const minutes = completed.reduce((n, j) => n + (j.actualTimeMins ?? 0), 0);
  const [observations, followUps, alerts] = await Promise.all([
    executeWithCircuitBreaker(() => db.select().from(stormObservationsTable).where(eq(stormObservationsTable.eventId, event.id)).orderBy(desc(stormObservationsTable.createdAt))),
    executeWithCircuitBreaker(() => db.select().from(reactiveJobsTable).where(and(eq(reactiveJobsTable.stormEventId, event.id), eq(reactiveJobsTable.origin, "storm_patrol"))).orderBy(desc(reactiveJobsTable.createdAt))),
    executeWithCircuitBreaker(() => db.select().from(stormAlertsTable).where(eq(stormAlertsTable.eventId, event.id)).orderBy(desc(stormAlertsTable.createdAt))),
  ]);
  const reactiveJobIds = observations
    .map(observation => observation.reactiveJobId)
    .filter((id): id is string => Boolean(id));
  const observationPhotos = reactiveJobIds.length > 0
    ? await executeWithCircuitBreaker(() => db.select({
      id: stormPhotosTable.id,
      reactiveJobId: stormPhotosTable.reactiveJobId,
      purpose: stormPhotosTable.purpose,
      blobUrl: stormPhotosTable.blobUrl,
      caption: stormPhotosTable.caption,
      createdAt: stormPhotosTable.createdAt,
    }).from(stormPhotosTable).where(and(
      inArray(stormPhotosTable.reactiveJobId, reactiveJobIds),
      eq(stormPhotosTable.purpose, "observation"),
    )))
    : [];
  const photosByReactiveJobId = new Map<string, typeof observationPhotos>();
  for (const photo of observationPhotos) {
    if (!photo.reactiveJobId) continue;
    const photos = photosByReactiveJobId.get(photo.reactiveJobId) ?? [];
    photos.push(photo);
    photosByReactiveJobId.set(photo.reactiveJobId, photos);
  }
  const observationsWithPhotos = observations.map(observation => ({
    ...observation,
    photos: observation.reactiveJobId ? photosByReactiveJobId.get(observation.reactiveJobId) ?? [] : [],
  }));
  res.json({ data: { event, jobs, observations: observationsWithPhotos, followUps, alerts, summary: { selectedCount: jobs.length, checkedCount: completed.length, workMinutes: minutes, labourChargeCents: cents(minutes, event.hourlyRateCents), tooDangerousCount: jobs.filter(j => j.status === "too_dangerous").length } } });
});

router.get("/storm-patrol/events", requireAuth, requireRole("manager", "supervisor"), async (_req, res) => {
  res.json({ data: await executeWithCircuitBreaker(() => db.select().from(stormEventsTable).orderBy(desc(stormEventsTable.createdAt))) });
});

router.post("/storm-patrol/events", requireAuth, requireRole("manager"), validateBody(z.object({ name: z.string().trim().min(1).max(200), activate: z.boolean().default(true), hourlyRateCents: z.number().int().min(0).optional() })), async (req, res) => {
  const body = req.body as { name: string; activate: boolean; hourlyRateCents?: number };
  try {
    const event = await executeWithCircuitBreaker(() => db.transaction(async tx => {
      const rate = body.hourlyRateCents ?? (await tx.select().from(stormPatrolSettingsTable).limit(1))[0]?.hourlyRateCents ?? 0;
      const [row] = await tx.insert(stormEventsTable).values({ name: body.name, status: body.activate ? "active" : "draft", hourlyRateCents: rate, createdById: req.auth!.userId, activatedById: body.activate ? req.auth!.userId : null, activatedAt: body.activate ? new Date() : null }).returning();
      return row;
    }));
    await auditLog({ tableName: "storm_events", recordId: event.id, action: "INSERT", changedById: req.auth!.userId, newData: event as any });
    res.status(201).json(event);
  } catch (error: any) {
    if (error?.code === "23505") { res.status(409).json({ error: "Only one Storm Patrol event may be active." }); return; }
    throw error;
  }
});

router.post("/storm-patrol/events/:id/close", requireAuth, requireRole("manager"), async (req, res) => {
  const id = String(req.params.id);
  const [event] = await executeWithCircuitBreaker(() => db.update(stormEventsTable).set({ status: "closed", closedAt: new Date(), closedById: req.auth!.userId, updatedAt: new Date() }).where(and(eq(stormEventsTable.id, id), eq(stormEventsTable.status, "active"))).returning());
  if (!event) { res.status(409).json({ error: "Only an active event can be closed." }); return; }
  await auditLog({ tableName: "storm_events", recordId: id, action: "UPDATE", changedById: req.auth!.userId, newData: event as any });
  res.json(event);
});
router.post("/storm-patrol/events/:id/activate", requireAuth, requireRole("manager"), async (req, res) => {
  const id = String(req.params.id);
  try {
    const [event] = await executeWithCircuitBreaker(() => db.update(stormEventsTable).set({ status: "active", activatedAt: new Date(), activatedById: req.auth!.userId, updatedAt: new Date() }).where(and(eq(stormEventsTable.id, id), eq(stormEventsTable.status, "draft"))).returning());
    if (!event) { res.status(409).json({ error: "Only draft events can be activated." }); return; }
    await auditLog({ tableName: "storm_events", recordId: id, action: "UPDATE", changedById: req.auth!.userId, newData: event as any });
    res.json(event);
  } catch (error: any) {
    if (error?.code === "23505") { res.status(409).json({ error: "Only one Storm Patrol event may be active." }); return; }
    throw error;
  }
});

router.get("/storm-patrol/settings", requireAuth, requireRole("manager"), async (_req, res) => {
  const [row] = await executeWithCircuitBreaker(() => db.select().from(stormPatrolSettingsTable).limit(1));
  res.json(row ?? { id: 1, hourlyRateCents: 0 });
});
router.put("/storm-patrol/settings", requireAuth, requireRole("manager"), validateBody(z.object({ hourlyRateCents: z.number().int().min(0) })), async (req, res) => {
  const [row] = await executeWithCircuitBreaker(() => db.insert(stormPatrolSettingsTable).values({ id: 1, hourlyRateCents: req.body.hourlyRateCents, updatedById: req.auth!.userId, updatedAt: new Date() }).onConflictDoUpdate({ target: stormPatrolSettingsTable.id, set: { hourlyRateCents: req.body.hourlyRateCents, updatedById: req.auth!.userId, updatedAt: new Date() } }).returning());
  await auditLog({ tableName: "storm_patrol_settings", recordId: null, action: "UPDATE", changedById: req.auth!.userId, newData: row as any });
  res.json(row);
});

router.post("/storm-patrol/events/:id/packages", requireAuth, requireRole("manager"), validateBody(z.object({ phase: phases, teamId: z.string().uuid(), assetIds: z.array(z.string().uuid()).min(1), idempotencyKey: z.string().min(1).max(200).optional() })), async (req, res) => {
  const eventId = String(req.params.id); const body = req.body as { phase: z.infer<typeof phases>; teamId: string; assetIds: string[] };
  if (new Set(body.assetIds).size !== body.assetIds.length) { res.status(400).json({ error: "An asset can only be assigned once in a package." }); return; }
  try {
    const result = await executeWithCircuitBreaker(() => db.transaction(async tx => {
      const [event, team] = await Promise.all([tx.select().from(stormEventsTable).where(and(eq(stormEventsTable.id, eventId), eq(stormEventsTable.status, "active"))).limit(1), tx.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.id, body.teamId)).limit(1)]);
      if (!event[0]) throw new Error("EVENT_INACTIVE"); if (!team[0]) throw new Error("TEAM_INVALID");
      const assets = await tx.select({ id: assetsTable.id, department: assetsTable.department, isActive: assetsTable.isActive, routeOrder: assetsTable.routeOrder }).from(assetsTable).where(inArray(assetsTable.id, body.assetIds));
      if (!arePublishableStormwaterAssets(assets, body.assetIds.length)) throw new Error("ASSET_INVALID");
      const [pack] = await tx.insert(stormWorkPackagesTable).values({ eventId, phase: body.phase, teamId: body.teamId, createdById: req.auth!.userId, status: "published", publishedAt: new Date() }).returning();
      const order = new Map(assets.map(a => [a.id, a.routeOrder]));
      const jobs = await tx.insert(stormJobsTable).values(body.assetIds.map(assetId => ({ eventId, workPackageId: pack.id, phase: body.phase, assetId, teamId: body.teamId, routeOrder: order.get(assetId) ?? null }))).returning();
      return { package: pack, jobs };
    }));
    await auditLog({ tableName: "storm_work_packages", recordId: result.package.id, action: "INSERT", changedById: req.auth!.userId, newData: result.package as any });
    res.status(201).json(result);
  } catch (error: any) {
    const message = error?.message;
    if (error?.code === "23505" || message === "ASSET_INVALID" || message === "TEAM_INVALID" || message === "EVENT_INACTIVE") { res.status(message === "ASSET_INVALID" ? 400 : 409).json({ error: message === "ASSET_INVALID" ? "Packages require active Stormwater assets." : message === "TEAM_INVALID" ? "Team not found." : message === "EVENT_INACTIVE" ? "Event is not active." : "An asset is already assigned for this event phase." }); return; }
    throw error;
  }
});

router.get("/storm-patrol/jobs", requireAuth, validateQuery(z.object({ eventId: z.string().uuid().optional(), phase: phases.optional(), status: z.enum(["pending", "in_progress", "completed", "too_dangerous"]).optional() })), async (req, res) => {
  const q = res.locals.query as any; const conditions: any[] = [];
  if (q.eventId) conditions.push(eq(stormJobsTable.eventId, q.eventId)); if (q.phase) conditions.push(eq(stormJobsTable.phase, q.phase)); if (q.status) conditions.push(eq(stormJobsTable.status, q.status));
  if (!privileged(req.auth!.role)) conditions.push(eq(stormJobsTable.teamId, req.auth!.teamId ?? ""));
  res.json({ data: await enrichedStormJobs(conditions.length ? and(...conditions) : undefined) });
});

router.post("/storm-patrol/jobs/:id/claim", requireAuth, async (req, res) => {
  const id = String(req.params.id); const mine = await ownJob(id, req.auth!.userId, req.auth!.teamId, req.auth!.role); if (mine.error) { res.status(mine.error).json({ error: mine.error === 404 ? "Storm job not found" : "Forbidden" }); return; }
  const [job] = await executeWithCircuitBreaker(() => db.update(stormJobsTable).set({ assignedUserId: req.auth!.userId, status: "in_progress", startedAt: new Date(), updatedAt: new Date() }).where(and(eq(stormJobsTable.id, id), eq(stormJobsTable.status, "pending"), isNull(stormJobsTable.assignedUserId))).returning());
  if (!job) { res.status(409).json({ error: "This job has already been claimed or started." }); return; }
  await auditLog({ tableName: "storm_jobs", recordId: id, action: "UPDATE", changedById: req.auth!.userId, newData: job as any }); res.json(job);
});

const completion = z.object({ outcome: z.enum(["completed", "too_dangerous"]), actualTimeMins: z.number().int().min(0), comments: z.string().max(10000).optional(), workTypes: z.array(workTypes).default([]), idempotencyKey: z.string().min(1).max(200), dangerousReason: z.string().min(1).optional(), locationLat: z.number().optional(), locationLng: z.number().optional() }).superRefine((v, c) => {
  if (v.outcome === "too_dangerous" && !v.dangerousReason) c.addIssue({ code: "custom", message: "A dangerous reason is required.", path: ["dangerousReason"] });
  if (v.outcome === "completed" && requiresStormVisualCheckComments(v.workTypes, v.comments)) c.addIssue({ code: "custom", message: "Comments are required when Visual check only is selected.", path: ["comments"] });
});
router.post("/storm-patrol/jobs/:id/complete", requireAuth, validateBody(completion), async (req, res) => {
  const id = String(req.params.id); const body = req.body as z.infer<typeof completion>; const mine = await ownJob(id, req.auth!.userId, req.auth!.teamId, req.auth!.role);
  if (mine.error) { res.status(mine.error).json({ error: mine.error === 404 ? "Storm job not found" : "Forbidden" }); return; }
  const result = await executeWithCircuitBreaker(() => db.transaction(async tx => {
    const prior = await tx.select().from(stormJobsTable).where(eq(stormJobsTable.idempotencyKey, body.idempotencyKey)).limit(1); if (prior[0]) return { job: prior[0], replayed: true };
    const [job] = await tx.update(stormJobsTable).set({ status: body.outcome, actualTimeMins: body.actualTimeMins, comments: body.comments ?? null, completedAt: new Date(), syncedAt: new Date(), idempotencyKey: body.idempotencyKey, updatedAt: new Date() }).where(and(eq(stormJobsTable.id, id), eq(stormJobsTable.assignedUserId, req.auth!.userId), eq(stormJobsTable.status, "in_progress"))).returning();
    if (!job) throw new Error("NOT_CLAIMED");
    if (body.workTypes.length) await tx.insert(stormCheckResultsTable).values([...new Set(body.workTypes)].map(workType => ({ stormJobId: job.id, workType })));
    let followUp = null;
    if (body.outcome === "too_dangerous") [followUp] = await tx.insert(reactiveJobsTable).values({ assetId: job.assetId, raisedById: req.auth!.userId, issueType: "Storm Patrol site too dangerous", description: body.dangerousReason!, priority: "urgent", origin: "storm_patrol", stormEventId: job.eventId, stormSourceJobId: job.id, locationLat: body.locationLat ?? null, locationLng: body.locationLng ?? null, idempotencyKey: `storm-danger:${body.idempotencyKey}` }).returning();
    return { job, followUp, replayed: false };
  })).catch((error: any) => { if (error?.message === "NOT_CLAIMED") return null; throw error; });
  if (!result) { res.status(409).json({ error: "Job must be claimed and in progress before completion." }); return; }
  if (!result.replayed) await auditLog({ tableName: "storm_jobs", recordId: result.job.id, action: "UPDATE", changedById: req.auth!.userId, newData: result.job as any });
  res.json(result);
});

router.post("/storm-patrol/observations", requireAuth, validateBody(z.object({ eventId: z.string().uuid(), assetId: z.string().uuid().optional(), sourceJobId: z.string().uuid().optional(), description: z.string().min(1), notes: z.string().optional(), locationLat: z.number(), locationLng: z.number(), idempotencyKey: z.string().min(1).max(200) })), async (req, res) => {
  const b = req.body as any;
  try {
    const result = await executeWithCircuitBreaker(() => db.transaction(async tx => {
      const existing = await tx.select().from(stormObservationsTable).where(eq(stormObservationsTable.idempotencyKey, b.idempotencyKey)).limit(1); if (existing[0]) return { observation: existing[0], replayed: true };
      const [reactive] = await tx.insert(reactiveJobsTable).values({ assetId: b.assetId ?? null, raisedById: req.auth!.userId, issueType: "Storm Patrol observation", description: b.description, notes: b.notes ?? null, locationLat: b.locationLat, locationLng: b.locationLng, origin: "storm_patrol", stormEventId: b.eventId, stormSourceJobId: b.sourceJobId ?? null, idempotencyKey: `storm-observation:${b.idempotencyKey}` }).returning();
      const [observation] = await tx.insert(stormObservationsTable).values({ ...b, raisedById: req.auth!.userId, reactiveJobId: reactive.id }).returning(); return { observation, reactiveJob: reactive, replayed: false };
    })); res.status(result.replayed ? 200 : 201).json(result);
  } catch (e: any) { if (e?.code === "23505") { res.status(409).json({ error: "Duplicate observation." }); return; } throw e; }
});
router.post("/storm-patrol/observations/photos", requireAuth, stormPhotoUpload, async (req, res) => {
  if (!req.file) {
    console.warn("[storm-photo-upload-missing]", JSON.stringify(safeUploadContext(req)));
    res.status(400).json({ error: "Photo is required." }); return;
  }
  const observationKey = typeof req.body.observationIdempotencyKey === "string" ? req.body.observationIdempotencyKey : "";
  const [observation] = await executeWithCircuitBreaker(() => db.select().from(stormObservationsTable).where(and(eq(stormObservationsTable.idempotencyKey, observationKey), eq(stormObservationsTable.raisedById, req.auth!.userId))).limit(1));
  if (!observation) { res.status(404).json({ error: "Observation must sync before its photo." }); return; }
  const key = typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : randomUUID();
  const [old] = await executeWithCircuitBreaker(() => db.select().from(stormPhotosTable).where(eq(stormPhotosTable.idempotencyKey, key)).limit(1));
  if (old) { res.json(old); return; }
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID; if (!bucketId) { res.status(503).json({ error: "Object storage is not configured." }); return; }
  const objectName = `uploads/storm-patrol/${randomUUID()}`;
  await objectStorageClient.bucket(bucketId).file(objectName).save(req.file.buffer, { metadata: { contentType: req.file.mimetype }, resumable: false });
  const [photo] = await executeWithCircuitBreaker(() => db.insert(stormPhotosTable).values({ reactiveJobId: observation.reactiveJobId, purpose: "observation", blobUrl: `/api/uploads/${objectName}`, uploadedById: req.auth!.userId, idempotencyKey: key }).returning());
  res.status(201).json(photo);
});

router.post("/storm-patrol/alerts", requireAuth, validateBody(z.object({ eventId: z.string().uuid(), stormJobId: z.string().uuid().optional(), message: z.string().min(1), photoUrl: z.string().optional(), idempotencyKey: z.string().min(1).max(200) })), async (req, res) => {
  const b = req.body as any; const [existing] = await executeWithCircuitBreaker(() => db.select().from(stormAlertsTable).where(eq(stormAlertsTable.idempotencyKey, b.idempotencyKey)).limit(1));
  if (existing) { res.json(existing); return; }
  const [alert] = await executeWithCircuitBreaker(() => db.insert(stormAlertsTable).values({ ...b, raisedById: req.auth!.userId }).returning());
  const recipients = await executeWithCircuitBreaker(() => db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.role, managers as any)));
  void notifyUsers(recipients.map(r => r.id), { title: "Urgent Storm Patrol issue", body: b.message, data: { eventId: b.eventId, alertId: alert.id } });
  void deliverStormAlertEmail(alert.id);
  res.status(201).json(alert);
});
router.post("/storm-patrol/alerts/:id/acknowledge", requireAuth, requireRole("manager"), async (req, res) => {
  const [alert] = await executeWithCircuitBreaker(() => db.update(stormAlertsTable).set({ acknowledgedAt: new Date(), acknowledgedById: req.auth!.userId }).where(eq(stormAlertsTable.id, String(req.params.id))).returning());
  if (!alert) { res.status(404).json({ error: "Alert not found" }); return; } res.json(alert);
});
router.get("/storm-patrol/alerts", requireAuth, requireRole("manager", "supervisor"), validateQuery(z.object({ eventId: z.string().uuid().optional() })), async (_req, res) => {
  const eventId = res.locals.query.eventId as string | undefined;
  res.json({ data: await executeWithCircuitBreaker(() => db.select().from(stormAlertsTable).where(eventId ? eq(stormAlertsTable.eventId, eventId) : undefined).orderBy(desc(stormAlertsTable.createdAt))) });
});
router.post("/storm-patrol/alerts/:id/retry-email", requireAuth, requireRole("manager"), async (req, res) => {
  const id = String(req.params.id);
  const [alert] = await executeWithCircuitBreaker(() =>
    db.select().from(stormAlertsTable).where(eq(stormAlertsTable.id, id)).limit(1),
  );
  if (!alert) { res.status(404).json({ error: "Alert not found" }); return; }
  await deliverStormAlertEmail(id);
  const [updated] = await executeWithCircuitBreaker(() =>
    db.select().from(stormAlertsTable).where(eq(stormAlertsTable.id, id)).limit(1),
  );
  res.json(updated);
});

router.post("/storm-patrol/jobs/:id/photos", requireAuth, stormPhotoUpload, async (req, res) => {
  if (!req.file) {
    console.warn("[storm-photo-upload-missing]", JSON.stringify(safeUploadContext(req)));
    res.status(400).json({ error: "Photo is required." }); return;
  }
  const mine = await ownJob(String(req.params.id), req.auth!.userId, req.auth!.teamId, req.auth!.role); if (mine.error) { res.status(mine.error).json({ error: "Forbidden" }); return; }
  const purpose = z.enum(["before", "after", "urgent_issue", "new_flooding", "new_slip", "observation"]).safeParse(req.body.purpose); if (!purpose.success) { res.status(400).json({ error: "Valid photo purpose is required." }); return; }
  const key = typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : randomUUID(); const [old] = await executeWithCircuitBreaker(() => db.select().from(stormPhotosTable).where(eq(stormPhotosTable.idempotencyKey, key)).limit(1)); if (old) { res.json(old); return; }
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID; if (!bucketId) { res.status(503).json({ error: "Object storage is not configured." }); return; }
  const objectName = `uploads/storm-patrol/${randomUUID()}`; await objectStorageClient.bucket(bucketId).file(objectName).save(req.file.buffer, { metadata: { contentType: req.file.mimetype }, resumable: false });
  const [photo] = await executeWithCircuitBreaker(() => db.insert(stormPhotosTable).values({ stormJobId: String(req.params.id), purpose: purpose.data, blobUrl: `/api/uploads/${objectName}`, caption: typeof req.body.caption === "string" ? req.body.caption : null, uploadedById: req.auth!.userId, idempotencyKey: key }).returning()); res.status(201).json(photo);
});

router.get("/storm-patrol/events/:id/report", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  const [event] = await executeWithCircuitBreaker(() => db.select().from(stormEventsTable).where(eq(stormEventsTable.id, String(req.params.id))).limit(1));
  if (!event) { res.status(404).json({ error: "Storm event not found" }); return; }
  const jobs = await enrichedStormJobs(eq(stormJobsTable.eventId, event.id));
  const minutes = jobs.reduce((n, j) => n + (j.actualTimeMins ?? 0), 0);
  const report = { event, selectedCount: jobs.length, checkedCount: jobs.filter(j => ["completed", "too_dangerous"].includes(j.status)).length, totalMinutes: minutes, totalHours: minutes / 60, labourChargeCents: cents(minutes, event.hourlyRateCents), jobs };
  if (req.query.format === "csv") {
    const headers = ["jobId", "storm", "phase", "status", "asset", "team", "worker", "workTypes", "comments", "minutes", "chargeCents"];
    const rows = jobs.map(job => [job.id, event.name, job.phase, job.status, job.assetName, job.teamName, job.workerName, job.workTypes.join("; "), job.comments, job.actualTimeMins ?? 0, cents(job.actualTimeMins ?? 0, event.hourlyRateCents)].map(escapeCsvCell).join(","));
    res.type("text/csv").attachment(`storm-patrol-${event.id}.csv`).send([headers.join(","), ...rows].join("\r\n")); return;
  }
  if (req.query.format === "pdf") {
    const PDFDocument = (await import("pdfkit")).default; const doc = new PDFDocument({ margin: 48 });
    res.type("application/pdf").attachment(`storm-patrol-${event.id}.pdf`); doc.pipe(res);
    doc.fontSize(20).text("Storm Patrol Report"); doc.moveDown().fontSize(13).text(event.name);
    doc.fontSize(10).text(`Selected sites: ${report.selectedCount}   Checked: ${report.checkedCount}`);
    doc.text(`Actual minutes: ${minutes}   Labour charge: $${(report.labourChargeCents / 100).toFixed(2)}`);
    doc.moveDown().fontSize(11).text("Checks");
    for (const job of jobs) doc.fontSize(9).text(`${job.phase.toUpperCase()} — ${job.assetName} — ${job.teamName ?? "Unassigned"} — ${job.workerName ?? "Unclaimed"} — ${job.workTypes.join(", ") || "No work type"} — ${job.actualTimeMins ?? 0} minutes`);
    doc.end(); return;
  }
  res.json(report);
});

export default router;
