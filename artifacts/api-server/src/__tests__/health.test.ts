import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import healthRouter from "../routes/health";

// Mock the db module so tests run without a real database.
// executeWithCircuitBreaker is a transparent passthrough here — circuit-breaker
// unit tests live in lib/db/src/circuit-breaker.test.ts.
vi.mock("@workspace/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([]),
  },
  dbCircuitBreaker: {
    getState: vi.fn().mockReturnValue("CLOSED"),
    getOpenedAt: vi.fn().mockReturnValue(null),
  },
  executeWithCircuitBreaker: vi.fn().mockImplementation(
    async (fn: () => Promise<unknown>) => fn(),
  ),
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
  beforeEach(async () => {
    vi.resetAllMocks();
    // Restore passthrough after resetAllMocks clears the implementation.
    const { executeWithCircuitBreaker } = vi.mocked(
      await import("@workspace/db"),
    );
    executeWithCircuitBreaker.mockImplementation(
      async (fn: () => Promise<unknown>) => fn(),
    );
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
    vi.mocked(db.execute).mockRejectedValueOnce(
      new Error("connection refused") as never,
    );

    const res = await request(buildApp()).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready" });
  });

  it("returns 503 immediately when the circuit breaker is open", async () => {
    const { executeWithCircuitBreaker } = await import("@workspace/db");
    // Simulate the circuit breaker fast-failing
    vi.mocked(executeWithCircuitBreaker).mockRejectedValueOnce(
      Object.assign(
        new Error("Circuit breaker OPEN — database is temporarily unavailable"),
        { code: "CIRCUIT_OPEN" },
      ) as never,
    );

    const res = await request(buildApp()).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready" });
    expect(res.body.error).toMatch(/circuit breaker/i);
  });
});

describe("GET /health/ready — circuit breaker openedAt timestamp", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    // Restore passthrough after resetAllMocks clears the implementation.
    const { executeWithCircuitBreaker } = vi.mocked(await import("@workspace/db"));
    executeWithCircuitBreaker.mockImplementation(
      async (fn: () => Promise<unknown>) => fn(),
    );
  });

  it("includes openedAt (ISO string) and timeSinceOpenMs (number) when getOpenedAt() returns a timestamp", async () => {
    const openedAtMs = Date.now() - 5000; // opened 5 seconds ago
    const { executeWithCircuitBreaker, dbCircuitBreaker } = vi.mocked(
      await import("@workspace/db"),
    );
    // Simulate the circuit breaker fast-failing
    executeWithCircuitBreaker.mockRejectedValueOnce(
      Object.assign(
        new Error("Circuit breaker OPEN — database is temporarily unavailable"),
        { code: "CIRCUIT_OPEN" },
      ) as never,
    );
    dbCircuitBreaker.getState.mockReturnValue("OPEN");
    dbCircuitBreaker.getOpenedAt.mockReturnValue(openedAtMs);

    const res = await request(buildApp()).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready" });

    // openedAt must be a valid ISO 8601 string
    expect(typeof res.body.openedAt).toBe("string");
    expect(() => new Date(res.body.openedAt)).not.toThrow();
    expect(new Date(res.body.openedAt).toISOString()).toBe(res.body.openedAt);

    // timeSinceOpenMs must be a non-negative number
    expect(typeof res.body.timeSinceOpenMs).toBe("number");
    expect(res.body.timeSinceOpenMs).toBeGreaterThanOrEqual(0);
  });

  it("omits openedAt and timeSinceOpenMs when getOpenedAt() returns null (breaker CLOSED)", async () => {
    const { db, dbCircuitBreaker } = vi.mocked(await import("@workspace/db"));
    vi.mocked(db.execute).mockRejectedValueOnce(
      new Error("connection refused") as never,
    );
    dbCircuitBreaker.getState.mockReturnValue("CLOSED");
    dbCircuitBreaker.getOpenedAt.mockReturnValue(null);

    const res = await request(buildApp()).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready" });
    expect(res.body).not.toHaveProperty("openedAt");
    expect(res.body).not.toHaveProperty("timeSinceOpenMs");
  });
});

describe("GET /health/ready — HALF_OPEN state", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { executeWithCircuitBreaker } = vi.mocked(await import("@workspace/db"));
    executeWithCircuitBreaker.mockImplementation(
      async (fn: () => Promise<unknown>) => fn(),
    );
  });

  it("includes openedAt (ISO string) and timeSinceOpenMs (number) when cbState=HALF_OPEN and getOpenedAt() returns a timestamp", async () => {
    const openedAtMs = Date.now() - 12000; // opened 12 seconds ago
    const { executeWithCircuitBreaker, dbCircuitBreaker } = vi.mocked(
      await import("@workspace/db"),
    );
    // In HALF_OPEN the probe is let through, but the DB still fails
    executeWithCircuitBreaker.mockRejectedValueOnce(
      new Error("connection refused") as never,
    );
    dbCircuitBreaker.getState.mockReturnValue("HALF_OPEN");
    dbCircuitBreaker.getOpenedAt.mockReturnValue(openedAtMs);

    const res = await request(buildApp()).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready", cbState: "HALF_OPEN" });

    // openedAt must be a valid ISO 8601 string
    expect(typeof res.body.openedAt).toBe("string");
    expect(() => new Date(res.body.openedAt)).not.toThrow();
    expect(new Date(res.body.openedAt).toISOString()).toBe(res.body.openedAt);

    // timeSinceOpenMs must be a non-negative number
    expect(typeof res.body.timeSinceOpenMs).toBe("number");
    expect(res.body.timeSinceOpenMs).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /health — combined status", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { executeWithCircuitBreaker } = vi.mocked(await import("@workspace/db"));
    executeWithCircuitBreaker.mockImplementation(
      async (fn: () => Promise<unknown>) => fn(),
    );
  });

  it("returns 200 with version, uptimeMs, dbLatencyMs when db is up", async () => {
    const { db, dbCircuitBreaker } = vi.mocked(await import("@workspace/db"));
    vi.mocked(db.execute).mockResolvedValueOnce([] as never);
    dbCircuitBreaker.getState.mockReturnValue("CLOSED");

    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(typeof res.body.uptimeMs).toBe("number");
    expect(typeof res.body.dbLatencyMs).toBe("number");
    expect(res.body).not.toHaveProperty("openedAt");
    expect(res.body).not.toHaveProperty("timeSinceOpenMs");
  });

  it("returns 503 with openedAt (ISO string) and timeSinceOpenMs (number) when circuit breaker is open", async () => {
    const openedAtMs = Date.now() - 8000; // opened 8 seconds ago
    const { executeWithCircuitBreaker, dbCircuitBreaker } = vi.mocked(
      await import("@workspace/db"),
    );
    executeWithCircuitBreaker.mockRejectedValueOnce(
      Object.assign(
        new Error("Circuit breaker OPEN — database is temporarily unavailable"),
        { code: "CIRCUIT_OPEN" },
      ) as never,
    );
    dbCircuitBreaker.getState.mockReturnValue("OPEN");
    dbCircuitBreaker.getOpenedAt.mockReturnValue(openedAtMs);

    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", db: "unreachable" });

    // openedAt must be a valid ISO 8601 string
    expect(typeof res.body.openedAt).toBe("string");
    expect(() => new Date(res.body.openedAt)).not.toThrow();
    expect(new Date(res.body.openedAt).toISOString()).toBe(res.body.openedAt);

    // timeSinceOpenMs must be a non-negative number
    expect(typeof res.body.timeSinceOpenMs).toBe("number");
    expect(res.body.timeSinceOpenMs).toBeGreaterThanOrEqual(0);
  });

  it("returns 503 without openedAt or timeSinceOpenMs when getOpenedAt() is null", async () => {
    const { db, dbCircuitBreaker } = vi.mocked(await import("@workspace/db"));
    vi.mocked(db.execute).mockRejectedValueOnce(
      new Error("connection refused") as never,
    );
    dbCircuitBreaker.getState.mockReturnValue("CLOSED");
    dbCircuitBreaker.getOpenedAt.mockReturnValue(null);

    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded" });
    expect(res.body).not.toHaveProperty("openedAt");
    expect(res.body).not.toHaveProperty("timeSinceOpenMs");
  });

  it("returns 503 with openedAt (ISO string) and timeSinceOpenMs (number) when circuit breaker is HALF_OPEN", async () => {
    const openedAtMs = Date.now() - 15000; // opened 15 seconds ago
    const { executeWithCircuitBreaker, dbCircuitBreaker } = vi.mocked(
      await import("@workspace/db"),
    );
    // In HALF_OPEN the probe is let through, but the DB still fails
    executeWithCircuitBreaker.mockRejectedValueOnce(
      new Error("connection refused") as never,
    );
    dbCircuitBreaker.getState.mockReturnValue("HALF_OPEN");
    dbCircuitBreaker.getOpenedAt.mockReturnValue(openedAtMs);

    const res = await request(buildApp()).get("/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", db: "unreachable", cbState: "HALF_OPEN" });

    // openedAt must be a valid ISO 8601 string
    expect(typeof res.body.openedAt).toBe("string");
    expect(() => new Date(res.body.openedAt)).not.toThrow();
    expect(new Date(res.body.openedAt).toISOString()).toBe(res.body.openedAt);

    // timeSinceOpenMs must be a non-negative number
    expect(typeof res.body.timeSinceOpenMs).toBe("number");
    expect(res.body.timeSinceOpenMs).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /healthz", () => {
  it("returns legacy 200 ok", async () => {
    const res = await request(buildApp()).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});

describe("GET /health/ready — network partition", () => {
  /**
   * A network partition differs from a clean DB restart:
   *   - Existing TCP connections hang silently (no immediate error)
   *   - New connection attempts block until connectionTimeoutMillis (5 000 ms)
   *     then pg rejects with a timeout error
   *   - /health/ready must return 503 within that window — not hang forever
   *
   * We model this by making db.execute() reject after a short delay with a
   * timeout error (simulating connectionTimeoutMillis expiring), then verify
   * the route surfaces a 503 rather than hanging.
   */
  beforeEach(async () => {
    vi.resetAllMocks();
    // Restore passthrough
    const mod = await import("@workspace/db");
    vi.mocked(mod.executeWithCircuitBreaker).mockImplementation(
      async (fn: () => Promise<unknown>) => fn(),
    );
  });

  it("returns 503 when the DB is unreachable and the connection times out (partition scenario)", async () => {
    const { db } = await import("@workspace/db");
    const timeoutErr = new Error(
      "timeout expired — could not connect within 5000ms",
    );

    vi.mocked(db.execute).mockImplementationOnce(
      () =>
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(timeoutErr), 50),
        ),
    );

    const res = await request(buildApp()).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready" });
    expect(typeof res.body.error).toBe("string");
  });

  it("does not hang — resolves within a reasonable deadline even with a hung pool", async () => {
    const { db } = await import("@workspace/db");
    const timeoutErr = new Error("timeout expired");

    vi.mocked(db.execute).mockImplementationOnce(
      () =>
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(timeoutErr), 50),
        ),
    );

    const start = Date.now();
    const res = await request(buildApp()).get("/health/ready");
    const elapsed = Date.now() - start;

    expect(res.status).toBe(503);
    expect(elapsed).toBeLessThan(2000);
  });

  it("recovers and returns 200 once the partition clears", async () => {
    const { db } = await import("@workspace/db");
    const timeoutErr = new Error("timeout expired");

    vi.mocked(db.execute)
      .mockImplementationOnce(
        () =>
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(timeoutErr), 50),
          ),
      )
      .mockResolvedValueOnce([] as never);

    const app = buildApp();

    const downRes = await request(app).get("/health/ready");
    expect(downRes.status).toBe(503);

    const upRes = await request(app).get("/health/ready");
    expect(upRes.status).toBe(200);
    expect(upRes.body).toMatchObject({ status: "ready" });
  });
});

describe("GET /health/ready — DB restart recovery", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import("@workspace/db");
    vi.mocked(mod.executeWithCircuitBreaker).mockImplementation(
      async (fn: () => Promise<unknown>) => fn(),
    );
  });

  it("returns 503 with ECONNREFUSED error message while DB is down after restart", async () => {
    const { db } = await import("@workspace/db");
    const connRefused = new Error(
      "connect ECONNREFUSED 127.0.0.1:5432",
    ) as NodeJS.ErrnoException;
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
    const connRefused = new Error(
      "connect ECONNREFUSED 127.0.0.1:5432",
    ) as NodeJS.ErrnoException;
    connRefused.code = "ECONNREFUSED";

    vi.mocked(db.execute)
      .mockRejectedValueOnce(connRefused as never)
      .mockResolvedValueOnce([] as never);

    const app = buildApp();

    const downRes = await request(app).get("/health/ready");
    expect(downRes.status).toBe(503);
    expect(downRes.body.status).toBe("not_ready");

    const upRes = await request(app).get("/health/ready");
    expect(upRes.status).toBe(200);
    expect(upRes.body).toMatchObject({ status: "ready" });
    expect(typeof upRes.body.dbLatencyMs).toBe("number");
  });

  it("recovers cleanly across multiple down/up cycles", async () => {
    const { db } = await import("@workspace/db");
    const connRefused = new Error(
      "connect ECONNREFUSED 127.0.0.1:5432",
    ) as NodeJS.ErrnoException;
    connRefused.code = "ECONNREFUSED";

    vi.mocked(db.execute)
      .mockRejectedValueOnce(connRefused as never)
      .mockResolvedValueOnce([] as never)
      .mockRejectedValueOnce(connRefused as never)
      .mockResolvedValueOnce([] as never);

    const app = buildApp();

    expect((await request(app).get("/health/ready")).status).toBe(503);
    expect((await request(app).get("/health/ready")).status).toBe(200);
    expect((await request(app).get("/health/ready")).status).toBe(503);
    expect((await request(app).get("/health/ready")).status).toBe(200);
  });
});
