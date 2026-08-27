import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { select, insert, executeWithCircuitBreaker } = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  executeWithCircuitBreaker: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
  db: { select, insert },
  executeWithCircuitBreaker,
}));

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = { userId: "manager-1", role: "manager", teamId: null, tokenType: "access" };
    next();
  },
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock("../lib/push-notifications", () => ({
  notifySupervisors: vi.fn(),
}));

import teamRouter from "../routes/team";
import { buildAbsenceDataForTeamDate, calcCrewAdjustment } from "../lib/crew-utils";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(teamRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  executeWithCircuitBreaker.mockImplementation((fn: () => unknown) => fn());
});

describe("Training availability", () => {
  it("accepts and persists training through the availability API", async () => {
    const values = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });
    insert.mockReturnValue({ values });

    const selectQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    select.mockReturnValue(selectQuery);

    const response = await request(buildApp())
      .put("/team/availability")
      .send({
        personName: "Alex Green",
        date: "2026-09-01",
        hour: 10,
        status: "training",
      });

    expect(response.status).toBe(200);
    expect(values).toHaveBeenCalledWith({
      personName: "Alex Green",
      date: "2026-09-01",
      hour: 10,
      status: "training",
    });
  });

  it("counts training hours as absence for crew status calculations", async () => {
    const membersQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { personName: "Alex Green", teamId: "team-1" },
        { personName: "Sam Blue", teamId: "team-1" },
      ]),
    };
    const availabilityQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(
        Array.from({ length: 5 }, (_, hour) => ({
          personName: "Alex Green",
          date: "2026-09-01",
          hour: hour + 8,
          status: "training",
        })),
      ),
    };
    select.mockReturnValueOnce(membersQuery).mockReturnValueOnce(availabilityQuery);

    const { membersByTeam, absenceMap } = await buildAbsenceDataForTeamDate("team-1", "2026-09-01");
    const result = calcCrewAdjustment(
      "team-1",
      "2026-09-01",
      membersByTeam,
      absenceMap,
      60,
      2,
    );

    expect(absenceMap.get("2026-09-01")).toEqual(new Set(["Alex Green"]));
    expect(result).toEqual({ estimatedTimeMins: 120, crewStatus: "reduced" });
  });
});