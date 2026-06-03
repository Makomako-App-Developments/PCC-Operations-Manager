import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, jobPhotosTable, jobsTable, mulchingRecordsTable, reactiveJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed. Accepted: images, PDF, Word, Excel."));
  },
});

/** Resolve whether :id belongs to a regular job or a mulching record. */
async function resolveJobKind(id: string): Promise<"job" | "mulching" | "unknown"> {
  const [job] = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (job) return "job";
  const [mr] = await db.select({ id: mulchingRecordsTable.id }).from(mulchingRecordsTable).where(eq(mulchingRecordsTable.id, id)).limit(1);
  if (mr) return "mulching";
  return "unknown";
}

// ── Regular / mulching job photos ─────────────────────────────────────────────

// GET /api/jobs/:id/photos
router.get("/jobs/:id/photos", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const kind = await resolveJobKind(id);

  let photos;
  if (kind === "mulching") {
    photos = await db.select().from(jobPhotosTable).where(eq(jobPhotosTable.mulchingRecordId, id));
  } else {
    photos = await db.select().from(jobPhotosTable).where(eq(jobPhotosTable.jobId, id));
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

    const blobUrl = `/api/uploads/${req.file.filename}`;
    const caption = typeof req.body.caption === "string" ? req.body.caption : null;
    const values = kind === "mulching"
      ? { mulchingRecordId: id, uploadedBy: userId, blobUrl, caption }
      : { jobId: id, uploadedBy: userId, blobUrl, caption };

    const [photo] = await db.insert(jobPhotosTable).values(values).returning();
    res.status(201).json(photo);
  },
);

// ── Reactive job attachments ───────────────────────────────────────────────────

// GET /api/reactive-jobs/:id/photos
router.get("/reactive-jobs/:id/photos", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [rj] = await db.select({ id: reactiveJobsTable.id }).from(reactiveJobsTable).where(eq(reactiveJobsTable.id, id)).limit(1);
  if (!rj) { res.status(404).json({ error: "Reactive job not found" }); return; }

  const photos = await db.select().from(jobPhotosTable).where(eq(jobPhotosTable.reactiveJobId, id));
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

    const [rj] = await db.select({ id: reactiveJobsTable.id }).from(reactiveJobsTable).where(eq(reactiveJobsTable.id, id)).limit(1);
    if (!rj) { res.status(404).json({ error: "Reactive job not found" }); return; }

    const blobUrl = `/api/uploads/${req.file.filename}`;
    const caption = typeof req.body.caption === "string" ? req.body.caption : null;

    const [photo] = await db
      .insert(jobPhotosTable)
      .values({ reactiveJobId: id, uploadedBy: userId, blobUrl, caption })
      .returning();

    res.status(201).json(photo);
  },
);

export default router;
