import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response } from "express";
import { dbCircuitBreakerMiddleware } from "../middlewares/dbCircuitBreaker";

// Mock @workspace/db so the middleware can be imported without a real DB.
vi.mock("@workspace/db", () => ({
  dbCircuitBreaker: {
    getState: vi.fn().mockReturnValue("CLOSED"),
  },
}));

function buildApp() {
  const app = express();
  app.use("/api", dbCircuitBreakerMiddleware);
  // Stub routes to verify requests pass through when CB is closed.
  app.get("/api/jobs", (_req: Request, res: Response) =>
    res.json({ ok: true }),
  );
  app.get("/api/health/ready", (_req: Request, res: Response) =>
    res.json({ status: "ready" }),
  );
  app.get("/api/healthz", (_req: Request, res: Response) =>
    res.json({ status: "ok" }),
  );
  return app;
}

describe("dbCircuitBreakerMiddleware — CLOSED state", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { dbCircuitBreaker } = await import("@workspace/db");
    vi.mocked(dbCircuitBreaker.getState).mockReturnValue("CLOSED");
  });

  it("passes through regular API routes when circuit is closed", async () => {
    const res = await request(buildApp()).get("/api/jobs");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("always passes through /health/ready regardless of CB state", async () => {
    const { dbCircuitBreaker } = await import("@workspace/db");
    vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");

    const res = await request(buildApp()).get("/api/health/ready");
    // Should reach the stub handler, not be rejected by middleware.
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ready" });
    // getState should NOT have been called (health routes bypass the check).
    expect(dbCircuitBreaker.getState).not.toHaveBeenCalled();
  });

  it("always passes through /healthz regardless of CB state", async () => {
    const { dbCircuitBreaker } = await import("@workspace/db");
    vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");

    const res = await request(buildApp()).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(dbCircuitBreaker.getState).not.toHaveBeenCalled();
  });
});

describe("dbCircuitBreakerMiddleware — OPEN state", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { dbCircuitBreaker } = await import("@workspace/db");
    vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
  });

  it("returns 503 for regular API routes when circuit is OPEN", async () => {
    const res = await request(buildApp()).get("/api/jobs");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("temporarily unreachable"),
      cbState: "OPEN",
    });
  });

  it("includes cbState in the 503 response body", async () => {
    const res = await request(buildApp()).get("/api/jobs");
    expect(res.body.cbState).toBe("OPEN");
  });
});

describe("dbCircuitBreakerMiddleware — HALF_OPEN state", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { dbCircuitBreaker } = await import("@workspace/db");
    vi.mocked(dbCircuitBreaker.getState).mockReturnValue("HALF_OPEN");
  });

  it("returns 503 for regular API routes when circuit is HALF_OPEN", async () => {
    const res = await request(buildApp()).get("/api/jobs");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("temporarily unreachable"),
      cbState: "HALF_OPEN",
    });
  });

  it("still passes through /health routes during HALF_OPEN so the probe can close the circuit", async () => {
    const res = await request(buildApp()).get("/api/health/ready");
    expect(res.status).toBe(200);
  });
});
