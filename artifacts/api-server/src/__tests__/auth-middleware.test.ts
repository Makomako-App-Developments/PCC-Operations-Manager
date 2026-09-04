import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

const { sessionRows, selectMock } = vi.hoisted(() => ({
  sessionRows: [{ sessionVersion: 0 }],
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
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// We test the middleware logic in isolation — no real JWT signing
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn((token: string, _secret: string) => {
      if (token === "valid-token") return { userId: "user-1", role: "manager", sessionVersion: 0, tokenType: "access" };
      if (token === "refresh-token") return { userId: "user-1", role: "manager", sessionVersion: 0, tokenType: "refresh" };
      if (token === "legacy-token") return { userId: "user-1", role: "manager", tokenType: "access" };
      if (token === "string-session-version") return { userId: "user-1", role: "manager", sessionVersion: "0", tokenType: "access" };
      if (token === "negative-session-version") return { userId: "user-1", role: "manager", sessionVersion: -1, tokenType: "access" };
      if (token === "fractional-session-version") return { userId: "user-1", role: "manager", sessionVersion: 0.5, tokenType: "access" };
      throw new Error("invalid");
    }),
  },
}));

// Provide env before importing
process.env["JWT_SECRET"] = "test-secret";

const mockReq = (authHeader?: string) =>
  ({
    headers: authHeader ? { authorization: authHeader } : {},
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

    await requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
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
    sessionRows[0] = { sessionVersion: 1 };
    const req = mockReq("Bearer valid-token");
    const res = mockRes();
    const n = vi.fn() as NextFunction;

    await requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    sessionRows[0] = { sessionVersion: 0 };
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
