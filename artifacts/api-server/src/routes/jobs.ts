import { Router } from "express";
import { db, jobsTable, reactiveJobsTable, insertJobSchema, insertReactiveJobSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";

const router = Router();

const jobQuerySchema = z.object({
  assetId:  z.string().uuid().optional(),
  teamId:   z.string().uuid().optional(),
  status:   z.string().optional(),
  from:     z.string().optional(),
  to:       z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
});

type JobQuery = z.infer<typeof jobQuerySchema>;

// GET /api/jobs
router.get("/jobs", requireAuth, validateQuery(jobQuerySchema), async (req, res) => {
  const { page, limit } = res.locals.query as JobQuery;
  const offset = (page - 1) * limit;
  const rows = await db.select().from(jobsTable).limit(limit).offset(offset);
  res.json({ data: rows, page, limit });
});

// GET /api/jobs/:id
router.get("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.json(job);
});

// POST /api/jobs
router.post("/jobs", requireAuth, requireRole("manager", "supervisor"), validateBody(insertJobSchema), async (req, res) => {
  const [created] = await db.insert(jobsTable).values(req.body).returning();
  res.status(201).json(created);
});

// PATCH /api/jobs/:id
router.patch("/jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [updated] = await db
    .update(jobsTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(jobsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Job not found" }); return; }
  res.json(updated);
});

// ── Reactive jobs ────────────────────────────────────────────────────────────

// GET /api/reactive-jobs
router.get("/reactive-jobs", requireAuth, async (_req, res) => {
  const rows = await db.select().from(reactiveJobsTable).limit(100);
  res.json({ data: rows });
});

// POST /api/reactive-jobs
router.post("/reactive-jobs", requireAuth, validateBody(insertReactiveJobSchema), async (req, res) => {
  const [created] = await db
    .insert(reactiveJobsTable)
    .values({ ...req.body, raisedById: req.auth!.userId })
    .returning();
  res.status(201).json(created);
});

// PATCH /api/reactive-jobs/:id
router.patch("/reactive-jobs/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const [updated] = await db
    .update(reactiveJobsTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(reactiveJobsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Reactive job not found" }); return; }
  res.json(updated);
});

export default router;
