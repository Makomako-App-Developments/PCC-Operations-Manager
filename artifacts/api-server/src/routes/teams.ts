import { Router } from "express";
import { db, teamsTable, usersTable, insertTeamSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";

const router = Router();

// GET /api/teams
router.get("/teams", requireAuth, async (_req, res) => {
  const rows = await db.select().from(teamsTable);
  res.json(rows);
});

// GET /api/teams/:id/members
router.get("/teams/:id/members", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const members = await db
    .select({
      id:       usersTable.id,
      name:     usersTable.name,
      initials: usersTable.initials,
      role:     usersTable.role,
      email:    usersTable.email,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.teamId, id));
  res.json(members);
});

// POST /api/teams
router.post("/teams", requireAuth, requireRole("manager"), validateBody(insertTeamSchema), async (req, res) => {
  const [created] = await db.insert(teamsTable).values(req.body).returning();
  res.status(201).json(created);
});

export default router;
