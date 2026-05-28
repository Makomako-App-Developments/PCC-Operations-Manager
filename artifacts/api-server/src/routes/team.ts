import { Router } from "express";
import { db, teamAvailabilityTable, teamMembersTable } from "@workspace/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateQuery } from "../middlewares/validate";
import { refreshCrewStatusForTeamDate, computeDayCapacity } from "../lib/crew-utils";

const router = Router();

const weekQuerySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const upsertSchema = z.object({
  personName: z.string().min(1),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hour:       z.number().int().min(8).max(16),
  status:     z.enum(["available", "annual_leave", "sick", "statutory_holiday", "unpaid_leave"]),
});

const deleteSchema = z.object({
  personName: z.string().min(1),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hour:       z.number().int().min(8).max(16),
});

async function getTeamIdForPerson(personName: string): Promise<string | null> {
  const [row] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.personName, personName))
    .limit(1);
  return row?.teamId ?? null;
}

// GET /api/team/availability?weekStart=YYYY-MM-DD
router.get(
  "/team/availability",
  requireAuth,
  validateQuery(weekQuerySchema),
  async (req, res) => {
    const { weekStart } = res.locals.query as { weekStart: string };
    const start = new Date(weekStart);
    const end   = new Date(start);
    end.setDate(end.getDate() + 6);

    const rows = await db
      .select()
      .from(teamAvailabilityTable)
      .where(
        and(
          gte(teamAvailabilityTable.date, weekStart),
          lte(teamAvailabilityTable.date, end.toISOString().slice(0, 10)),
        ),
      );

    res.json(rows);
  },
);

// PUT /api/team/availability — upsert one cell, then auto-refresh crew status
router.put(
  "/team/availability",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateBody(upsertSchema),
  async (req, res) => {
    const { personName, date, hour, status } = res.locals.body as z.infer<typeof upsertSchema>;

    if (status === "available") {
      await db
        .delete(teamAvailabilityTable)
        .where(
          and(
            eq(teamAvailabilityTable.personName, personName),
            eq(teamAvailabilityTable.date, date),
            eq(teamAvailabilityTable.hour, hour),
          ),
        );
    } else {
      await db
        .insert(teamAvailabilityTable)
        .values({ personName, date, hour, status })
        .onConflictDoUpdate({
          target: [
            teamAvailabilityTable.personName,
            teamAvailabilityTable.date,
            teamAvailabilityTable.hour,
          ],
          set: { status, updatedAt: new Date() },
        });
    }

    // Auto-refresh crew status on pending jobs for this person's team on this date
    const teamId = await getTeamIdForPerson(personName);
    let jobsRefreshed = 0;
    let capacityAfter: {
      totalScheduledMins: number;
      productiveTimeMins: number;
      utilizationPct: number;
    } | null = null;

    if (teamId) {
      jobsRefreshed = await refreshCrewStatusForTeamDate(teamId, date);

      // Calculate day capacity after the refresh so the client can warn if over-capacity
      capacityAfter = await computeDayCapacity(teamId, date);
    }

    res.json({ ok: true, jobsRefreshed, capacityAfter });
  },
);

export default router;
