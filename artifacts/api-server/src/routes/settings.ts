import { Router } from "express";
import { db, assetsTable, systemSettingsTable, teamsTable, teamMembersTable } from "@workspace/db";
import { eq, isNotNull, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { nearestNeighbourRoute } from "../lib/geo";

const router = Router();

// GET /api/settings
router.get("/settings", requireAuth, async (_req, res) => {
  const [row] = await db.select().from(systemSettingsTable).limit(1);
  if (!row) {
    res.json({ id: 1, productiveTimeMins: 390, standardCrewSize: 2, workStartHour: 8, workEndHour: 16, mulchDecayRateMmPerMonth: 5, mulchSpreadingRateM3PerHour: 2, reactivePriorities: null, routesLastOptimised: null });
    return;
  }
  res.json(row);
});

const reactivePrioritySchema = z.object({
  id:           z.string(),
  emoji:        z.string(),
  label:        z.string(),
  responseTime: z.string(),
  description:  z.string(),
  color:        z.string(),
  bg:           z.string(),
});

const patchSettingsSchema = z.object({
  productiveTimeMins:         z.number().int().min(60).max(600).optional(),
  standardCrewSize:           z.number().int().min(1).max(10).optional(),
  workStartHour:              z.number().min(5).max(12).optional(),
  workEndHour:                z.number().min(12).max(22).optional(),
  reactivePriorities:         z.array(reactivePrioritySchema).optional(),
  mulchDecayRateMmPerMonth:   z.number().min(0.1).max(50).optional(),
  mulchSpreadingRateM3PerHour: z.number().min(0.1).max(20).optional(),
  infillPlantingRates:        z.record(z.string(), z.number().min(0).max(999)).optional(),
  auditQuotaCompletedWorksCount: z.number().int().min(0).max(100).optional(),
  auditQuotaOutcomesBasedCount:  z.number().int().min(0).max(100).optional(),
});

// PATCH /api/settings
router.patch(
  "/settings",
  requireAuth,
  requireRole("manager"),
  validateBody(patchSettingsSchema),
  async (req, res) => {
    const patch = req.body as z.infer<typeof patchSettingsSchema>;

    // Audit quota counts are manager/administrator only
    if (
      (patch.auditQuotaCompletedWorksCount !== undefined ||
       patch.auditQuotaOutcomesBasedCount  !== undefined) &&
      !["manager", "administrator"].includes(req.auth!.role)
    ) {
      res.status(403).json({ error: "Only managers can change audit quota settings" });
      return;
    }

    const [updated] = await db
      .insert(systemSettingsTable)
      .values({ id: 1, ...patch, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettingsTable.id,
        set: { ...patch, updatedAt: new Date() },
      })
      .returning();

    res.json(updated);
  },
);

// POST /api/assets/optimise-routes
// Runs nearest-neighbour geosequencing per team and updates route_order on all assets.
router.post(
  "/assets/optimise-routes",
  requireAuth,
  requireRole("manager"),
  async (_req, res) => {
    const teams = await db.select().from(teamsTable);

    let totalAssetsUpdated = 0;

    for (const team of teams) {
      // Load all active assets for this team that have coordinates
      const assets = await db
        .select({
          id:  assetsTable.id,
          lat: assetsTable.lat,
          lng: assetsTable.lng,
        })
        .from(assetsTable)
        .where(
          and(
            eq(assetsTable.teamId, team.id),
            eq(assetsTable.isActive, true),
          ),
        );

      // Separate assets with and without coordinates
      const withCoords = assets
        .filter(a => a.lat != null && a.lng != null)
        .map(a => ({
          id:  a.id,
          lat: parseFloat(String(a.lat)),
          lng: parseFloat(String(a.lng)),
        }))
        .filter(a => !isNaN(a.lat) && !isNaN(a.lng));

      const withoutCoords = assets
        .filter(a => a.lat == null || a.lng == null)
        .map(a => a.id);

      // Compute 2-opt optimised route for assets with coordinates
      const orderedIds = nearestNeighbourRoute(withCoords);

      // Batch-update route_order in a single query using unnest
      const allIds    = [...orderedIds, ...withoutCoords];
      const allOrders = allIds.map((_, i) => i + 1);

      if (allIds.length > 0) {
        await db.execute(sql`
          UPDATE assets
          SET route_order = v.ord,
              updated_at  = NOW()
          FROM (
            SELECT unnest(${sql.raw(`ARRAY[${allIds.map(id => `'${id}'`).join(",")}]::uuid[]`)} ) AS id,
                   unnest(${sql.raw(`ARRAY[${allOrders.join(",")}]::int[]`)}               ) AS ord
          ) v
          WHERE assets.id = v.id
        `);
      }

      totalAssetsUpdated += assets.length;
    }

    // Record timestamp in system_settings
    await db
      .insert(systemSettingsTable)
      .values({ id: 1, routesLastOptimised: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettingsTable.id,
        set: { routesLastOptimised: new Date(), updatedAt: new Date() },
      });

    res.json({
      teamsOptimised:      teams.length,
      assetsUpdated:       totalAssetsUpdated,
      routesLastOptimised: new Date().toISOString(),
    });
  },
);

export default router;
