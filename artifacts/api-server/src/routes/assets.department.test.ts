import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, insert, update, executeWithCircuitBreaker, auditLog } = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  executeWithCircuitBreaker: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
  db: { select, insert, update },
  executeWithCircuitBreaker,
}));

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = { userId: "manager-1", role: "manager", teamId: null, tokenType: "access" };
    next();
  },
  requireRole: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock("../lib/audit", () => ({ auditLog }));

import assetsRouter from "./assets";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(assetsRouter);
  return app;
}

const validAsset = {
  name: "Test Garden",
  department: "garden",
  gardenType: "amenity",
  standard: "medium",
  areaM2: 10,
  serviceTimeMins: 30,
  frequency: "monthly",
};

beforeEach(() => {
  vi.clearAllMocks();
  executeWithCircuitBreaker.mockImplementation((fn: () => unknown) => fn());
  auditLog.mockResolvedValue(undefined);
});

describe("asset department/function", () => {
  it("requires a supported department when creating an asset", async () => {
    const missing = await request(buildApp())
      .post("/assets")
      .send({ ...validAsset, department: undefined });
    const invalid = await request(buildApp())
      .post("/assets")
      .send({ ...validAsset, department: "unknown_operation" });

    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("persists and returns the selected department", async () => {
    const created = { id: "asset-1", ...validAsset, areaM2: "10" };
    const returning = vi.fn().mockResolvedValue([created]);
    const values = vi.fn().mockReturnValue({ returning });
    insert.mockReturnValue({ values });

    const response = await request(buildApp()).post("/assets").send(validAsset);

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      department: "garden",
      areaM2: "10",
    }));
    expect(response.body.department).toBe("garden");
  });

  it("accepts a supported department filter and rejects unsupported values", async () => {
    const listQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
    };
    const countQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 0 }]),
    };
    select.mockReturnValueOnce(listQuery).mockReturnValueOnce(countQuery);

    const valid = await request(buildApp()).get("/assets?department=stormwater");
    const invalid = await request(buildApp()).get("/assets?department=unknown_operation");

    expect(valid.status).toBe(200);
    expect(valid.body.data).toEqual([]);
    expect(invalid.status).toBe(400);
  });

  it("labels department changes clearly in asset history", async () => {
    const historyQuery = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: "history-1",
        action: "UPDATE",
        changedAt: new Date("2026-09-03T00:00:00Z"),
        changedByName: "Test Manager",
        oldData: { ...validAsset, department: "garden" },
        newData: { ...validAsset, department: "mowing" },
      }]),
    };
    select.mockReturnValue(historyQuery);

    const response = await request(buildApp()).get("/assets/asset-1/history");

    expect(response.status).toBe(200);
    expect(response.body[0].changes).toContainEqual({
      field: "department",
      label: "Department / Function",
      old: "garden",
      new: "mowing",
    });
  });
});