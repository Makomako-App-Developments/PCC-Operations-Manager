import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

const { sessionRows, selectMock } = vi.hoisted(() => ({
  sessionRows: [{
    sessionVersion: 0,
    role: "manager",
    teamId: null as string | null,
  }],
  selectMock: vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => sessionRows,
      }),
    }),
  })),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: selectMock,
  },
  executeWithCircuitBreaker: async <T>(fn: () => Promise<T>) => fn(),
  usersTable: {
    id: {},
    sessionVersion: {},
    role: {},
    teamId: {},
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// We test the middleware logic in isolation — no real JWT signing
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn((token: string, _secret: string) => {
      if (token === "valid-token") return { userId: "user-1", role: "manager", teamId: null, sessionVersion: 0, tokenType: "access" };
      if (token === "worker-token") return { userId: "worker-1", role: "field_worker", teamId: "11111111-1111-4111-8111-111111111111", sessionVersion: 0, tokenType: "access" };
      if (token === "refresh-token") return { userId: "user-1", role: "manager", teamId: null, sessionVersion: 0, tokenType: "refresh" };
      if (token === "legacy-token") return { userId: "user-1", role: "manager", teamId: null, tokenType: "access" };
      if (token === "string-session-version") return { userId: "user-1", role: "manager", teamId: null, sessionVersion: "0", tokenType: "access" };
      if (token === "negative-session-version") return { userId: "user-1", role: "manager", teamId: null, sessionVersion: -1, tokenType: "access" };
      if (token === "fractional-session-version") return { userId: "user-1", role: "manager", teamId: null, sessionVersion: 0.5, tokenType: "access" };
      if (token === "numeric-user-id") return { userId: 42, role: "manager", teamId: null, sessionVersion: 0, tokenType: "access" };
      if (token === "object-role") return { userId: "user-1", role: { name: "manager" }, teamId: null, sessionVersion: 0, tokenType: "access" };
      throw new Error("invalid");
    }),
  },
}));

// Provide env before importing
process.env["JWT_SECRET"] = "test-secret";

const mockReq = (authHeader?: string) =>
  ({
    headers: authHeader ? { authorization: authHeader } : {},
    method: "GET",
    path: "/protected",
    auth: undefined,
  }) as unknown as Request;

const mockRes = () => {
  const r: Partial<Response> = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json   = vi.fn().mockReturnValue(r);
  return r as Response;
};

const next: NextFunction = vi.fn();

describe("requireAuth middleware", () => {
  it("calls next() for a valid Bearer token", async () => {
    const { requireAuth } = await import("../middlewares/auth");
    const req = mockReq("Bearer valid-token");
    const res = mockRes();
    const n   = vi.fn() as NextFunction;

    await requireAuth(req, res, n);

    expect(n).toHaveBeenCalledOnce();
    expect((req as unknown as Record<string, unknown>)["auth"]).toMatchObject({ userId: "user-1", role: "manager" });
  });

  it("returns 401 for missing token", async () => {
    const { requireAuth } = await import("../middlewares/auth");
    const req = mockReq();
    const res = mockRes();
    const n   = vi.fn() as NextFunction;

    await requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 for invalid token", async () => {
    const { requireAuth } = await import("../middlewares/auth");
    const req = mockReq("Bearer bad-token");
    const res = mockRes();
    const n   = vi.fn() as NextFunction;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(warning).toHaveBeenCalledWith(
      "[auth-failure]",
      JSON.stringify({
        event: "authentication_failure",
        surface: "access",
        reason: "jwt_verification_failed",
        method: "GET",
        path: "/protected",
      }),
    );
    expect(warning.mock.calls[0]?.join(" ")).not.toContain("bad-token");
    warning.mockRestore();
  });

  it("returns 401 for an access token issued before session versions existed", async () => {
    const { requireAuth } = await import("../middlewares/auth");
    const req = mockReq("Bearer legacy-token");
    const res = mockRes();
    const n = vi.fn() as NextFunction;

    await requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it.each([
    ["string-session-version"],
    ["negative-session-version"],
    ["fractional-session-version"],
  ])("returns 401 for an access token with %s and skips the user lookup", async (token) => {
    const { requireAuth } = await import("../middlewares/auth");
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    const n = vi.fn() as NextFunction;
    selectMock.mockClear();

    await requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it.each([
    ["numeric-user-id"],
    ["object-role"],
  ])("returns 401 for an access token with malformed identity claims (%s) before the user lookup", async (token) => {
    const { requireAuth } = await import("../middlewares/auth");
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    const n = vi.fn() as NextFunction;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    selectMock.mockClear();

    await requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(selectMock).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      "[auth-failure]",
      expect.stringContaining('"reason":"invalid_identity_claims"'),
    );
    expect(warning.mock.calls[0]?.join(" ")).not.toContain("user-1");
    warning.mockRestore();
  });

  it("returns 401 when a refresh token is presented instead of an access token", async () => {
    const { requireAuth } = await import("../middlewares/auth");
    const req = mockReq("Bearer refresh-token");
    const res = mockRes();
    const n   = vi.fn() as NextFunction;

    await requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects an access token after its session version is revoked", async () => {
    const { requireAuth } = await import("../middlewares/auth");
    sessionRows[0] = { sessionVersion: 1, role: "manager", teamId: null };
    const req = mockReq("Bearer valid-token");
    const res = mockRes();
    const n = vi.fn() as NextFunction;

    await requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    sessionRows[0] = { sessionVersion: 0, role: "manager", teamId: null };
  });

  it("uses the current database role when an existing privileged token is demoted", async () => {
    const { requireAuth, requireRole } = await import("../middlewares/auth");
    sessionRows[0] = { sessionVersion: 0, role: "field_worker", teamId: null };
    const req = mockReq("Bearer valid-token");
    const authNext = vi.fn() as NextFunction;

    await requireAuth(req, mockRes(), authNext);

    expect(authNext).toHaveBeenCalledOnce();
    expect(req.auth?.role).toBe("field_worker");

    const roleRes = mockRes();
    const roleNext = vi.fn() as NextFunction;
    requireRole("manager")(req, roleRes, roleNext);
    expect(roleNext).not.toHaveBeenCalled();
    expect(roleRes.status).toHaveBeenCalledWith(403);

    sessionRows[0] = { sessionVersion: 0, role: "manager", teamId: null };
  });

  it("uses the current database role when an existing token is promoted", async () => {
    const { requireAuth, requireRole } = await import("../middlewares/auth");
    sessionRows[0] = { sessionVersion: 0, role: "manager", teamId: null };
    const req = mockReq("Bearer worker-token");
    const authNext = vi.fn() as NextFunction;

    await requireAuth(req, mockRes(), authNext);

    expect(authNext).toHaveBeenCalledOnce();
    expect(req.auth?.role).toBe("manager");

    const roleNext = vi.fn() as NextFunction;
    requireRole("manager")(req, mockRes(), roleNext);
    expect(roleNext).toHaveBeenCalledOnce();
  });

  it("uses the current team assignment for an existing worker token after removal and reassignment", async () => {
    const { requireAuth } = await import("../middlewares/auth");
    const oldTeamId = "11111111-1111-4111-8111-111111111111";
    const newTeamId = "22222222-2222-4222-8222-222222222222";

    sessionRows[0] = { sessionVersion: 0, role: "field_worker", teamId: null };
    const removedReq = mockReq("Bearer worker-token");
    const removedNext = vi.fn() as NextFunction;
    await requireAuth(removedReq, mockRes(), removedNext);

    expect(removedNext).toHaveBeenCalledOnce();
    expect(removedReq.auth).toMatchObject({
      role: "field_worker",
      teamId: null,
    });
    expect(removedReq.auth?.teamId).not.toBe(oldTeamId);

    sessionRows[0] = { sessionVersion: 0, role: "field_worker", teamId: newTeamId };
    const reassignedReq = mockReq("Bearer worker-token");
    const reassignedNext = vi.fn() as NextFunction;
    await requireAuth(reassignedReq, mockRes(), reassignedNext);

    expect(reassignedNext).toHaveBeenCalledOnce();
    expect(reassignedReq.auth).toMatchObject({
      role: "field_worker",
      teamId: newTeamId,
    });

    sessionRows[0] = { sessionVersion: 0, role: "manager", teamId: null };
  });
});

describe("requireRole middleware", () => {
  it("allows through matching role", async () => {
    const { requireRole } = await import("../middlewares/auth");
    const req = { auth: { userId: "u1", role: "manager" } } as unknown as Request;
    const res = mockRes();
    const n   = vi.fn() as NextFunction;

    requireRole("manager", "supervisor")(req, res, n);
    expect(n).toHaveBeenCalledOnce();
  });

  it("rejects non-matching role with 403", async () => {
    const { requireRole } = await import("../middlewares/auth");
    const req = { auth: { userId: "u1", role: "field_worker" } } as unknown as Request;
    const res = mockRes();
    const n   = vi.fn() as NextFunction;

    requireRole("manager")(req, res, n);
    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
