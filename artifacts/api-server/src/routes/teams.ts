import { Router } from "express";
import { db, teamsTable, teamMembersTable, usersTable, insertTeamSchema } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { z } from "zod";

const router = Router();

// GET /api/teams
router.get("/teams", requireAuth, async (_req, res) => {
  const rows = await db.select().from(teamsTable);
  res.json(rows);
});

// GET /api/teams/with-counts
router.get("/teams/with-counts", requireAuth, async (_req, res) => {
  const rows = await db
    .select({
      id:           teamsTable.id,
      name:         teamsTable.name,
      createdAt:    teamsTable.createdAt,
      memberCount:  sql<number>`cast(count(${usersTable.id}) filter (where ${usersTable.isActive} = true) as int)`,
    })
    .from(teamsTable)
    .leftJoin(usersTable, eq(usersTable.teamId, teamsTable.id))
    .groupBy(teamsTable.id, teamsTable.name, teamsTable.createdAt);
  res.json(rows);
});

// GET /api/team-members — all crew members with hasAccount flag
router.get("/team-members", requireAuth, async (_req, res) => {
  const members = await db
    .select({
      id:         teamMembersTable.id,
      personName: teamMembersTable.personName,
      teamId:     teamMembersTable.teamId,
    })
    .from(teamMembersTable);

  const userNames = await db
    .select({ name: usersTable.name })
    .from(usersTable);

  const accountNameSet = new Set(userNames.map(u => u.name.toLowerCase().trim()));

  const result = members.map(m => ({
    ...m,
    hasAccount: accountNameSet.has(m.personName.toLowerCase().trim()),
  }));

  res.json(result);
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

// PATCH /api/teams/:id  — rename
router.patch(
  "/teams/:id",
  requireAuth,
  requireRole("manager"),
  validateBody(z.object({ name: z.string().min(1).max(100) })),
  async (req, res) => {
    const id = String(req.params.id);
    const [updated] = await db
      .update(teamsTable)
      .set({ name: (req.body as { name: string }).name })
      .where(eq(teamsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Team not found" }); return; }
    res.json(updated);
  },
);

// DELETE /api/teams/:id
router.delete(
  "/teams/:id",
  requireAuth,
  requireRole("manager"),
  async (req, res) => {
    const id = String(req.params.id);
    const [members] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(usersTable)
      .where(eq(usersTable.teamId, id));
    if (members && members.count > 0) {
      res.status(409).json({ error: `Cannot delete — ${members.count} staff member(s) still assigned to this team.` });
      return;
    }
    await db.delete(teamsTable).where(eq(teamsTable.id, id));
    res.status(204).end();
  },
);

export default router;
