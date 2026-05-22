import { Router } from "express";
import multer from "multer";
import path from "path";
import { db, jobPhotosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

// GET /api/jobs/:id/photos
router.get("/jobs/:id/photos", requireAuth, async (req, res) => {
  const jobId = String(req.params.id);
  const photos = await db
    .select()
    .from(jobPhotosTable)
    .where(eq(jobPhotosTable.jobId, jobId));
  res.json({ data: photos });
});

// POST /api/jobs/:id/photos
router.post(
  "/jobs/:id/photos",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    const jobId = String(req.params.id);
    if (!req.file) {
      res.status(400).json({ error: "No photo uploaded" });
      return;
    }
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorised" });
      return;
    }
    const blobUrl = `/api/uploads/${req.file.filename}`;
    const caption =
      typeof req.body.caption === "string" ? req.body.caption : null;
    const [photo] = await db
      .insert(jobPhotosTable)
      .values({ jobId, uploadedBy: userId, blobUrl, caption })
      .returning();
    res.status(201).json(photo);
  },
);

export default router;
