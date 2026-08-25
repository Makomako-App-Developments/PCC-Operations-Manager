import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { addBreadcrumb, withScope } = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  withScope: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  initSentry: vi.fn(),
  Sentry: { addBreadcrumb, withScope },
}));

import { fieldOpsDiagnosticMiddleware } from "../app";

function buildApp() {
  const app = express();
  app.use("/api", fieldOpsDiagnosticMiddleware);
  app.get("/api/jobs/:id", (_req, res) => res.status(500).json({
    error: "contains credentials https://private.example/photo.jpg",
  }));
  return app;
}

beforeEach(() => {
  addBreadcrumb.mockClear();
  withScope.mockClear();
});

describe("Field Ops server diagnostics", () => {
  it("emits only the allowlisted route label, opaque ID, and safe outcome fields", async () => {
    const res = await request(buildApp())
      .get("/api/jobs/123e4567-e89b-12d3-a456-426614174000?token=secret-query")
      .set("authorization", "Bearer secret-header")
      .send({ note: "private body", photoUrl: "https://private.example/photo.jpg" });

    expect(res.status).toBe(500);
    const diagnostic = addBreadcrumb.mock.calls[0][0].data;
    expect(diagnostic).toMatchObject({
      method: "GET",
      endpoint: "/jobs/:id",
      jobId: "123e4567-e89b-12d3-a456-426614174000",
      status: 500,
      failureCategory: "http_5xx",
    });
    expect(Object.keys(diagnostic)).toEqual([
      "method", "endpoint", "jobId", "durationMs", "status", "failureCategory",
    ]);
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain("secret-query");
    expect(serialized).not.toContain("secret-header");
    expect(serialized).not.toContain("private body");
    expect(serialized).not.toContain("private.example");
  });

  it("does not emit diagnostics for routes outside the allowlist", async () => {
    const app = express();
    app.use("/api", fieldOpsDiagnosticMiddleware);
    app.get("/api/jobs", (_req, res) => res.json({ ok: true }));

    await request(app).get("/api/jobs?search=private");

    expect(addBreadcrumb).not.toHaveBeenCalled();
  });
});