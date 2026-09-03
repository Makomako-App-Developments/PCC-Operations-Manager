import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const { insert, returning, executeWithCircuitBreaker } = vi.hoisted(() => ({
  insert: vi.fn(),
  returning: vi.fn(),
  executeWithCircuitBreaker: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
  db: { insert },
  executeWithCircuitBreaker,
}));

vi.mock("../middlewares/auth", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import teamsRouter from "./teams";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(teamsRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  returning.mockResolvedValue([{
    id: "4ccf103f-ec2d-4704-a85a-13f71bc928c4",
    name: "North mowing",
    department: "mowing",
    createdAt: "2026-09-03T00:00:00.000Z",
  }]);
  const values = vi.fn().mockReturnValue({ returning });
  insert.mockReturnValue({ values });
  executeWithCircuitBreaker.mockImplementation(async (fn) => fn());
});

describe("POST /teams department classification", () => {
  it("requires an official department and persists it", async () => {
    const missing = await request(buildApp())
      .post("/teams")
      .send({ name: "Missing department" });

    expect(missing.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();

    const created = await request(buildApp())
      .post("/teams")
      .send({ name: "North mowing", department: "mowing" });

    expect(created.status).toBe(201);
    expect(created.body.department).toBe("mowing");
    expect(insert.mock.results.at(-1)?.value.values).toHaveBeenCalledWith({
      name: "North mowing",
      department: "mowing",
    });
  });

  it("rejects department names outside the shared PCC list", async () => {
    const response = await request(buildApp())
      .post("/teams")
      .send({ name: "Old stormwater team", department: "stormwater" });

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});