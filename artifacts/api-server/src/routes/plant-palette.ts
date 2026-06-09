import { Router } from "express";
import { db, plantPaletteTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /api/plant-palette
router.get("/plant-palette", requireAuth, async (_req, res) => {
  const plants = await db
    .select()
    .from(plantPaletteTable)
    .orderBy(asc(plantPaletteTable.plantType), asc(plantPaletteTable.botanicalName));
  res.json(plants);
});

export default router;
