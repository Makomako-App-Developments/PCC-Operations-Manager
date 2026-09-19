import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { z } from "zod";
import {
  GetFullHealthResponse,
  GetLivenessResponse,
  GetReadinessResponse,
} from "@workspace/api-zod";
import healthRouter from "../routes/health";
import authRouter from "../routes/auth";

const ErrorResponseSchema = z.object({
  error: z.string(),
});

vi.mock("@workspace/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([]),
  },
  usersTable: {},
  executeWithCircuitBreaker: vi.fn().mockImplementation(
    async (fn: () => Promise<unknown>) => fn(),
  ),
  dbCircuitBreaker: {
    getState: vi.fn().mockReturnValue("CLOSED"),
    getOpenedAt: vi.fn().mockReturnValue(null),
  },
}));

vi.mock("../lib/audit", () => ({
  getAuditFailureCount: vi.fn().mockReturnValue(0),
  getAuditFailureCounts: vi.fn().mockReturnValue({
    required: 0,
    bestEffort: 0,
  }),
}));

function buildHealthApp() {
  const app = express();
  app.use(healthRouter);
  return app;
}

function buildAuthApp() {
  const app = express();
  app.use(express.json());
  app.use(authRouter);
  return app;
}

/**
 * Keep response validation failures actionable. A plain Zod assertion usually
 * only reports an issue path; including the HTTP route and contract export
 * makes contract drift straightforward to diagnose from CI output.
 */
function expectResponseToMatch(
  route: string,
  schemaName: string,
  schema: { safeParse: (value: unknown) => { success: boolean; error?: unknown } },
  body: unknown,
) {
  const result = schema.safeParse(body);
  expect(
    result.success,
    `${route} response does not match generated ${schemaName}: ${JSON.stringify(result.error)}`,
  ).toBe(true);
}

describe("API response contracts", () => {
  it("validates the liveness response against the generated schema", async () => {
    const res = await request(buildHealthApp()).get("/health/live");

    expect(res.status).toBe(200);
    expectResponseToMatch(
      "GET /health/live",
      "GetLivenessResponse",
      GetLivenessResponse,
      res.body,
    );
  });

  it("validates the readiness response against the generated schema", async () => {
    const res = await request(buildHealthApp()).get("/health/ready");

    expect(res.status).toBe(200);
    expectResponseToMatch(
      "GET /health/ready",
      "GetReadinessResponse",
      GetReadinessResponse,
      res.body,
    );
  });

  it("validates the full health response against the generated schema", async () => {
    const res = await request(buildHealthApp()).get("/health");

    expect(res.status).toBe(200);
    expectResponseToMatch(
      "GET /health",
      "GetFullHealthResponse",
      GetFullHealthResponse,
      res.body,
    );
  });

  it("validates an unauthorised error response against the shared generated error contract", async () => {
    const res = await request(buildAuthApp()).get("/auth/me");

    expect(res.status).toBe(401);
    expectResponseToMatch(
      "GET /auth/me (401)",
      "ErrorResponse",
      ErrorResponseSchema,
      res.body,
    );
  });
});