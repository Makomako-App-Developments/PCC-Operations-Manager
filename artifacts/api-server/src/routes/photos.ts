import { Router, type Request } from "express";
import multer from "multer";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { db, jobPhotosTable, jobsTable, mulchingRecordsTable, reactiveJobsTable, executeWithCircuitBreaker } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { objectStorageClient } from "../lib/objectStorage";
import { reconcileUncommittedPhotoObject, removeUncommittedPhotoObject } from "../lib/photo-object-cleanup";

function logMissingAttachment(req: Request): void {
  console.warn("[field-attachment-upload-missing]", JSON.stringify({
    path: String(req.path ?? "").replace(/\/[0-9a-f-]{8,}/gi, "/:id"),
    contentType: req.get?.("content-type")?.split(";")[0] ?? "missing",
    contentLength: req.get?.("content-length") ?? "unknown",
    bodyFields: Object.keys(req.body ?? {}).sort(),
  }));
}

function isPrivilegedRole(role: string): boolean {
  return ["administrator", "manager", "supervisor"].includes(role);
}

const router = Router();

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const LEGACY_CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function inferLegacyAttachmentContentType(blobUrl: string): string | null {
  const pathname = blobUrl.split(/[?#]/, 1)[0] ?? "";
  return LEGACY_CONTENT_TYPES_BY_EXTENSION[path.extname(pathname).toLowerCase()] ?? null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed. Accepted: images, PDF, Word, Excel."));
  },
});

/** Upload buffer to GCS and return the blobUrl (/api/uploads/<objectName>). */
async function uploadToGCS(
  buffer: Buffer,
  mimetype: string,
  originalName: string,
  requestedObjectName?: string,
): Promise<string> {
  const bucketId = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");

  const ext = path.extname(originalName) || ".bin";
  const objectName = requestedObjectName ?? `uploads/${Date.now()}-${randomUUID()}${ext}`;

  const bucket = objectStorageClient.bucket(bucketId);
  const file = bucket.file(objectName);

  await file.save(buffer, {
    metadata: { contentType: mimetype },
    resumable: false,
  });

  return `/api/uploads/${objectName}`;
}

async function saveJobPhotoIdempotently(
  file: Express.Multer.File,
  values: Omit<typeof jobPhotosTable.$inferInsert, "blobUrl" | "contentType">,
  scope: string,
  idempotencyKey?: string,
  route: "scheduled" | "reactive" = "scheduled",
) {
  const photoValues = { ...values, contentType: file.mimetype.trim().toLowerCase() };
  if (!idempotencyKey) {
    const blobUrl = await uploadToGCS(file.buffer, file.mimetype, file.originalname);
    const objectName = blobUrl.slice("/api/uploads/".length);
    try {
      const [photo] = await executeWithCircuitBreaker(() => db.insert(jobPhotosTable).values({ ...photoValues, blobUrl }).returning());
      return photo;
    } catch (error) {
      await reconcileUncommittedPhotoObject(objectName, route, async () => {
        const [owner] = await executeWithCircuitBreaker(() => db.select({ id: jobPhotosTable.id }).from(jobPhotosTable)
          .where(eq(jobPhotosTable.blobUrl, blobUrl)).limit(1));
        if (!owner) await removeUncommittedPhotoObject(process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"]!, objectName, route);
      });
      throw error;
    }
  }
  const hash = createHash("sha256").update(`${scope}:${idempotencyKey}`).digest("hex");
  const objectName = `uploads/field-${hash}`;
  const blobUrl = `/api/uploads/${objectName}`;
  let uploaded = false;
  try {
    return await executeWithCircuitBreaker(() => db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${hash}))`);
      const [existing] = await tx.select().from(jobPhotosTable).where(eq(jobPhotosTable.blobUrl, blobUrl)).limit(1);
      if (existing) return existing;
      await uploadToGCS(file.buffer, file.mimetype, file.originalname, objectName);
      uploaded = true;
      const [photo] = await tx.insert(jobPhotosTable).values({ ...photoValues, blobUrl }).returning();
      return photo;
    }));
  } catch (error) {
    if (uploaded) {
      await reconcileUncommittedPhotoObject(objectName, route, () =>
        executeWithCircuitBreaker(() => db.transaction(async tx => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${hash}))`);
          const [owner] = await tx.select({ id: jobPhotosTable.id }).from(jobPhotosTable)
            .where(eq(jobPhotosTable.blobUrl, blobUrl)).limit(1);
          if (!owner) await removeUncommittedPhotoObject(process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"]!, objectName, route);
        })),
      );
    }
    throw error;
  }
}

async function withResolvedContentTypes(
  photos: (typeof jobPhotosTable.$inferSelect)[],
): Promise<(typeof jobPhotosTable.$inferSelect)[]> {
  const bucketId = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
  return Promise.all(photos.map(async photo => {
    if (photo.contentType) return photo;
    const legacyContentType = inferLegacyAttachmentContentType(photo.blobUrl);
    if (!bucketId || !photo.blobUrl.startsWith("/api/uploads/")) {
      return { ...photo, contentType: legacyContentType };
    }
    const objectName = photo.blobUrl.slice("/api/uploads/".length);
    try {
      const [metadata] = await objectStorageClient.bucket(bucketId).file(objectName).getMetadata();
      const contentType = typeof metadata.contentType === "string"
        ? metadata.contentType.trim().toLowerCase()
        : null;
      return { ...photo, contentType: contentType || legacyContentType };
    } catch {
      return { ...photo, contentType: legacyContentType };
    }
  }));
}

/** Resolve whether :id belongs to a regular job or a mulching record. */
async function resolveJobKind(id: string): Promise<"job" | "mulching" | "unknown"> {
  const [job] = await executeWithCircuitBreaker(() => db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1));
  if (job) return "job";
  const [mr] = await executeWithCircuitBreaker(() => db.select({ id: mulchingRecordsTable.id }).from(mulchingRecordsTable).where(eq(mulchingRecordsTable.id, id)).limit(1));
  if (mr) return "mulching";
  return "unknown";
}

// ── Regular / mulching job photos ─────────────────────────────────────────────

// GET /api/jobs/:id/photos
router.get("/jobs/:id/photos", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const kind = await resolveJobKind(id);
  if (kind === "unknown") { res.status(404).json({ error: "Job or mulching record not found" }); return; }

  if (kind === "job") {
    const [job] = await executeWithCircuitBreaker(() => db.select({ teamId: jobsTable.teamId, isAllTeams: jobsTable.isAllTeams, status: jobsTable.status }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1));
    if (job?.status === "draft" && !["administrator", "manager"].includes(req.auth!.role)) {
      res.status(404).json({ error: "Job not found" }); return;
    }
    if (!isPrivilegedRole(req.auth!.role) && job && !job.isAllTeams && job.teamId !== req.auth!.teamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  } else if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (kind === "mulching") {
      const [mr] = await executeWithCircuitBreaker(() => db.select({ assignedTeamId: mulchingRecordsTable.assignedTeamId }).from(mulchingRecordsTable).where(eq(mulchingRecordsTable.id, id)).limit(1));
      if (mr && mr.assignedTeamId !== callerTeamId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }
  }

  let photos;
  if (kind === "mulching") {
    photos = await executeWithCircuitBreaker(() => db.select().from(jobPhotosTable).where(eq(jobPhotosTable.mulchingRecordId, id)));
  } else {
    photos = await executeWithCircuitBreaker(() => db.select().from(jobPhotosTable).where(eq(jobPhotosTable.jobId, id)));
  }

  res.json({ data: await withResolvedContentTypes(photos) });
});

// POST /api/jobs/:id/photos
router.post(
  "/jobs/:id/photos",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    const id = String(req.params.id);
    if (!req.file) { logMissingAttachment(req); res.status(400).json({ error: "No file uploaded" }); return; }
    const userId = req.auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorised" }); return; }

    const kind = await resolveJobKind(id);
    if (kind === "unknown") { res.status(404).json({ error: "Job or mulching record not found" }); return; }

    if (kind === "job") {
      const [job] = await executeWithCircuitBreaker(() => db.select({ teamId: jobsTable.teamId, isAllTeams: jobsTable.isAllTeams, status: jobsTable.status, assignedUserId: jobsTable.assignedUserId }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1));
      if (job?.status === "draft") {
        res.status(409).json({ error: "Draft jobs cannot be changed until a manager places them" }); return;
      }
      if (!isPrivilegedRole(req.auth!.role) && job && !job.isAllTeams && job.teamId !== req.auth!.teamId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
      if (job && !job.isAllTeams && job.assignedUserId && job.assignedUserId !== userId) {
        res.status(409).json({ error: "This job has already been claimed by another team member.", code: "JOB_ALREADY_CLAIMED" }); return;
      }
    } else if (!isPrivilegedRole(req.auth!.role)) {
      const callerTeamId = req.auth!.teamId;
      if (kind === "mulching") {
        const [mr] = await executeWithCircuitBreaker(() => db.select({ assignedTeamId: mulchingRecordsTable.assignedTeamId }).from(mulchingRecordsTable).where(eq(mulchingRecordsTable.id, id)).limit(1));
        if (mr && mr.assignedTeamId !== callerTeamId) {
          res.status(403).json({ error: "Forbidden" }); return;
        }
      }
    }

    const caption = typeof req.body.caption === "string" ? req.body.caption : null;
    const idempotencyKey = typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : undefined;
    const values = kind === "mulching"
      ? { mulchingRecordId: id, uploadedBy: userId, caption }
      : { jobId: id, uploadedBy: userId, caption };

    const photo = await saveJobPhotoIdempotently(req.file, values, `${kind}:${id}:${userId}`, idempotencyKey, "scheduled");
    res.status(201).json(photo);
  },
);

// ── Reactive job attachments ───────────────────────────────────────────────────

// GET /api/reactive-jobs/:id/photos
router.get("/reactive-jobs/:id/photos", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [rj] = await executeWithCircuitBreaker(() => db.select({ id: reactiveJobsTable.id, assignedTeamId: reactiveJobsTable.assignedTeamId }).from(reactiveJobsTable).where(eq(reactiveJobsTable.id, id)).limit(1));
  if (!rj) { res.status(404).json({ error: "Reactive job not found" }); return; }

  if (!isPrivilegedRole(req.auth!.role)) {
    const callerTeamId = req.auth!.teamId;
    if (rj.assignedTeamId !== callerTeamId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }

  const photos = await executeWithCircuitBreaker(() => db.select().from(jobPhotosTable).where(eq(jobPhotosTable.reactiveJobId, id)));
  res.json({ data: await withResolvedContentTypes(photos) });
});

// POST /api/reactive-jobs/:id/photos
router.post(
  "/reactive-jobs/:id/photos",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    const id = String(req.params.id);
    if (!req.file) { logMissingAttachment(req); res.status(400).json({ error: "No file uploaded" }); return; }
    const userId = req.auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorised" }); return; }

    const [rj] = await executeWithCircuitBreaker(() => db.select({ id: reactiveJobsTable.id, assignedTeamId: reactiveJobsTable.assignedTeamId, assignedUserId: reactiveJobsTable.assignedUserId }).from(reactiveJobsTable).where(eq(reactiveJobsTable.id, id)).limit(1));
    if (!rj) { res.status(404).json({ error: "Reactive job not found" }); return; }

    if (!isPrivilegedRole(req.auth!.role)) {
      const callerTeamId = req.auth!.teamId;
      if (rj.assignedTeamId !== callerTeamId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }
    if (rj.assignedUserId && rj.assignedUserId !== userId) {
      res.status(409).json({ error: "This job has already been claimed by another team member.", code: "JOB_ALREADY_CLAIMED" }); return;
    }

    const caption = typeof req.body.caption === "string" ? req.body.caption : null;
    const idempotencyKey = typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : undefined;
    const photo = await saveJobPhotoIdempotently(
      req.file,
      { reactiveJobId: id, uploadedBy: userId, caption },
      `reactive-job:${id}:${userId}`,
      idempotencyKey,
      "reactive",
    );

    res.status(201).json(photo);
  },
);

export default router;
