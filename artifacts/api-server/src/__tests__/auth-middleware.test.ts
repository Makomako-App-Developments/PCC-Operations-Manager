import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

// We test the middleware logic in isolation — no real JWT signing
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn((token: string, _secret: string) => {
      if (token === "valid-token") return { userId: "user-1", role: "manager", tokenType: "access" };
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

    requireAuth(req, res, n);

    expect(n).toHaveBeenCalledOnce();
    expect((req as unknown as Record<string, unknown>)["auth"]).toMatchObject({ userId: "user-1", role: "manager" });
  });

  it("returns 401 for missing token", async () => {
    const { requireAuth } = await import("../middlewares/auth");
    const req = mockReq();
    const res = mockRes();
    const n   = vi.fn() as NextFunction;

    requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 for invalid token", async () => {
    const { requireAuth } = await import("../middlewares/auth");
    const req = mockReq("Bearer bad-token");
    const res = mockRes();
    const n   = vi.fn() as NextFunction;

    requireAuth(req, res, n);

    expect(n).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
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
