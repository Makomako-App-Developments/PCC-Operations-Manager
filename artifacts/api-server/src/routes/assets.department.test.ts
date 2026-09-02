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

  it("validates and normalizes department-specific specifications", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "asset-1", department: "mowing" }]);
    const values = vi.fn().mockReturnValue({ returning });
    insert.mockReturnValue({ values });

    const departments = [
      ["mowing", "mowingType", "amenity_turf", { areaM2: 20 }],
      ["stormwater", "stormwaterType", "swale", {}],
      ["sportsfields", "surfaceType", "natural_turf", { areaM2: 20 }],
      ["city_cleaning", "cleaningType", "litter_bin", {}],
    ] as const;

    for (const [department, key, value, extra] of departments) {
      const response = await request(buildApp()).post("/assets").send({
        ...validAsset,
        ...extra,
        department,
        gardenType: "amenity",
        standard: "medium",
        departmentDetails: { [key]: value },
      });
      expect(response.status).toBe(201);
      expect(values).toHaveBeenLastCalledWith(expect.objectContaining({
        department,
        gardenType: null,
        standard: null,
        departmentDetails: { [key]: value },
      }));
    }
  });

  it("rejects missing specifications and required areas", async () => {
    const missingSpecification = await request(buildApp()).post("/assets").send({
      ...validAsset,
      department: "stormwater",
      gardenType: undefined,
      standard: undefined,
      departmentDetails: {},
    });
    const missingArea = await request(buildApp()).post("/assets").send({
      ...validAsset,
      department: "sportsfields",
      gardenType: undefined,
      standard: undefined,
      areaM2: undefined,
      departmentDetails: { surfaceType: "natural_turf" },
    });

    expect(missingSpecification.status).toBe(400);
    expect(missingArea.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not clear Garden fields on an unrelated partial edit", async () => {
    const before = { id: "asset-1", ...validAsset, areaM2: "10", departmentDetails: null };
    const updated = { ...before, name: "Renamed Garden" };
    const firstSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([before]),
    };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const updateQuery = { set };
    select.mockReturnValueOnce(firstSelect);
    update.mockReturnValue(updateQuery);

    const response = await request(buildApp())
      .patch("/assets/asset-1")
      .send({ name: "Renamed Garden" });

    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      name: "Renamed Garden",
      departmentDetails: null,
    }));
    expect(set.mock.calls[0][0]).not.toHaveProperty("gardenType");
    expect(set.mock.calls[0][0]).not.toHaveProperty("standard");
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