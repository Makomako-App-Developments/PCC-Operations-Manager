import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import healthRouter from "../routes/health";

// Mock the db module so tests run without a real database
vi.mock("@workspace/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([]),
  },
}));

function buildApp() {
  const app = express();
  app.use(healthRouter);
  return app;
}

describe("GET /health/live", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(buildApp()).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});

describe("GET /health/ready", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with dbLatencyMs when db is up", async () => {
    const { db } = await import("@workspace/db");
    vi.mocked(db.execute).mockResolvedValueOnce([] as never);

    const res = await request(buildApp()).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ready" });
    expect(typeof res.body.dbLatencyMs).toBe("number");
  });

  it("returns 503 when db throws", async () => {
    const { db } = await import("@workspace/db");
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("connection refused") as never);

    const res = await request(buildApp()).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready" });
  });
});

describe("GET /healthz", () => {
  it("returns legacy 200 ok", async () => {
    const res = await request(buildApp()).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});
