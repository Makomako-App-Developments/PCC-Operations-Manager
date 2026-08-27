import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { db, jobPhotosTable, jobsTable, mulchingRecordsTable, reactiveJobsTable, executeWithCircuitBreaker } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { objectStorageClient } from "../lib/objectStorage";

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
): Promise<string> {
  const bucketId = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");

  const ext = path.extname(originalName) || ".bin";
  const objectName = `uploads/${Date.now()}-${randomUUID()}${ext}`;

  const bucket = objectStorageClient.bucket(bucketId);
  const file = bucket.file(objectName);

  await file.save(buffer, {
    metadata: { contentType: mimetype },
    resumable: false,
  });

  return `/api/uploads/${objectName}`;
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

  res.json({ data: photos });
});

// POST /api/jobs/:id/photos
router.post(
  "/jobs/:id/photos",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    const id = String(req.params.id);
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
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

    const blobUrl = await uploadToGCS(req.file.buffer, req.file.mimetype, req.file.originalname);
    const caption = typeof req.body.caption === "string" ? req.body.caption : null;
    const values = kind === "mulching"
      ? { mulchingRecordId: id, uploadedBy: userId, blobUrl, caption }
      : { jobId: id, uploadedBy: userId, blobUrl, caption };

    const [photo] = await executeWithCircuitBreaker(() => db.insert(jobPhotosTable).values(values).returning());
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
  res.json({ data: photos });
});

// POST /api/reactive-jobs/:id/photos
router.post(
  "/reactive-jobs/:id/photos",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    const id = String(req.params.id);
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
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

    const blobUrl = await uploadToGCS(req.file.buffer, req.file.mimetype, req.file.originalname);
    const caption = typeof req.body.caption === "string" ? req.body.caption : null;

    const [photo] = await executeWithCircuitBreaker(() => db
      .insert(jobPhotosTable)
      .values({ reactiveJobId: id, uploadedBy: userId, blobUrl, caption })
      .returning());

    res.status(201).json(photo);
  },
);

export default router;
