import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const { select, executeWithCircuitBreaker } = vi.hoisted(() => ({
  select: vi.fn(),
  executeWithCircuitBreaker: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
  db: { select },
  executeWithCircuitBreaker,
}));

vi.mock("../middlewares/auth", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import teamsRouter from "../routes/teams";

beforeEach(() => {
  vi.clearAllMocks();
});

function buildApp() {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = {
      userId: "test-user",
      role: "field_worker",
      teamId: null,
      tokenType: "access",
    };
    next();
  });
  app.use(teamsRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(503).json({
      error: "Database temporarily unavailable — please retry in a few seconds",
    });
  });
  return app;
}

describe("GET /teams transient database restart recovery", () => {
  it("opts into one safe-read retry and returns the recovered teams", async () => {
    const query = {
      from: vi.fn(),
    };
    select.mockReturnValue(query);
    query.from
      .mockRejectedValueOnce(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }))
      .mockResolvedValueOnce([{ id: "team-1", name: "North" }]);
    executeWithCircuitBreaker.mockImplementation(async (fn, options) => {
      const first = await fn().catch((err) => {
        if (!options?.safeRead) throw err;
        return fn();
      });
      return first;
    });

    const res = await request(buildApp()).get("/teams");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "team-1", name: "North" }]);
    expect(query.from).toHaveBeenCalledTimes(2);
    expect(executeWithCircuitBreaker).toHaveBeenCalledWith(
      expect.any(Function),
      { safeRead: true },
    );
  });

  it("does not retry a write operation", async () => {
    const write = vi.fn().mockRejectedValue(
      Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }),
    );
    executeWithCircuitBreaker.mockImplementation(async (fn, options) => {
      expect(options?.safeRead).not.toBe(true);
      return fn();
    });

    await expect(executeWithCircuitBreaker(write)).rejects.toMatchObject({ code: "57P01" });
    expect(write).toHaveBeenCalledOnce();
  });
});