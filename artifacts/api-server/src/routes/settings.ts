import { Router } from "express";
import { db, assetsTable, systemSettingsTable, teamsTable, teamMembersTable } from "@workspace/db";
import { eq, isNotNull, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { nearestNeighbourRoute } from "../lib/geo";

const router = Router();

// GET /api/settings
router.get("/settings", requireAuth, async (_req, res) => {
  const [row] = await db.select().from(systemSettingsTable).limit(1);
  if (!row) {
    // Return defaults if not yet seeded
    res.json({ id: 1, productiveTimeMins: 390, standardCrewSize: 2, routesLastOptimised: null });
    return;
  }
  res.json(row);
});

const patchSettingsSchema = z.object({
  productiveTimeMins: z.number().int().min(60).max(600).optional(),
  standardCrewSize:   z.number().int().min(1).max(10).optional(),
});

// PATCH /api/settings
router.patch(
  "/settings",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(patchSettingsSchema),
  async (req, res) => {
    const patch = req.body as z.infer<typeof patchSettingsSchema>;

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
  requireRole("manager", "supervisor"),
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

      // Compute nearest-neighbour route for assets with coordinates
      const orderedIds = nearestNeighbourRoute(withCoords);

      // Update route_order: 1-based sequence
      let order = 1;
      for (const id of orderedIds) {
        await db
          .update(assetsTable)
          .set({ routeOrder: order++, updatedAt: new Date() })
          .where(eq(assetsTable.id, id));
      }

      // Assets without coordinates go to the end
      for (const id of withoutCoords) {
        await db
          .update(assetsTable)
          .set({ routeOrder: order++, updatedAt: new Date() })
          .where(eq(assetsTable.id, id));
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
