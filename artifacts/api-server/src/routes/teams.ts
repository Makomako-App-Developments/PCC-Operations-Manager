import { Router } from "express";
import { db, teamsTable, teamMembersTable, usersTable, assetsTable, systemSettingsTable, insertTeamSchema } from "@workspace/db";
import { eq, sql, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { z } from "zod";

const router = Router();

// GET /api/teams
router.get("/teams", requireAuth, async (_req, res) => {
  const rows = await db.select().from(teamsTable);
  res.json(rows);
});

// GET /api/teams/workload
// Must be before /teams/:id to avoid wildcard conflict.
// Returns per-team asset stats: site count, area m², annual service hours, FTE requirement.
// Includes a synthetic "All Teams" row for null-teamId (full-team) assets.
router.get("/teams/workload", requireAuth, requireRole("manager", "supervisor"), async (_req, res) => {
  // FTE basis: standard full-time hours (matches dashboard calculation)
  // Service times are calibrated for a crew of standardCrewSize people working together,
  // so total person-hours = elapsed hours × standardCrewSize.
  const ANNUAL_FTE_HOURS = 52 * 5 * 8; // 2080 hrs/FTE/year (gross full-time basis)

  // System settings for productive time + crew size
  const [settings] = await db.select({
    productiveTimeMins: systemSettingsTable.productiveTimeMins,
    standardCrewSize:   systemSettingsTable.standardCrewSize,
  }).from(systemSettingsTable).limit(1);
  const productiveTimeMins = settings?.productiveTimeMins ?? 390;
  const standardCrewSize   = settings?.standardCrewSize   ?? 2;
  const annualFteHours = ANNUAL_FTE_HOURS;

  // Aggregate per-team stats using SQL CASE for freq → annual visits
  const freqCase = sql<number>`
    CASE ${assetsTable.frequency}
      WHEN 'weekly'      THEN 365.0 / 7
      WHEN 'fortnightly' THEN 365.0 / 14
      WHEN 'monthly'     THEN 365.0 / 28
      WHEN 'bimonthly'   THEN 365.0 / 56
      WHEN 'quarterly'   THEN 365.0 / 91
      ELSE                    365.0 / 28
    END
  `;

  const teamRows = await db
    .select({
      teamId:      assetsTable.teamId,
      siteCount:   sql<number>`cast(count(*) as int)`,
      totalAreaM2: sql<number>`cast(coalesce(sum(${assetsTable.areaM2}), 0) as numeric)`,
      annualHours: sql<number>`cast(coalesce(sum(${assetsTable.serviceTimeMins} / 60.0 * (${freqCase})), 0) as numeric)`,
    })
    .from(assetsTable)
    .where(sql`${assetsTable.isActive} = true`)
    .groupBy(assetsTable.teamId);

  const teams = await db.select({ id: teamsTable.id, name: teamsTable.name }).from(teamsTable);
  const teamNameMap = Object.fromEntries(teams.map(t => [t.id, t.name]));

  const result = teamRows.map(row => {
    const annualHours = Number(row.annualHours);
    return {
      teamId:       row.teamId,
      teamName:     row.teamId ? (teamNameMap[row.teamId] ?? "Unknown") : "All Teams",
      siteCount:    Number(row.siteCount),
      totalAreaM2:  Math.round(Number(row.totalAreaM2)),
      annualHours:  Math.round(annualHours),
      ftesRequired: annualFteHours > 0 ? Math.round((annualHours * standardCrewSize / annualFteHours) * 100) / 100 : 0,
    };
  });

  // Sort: named teams first (alphabetically), "All Teams" last
  result.sort((a, b) => {
    if (a.teamId === null) return 1;
    if (b.teamId === null) return -1;
    return a.teamName.localeCompare(b.teamName);
  });

  res.json({
    rows: result,
    meta: { productiveTimeMins, standardCrewSize, annualFteHours: Math.round(annualFteHours * 10) / 10 },
  });
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

// GET /api/team-members — crew roster + system account users, merged and deduplicated
router.get("/team-members", requireAuth, requireRole("manager", "supervisor"), async (_req, res) => {
  const crewRows = await db
    .select({
      id:         teamMembersTable.id,
      personName: teamMembersTable.personName,
      teamId:     teamMembersTable.teamId,
      role:       teamMembersTable.role,
    })
    .from(teamMembersTable);

  const accountRows = await db
    .select({
      id:     usersTable.id,
      name:   usersTable.name,
      teamId: usersTable.teamId,
      role:   usersTable.role,
    })
    .from(usersTable)
    .where(sql`${usersTable.teamId} is not null`);

  // Team-scoped composite key: only deduplicate within the same team
  const crewTeamNameSet = new Set(crewRows.map(m => `${m.teamId}:${m.personName.toLowerCase().trim()}`));

  const crewWithFlag = crewRows.map(m => {
    // Match account user by name AND same team (avoid cross-team name collisions)
    const match = accountRows.find(
      u => u.name.toLowerCase().trim() === m.personName.toLowerCase().trim() && u.teamId === m.teamId,
    );
    return {
      id:         m.id,
      userId:     match?.id ?? null,
      personName: m.personName,
      teamId:     m.teamId,
      hasAccount: !!match,
      role:       match?.role ?? (m.role as string),
    };
  });

  const accountOnly = accountRows
    .filter(u => u.teamId && !crewTeamNameSet.has(`${u.teamId}:${u.name.toLowerCase().trim()}`))
    .map(u => ({
      id:         u.id,
      userId:     u.id,
      personName: u.name,
      teamId:     u.teamId as string,
      hasAccount: true,
      role:       u.role as string,
    }));

  res.json([...crewWithFlag, ...accountOnly]);
});

// POST /api/team-members — add a crew-only member to a team
router.post(
  "/team-members",
  requireAuth,
  requireRole("manager"),
  validateBody(z.object({
    personName: z.string().min(1).max(100),
    teamId:     z.string().uuid(),
    initials:   z.string().max(4).optional(),
    role:       z.enum(["field_worker", "supervisor"]).optional().default("field_worker"),
  })),
  async (req, res) => {
    const { personName, teamId, role, initials: rawInitials } = req.body as { personName: string; teamId: string; role: "field_worker" | "supervisor"; initials?: string };
    const trimmedName = personName.trim();
    // Derive initials from name if not provided
    const initials = rawInitials?.trim() ||
      trimmedName.split(/\s+/).map(n => n[0]?.toUpperCase() ?? "").join("").slice(0, 4) || trimmedName[0]?.toUpperCase() || "?";
    const [created] = await db
      .insert(teamMembersTable)
      .values({ personName: trimmedName, teamId, role, initials })
      .returning();
    res.status(201).json(created);
  },
);

// DELETE /api/team-members/:id — remove a crew-only member
router.delete(
  "/team-members/:id",
  requireAuth,
  requireRole("manager"),
  async (req, res) => {
    const id = String(req.params.id);
    await db.delete(teamMembersTable).where(eq(teamMembersTable.id, id));
    res.status(204).end();
  },
);

// GET /api/teams/:id/members
router.get("/teams/:id/members", requireAuth, requireRole("manager", "supervisor"), async (req, res) => {
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
    // Unassign account users from the team, delete crew members, then delete the team
    await db.update(usersTable).set({ teamId: null }).where(eq(usersTable.teamId, id));
    await db.delete(teamMembersTable).where(eq(teamMembersTable.teamId, id));
    await db.delete(teamsTable).where(eq(teamsTable.id, id));
    res.status(204).end();
  },
);

export default router;
