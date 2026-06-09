import { Router } from "express";
import { db, plantPaletteTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

// GET /api/plant-palette
router.get("/plant-palette", requireAuth, async (_req, res) => {
  const plants = await db
    .select()
    .from(plantPaletteTable)
    .orderBy(asc(plantPaletteTable.plantType), asc(plantPaletteTable.botanicalName));
  res.json(plants);
});

const bodySchema = z.object({
  botanicalName: z.string().min(1).max(200),
  plantType: z.string().min(1).max(100),
});

// POST /api/plant-palette
router.post("/plant-palette", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [row] = await db.insert(plantPaletteTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// PATCH /api/plant-palette/:id
router.patch("/plant-palette/:id", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  const { id } = req.params;
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [row] = await db
    .update(plantPaletteTable)
    .set(parsed.data)
    .where(eq(plantPaletteTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /api/plant-palette/:id
router.delete("/plant-palette/:id", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
  const { id } = req.params;
  await db.delete(plantPaletteTable).where(eq(plantPaletteTable.id, id));
  res.status(204).send();
});

export default router;
