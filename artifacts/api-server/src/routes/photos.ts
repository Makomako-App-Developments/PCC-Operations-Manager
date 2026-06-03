import { Router } from "express";
import multer from "multer";
import path from "path";
import { db, jobPhotosTable, jobsTable, mulchingRecordsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const storage = multer.diskStorage({
  destination: path.resolve(process.cwd(), "uploads"),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

/** Resolve whether :id belongs to a regular job or a mulching record.
 *  Returns { kind: "job" } or { kind: "mulching" } or { kind: "unknown" }. */
async function resolveJobKind(id: string): Promise<"job" | "mulching" | "unknown"> {
  const [job] = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (job) return "job";
  const [mr] = await db.select({ id: mulchingRecordsTable.id }).from(mulchingRecordsTable).where(eq(mulchingRecordsTable.id, id)).limit(1);
  if (mr) return "mulching";
  return "unknown";
}

// GET /api/jobs/:id/photos
router.get("/jobs/:id/photos", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const kind = await resolveJobKind(id);

  let photos;
  if (kind === "mulching") {
    photos = await db
      .select()
      .from(jobPhotosTable)
      .where(eq(jobPhotosTable.mulchingRecordId, id));
  } else {
    photos = await db
      .select()
      .from(jobPhotosTable)
      .where(eq(jobPhotosTable.jobId, id));
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
    if (!req.file) {
      res.status(400).json({ error: "No photo uploaded" });
      return;
    }
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorised" });
      return;
    }

    const kind = await resolveJobKind(id);
    if (kind === "unknown") {
      res.status(404).json({ error: "Job or mulching record not found" });
      return;
    }

    const blobUrl = `/api/uploads/${req.file.filename}`;
    const caption =
      typeof req.body.caption === "string" ? req.body.caption : null;

    const values =
      kind === "mulching"
        ? { mulchingRecordId: id, uploadedBy: userId, blobUrl, caption }
        : { jobId: id, uploadedBy: userId, blobUrl, caption };

    const [photo] = await db
      .insert(jobPhotosTable)
      .values(values)
      .returning();

    res.status(201).json(photo);
  },
);

export default router;
