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

describe("GET /health/ready — DB restart recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 503 with ECONNREFUSED error message while DB is down after restart", async () => {
    const { db } = await import("@workspace/db");
    const connRefused = new Error("connect ECONNREFUSED 127.0.0.1:5432") as NodeJS.ErrnoException;
    connRefused.code = "ECONNREFUSED";
    vi.mocked(db.execute).mockRejectedValueOnce(connRefused as never);

    const res = await request(buildApp()).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: "not_ready",
      error: expect.stringContaining("ECONNREFUSED"),
    });
  });

  it("returns 200 on the next request once DB comes back up — no process restart needed", async () => {
    const { db } = await import("@workspace/db");
    const connRefused = new Error("connect ECONNREFUSED 127.0.0.1:5432") as NodeJS.ErrnoException;
    connRefused.code = "ECONNREFUSED";

    // First call: DB is down
    vi.mocked(db.execute).mockRejectedValueOnce(connRefused as never);
    // Second call: DB has restarted and accepted a fresh connection
    vi.mocked(db.execute).mockResolvedValueOnce([] as never);

    const app = buildApp();

    // During outage → 503
    const downRes = await request(app).get("/health/ready");
    expect(downRes.status).toBe(503);
    expect(downRes.body.status).toBe("not_ready");

    // After DB restart → 200, no process restart required
    const upRes = await request(app).get("/health/ready");
    expect(upRes.status).toBe(200);
    expect(upRes.body).toMatchObject({ status: "ready" });
    expect(typeof upRes.body.dbLatencyMs).toBe("number");
  });

  it("recovers cleanly across multiple down/up cycles", async () => {
    const { db } = await import("@workspace/db");
    const connRefused = new Error("connect ECONNREFUSED 127.0.0.1:5432") as NodeJS.ErrnoException;
    connRefused.code = "ECONNREFUSED";

    vi.mocked(db.execute)
      // cycle 1: down then up
      .mockRejectedValueOnce(connRefused as never)
      .mockResolvedValueOnce([] as never)
      // cycle 2: down then up again
      .mockRejectedValueOnce(connRefused as never)
      .mockResolvedValueOnce([] as never);

    const app = buildApp();

    expect((await request(app).get("/health/ready")).status).toBe(503);
    expect((await request(app).get("/health/ready")).status).toBe(200);
    expect((await request(app).get("/health/ready")).status).toBe(503);
    expect((await request(app).get("/health/ready")).status).toBe(200);
  });
});
