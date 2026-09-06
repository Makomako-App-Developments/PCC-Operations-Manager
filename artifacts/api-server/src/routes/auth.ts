import { Router } from "express";
import { randomBytes } from "crypto";
import { db, usersTable, executeWithCircuitBreaker } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { verifyPassword, hashPassword } from "../lib/password";
import {
  consumeRefreshToken,
  hasConsumedRefreshToken,
  hasValidIdentityClaims,
  hasValidSessionVersion,
  signTokens,
  requireAuth,
  recordAuthFailure,
} from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";

const router = Router();

// ── One-time handoff codes (web → field-ops session transfer) ─────────────────
// Codes are opaque random strings, single-use, expire in 60 s.
// The bearer token never touches a URL this way.
interface HandoffEntry {
  accessToken: string;
  user: { id: string; name: string; initials: string; role: string; teamId: string | null };
  expiresAt: number;
}
const handoffCodes = new Map<string, HandoffEntry>();

// POST /api/auth/handoff/create
// Requires an authenticated session (cookie or bearer). Issues a one-time
// code that the field-ops surface can exchange for a fresh access token.
router.post("/auth/handoff/create", requireAuth, async (req, res) => {
  const [user] = await executeWithCircuitBreaker(() => db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId)).limit(1));
  if (!user || !user.isActive) {
    res.status(403).json({ error: "Account disabled" });
    return;
  }

  const { accessToken } = signTokens({
    userId: user.id,
    role: user.role,
    teamId: user.teamId,
    sessionVersion: user.sessionVersion,
  });
  const code = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 60_000;

  handoffCodes.set(code, {
    accessToken,
    user: { id: user.id, name: user.name, initials: user.initials, role: user.role, teamId: user.teamId },
    expiresAt,
  });
  setTimeout(() => handoffCodes.delete(code), 60_000);

  res.json({ code });
});

// POST /api/auth/handoff/redeem
// Accepts a one-time code, invalidates it immediately, and returns the
// access token + user. Never exposes the token in a URL.
router.post("/auth/handoff/redeem", async (req, res) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing code" });
    return;
  }

  const entry = handoffCodes.get(code);
  handoffCodes.delete(code); // single-use: invalidate immediately regardless of outcome

  if (!entry || Date.now() > entry.expiresAt) {
    res.status(401).json({ error: "Invalid or expired handoff code" });
    return;
  }

  res.json({ accessToken: entry.accessToken, user: entry.user });
});
// ─────────────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post("/auth/login", validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const [user] = await executeWithCircuitBreaker(() => db.select().from(usersTable).where(sql`lower(${usersTable.email}) = lower(${email})`).limit(1));

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "Account disabled" });
    return;
  }

  const { accessToken, refreshToken } = signTokens({
    userId: user.id,
    role:   user.role,
    teamId: user.teamId,
    sessionVersion: user.sessionVersion,
  });

  res
    .cookie("access_token",  accessToken,  { httpOnly: true, secure: true, sameSite: "strict", maxAge: 15 * 60 * 1000 })
    .cookie("refresh_token", refreshToken, { httpOnly: true, secure: true, sameSite: "strict", maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json({
      user: { id: user.id, name: user.name, initials: user.initials, role: user.role, teamId: user.teamId },
      accessToken,
    });
});

// POST /api/auth/refresh
router.post("/auth/refresh", async (req, res) => {
  const token = req.cookies?.["refresh_token"];
  if (!token) {
    recordAuthFailure(req, "refresh", "missing_token");
    res.status(401).json({ error: "No refresh token" });
    return;
  }
  let payload: unknown;
  try {
    const jwt = await import("jsonwebtoken");
    const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
    payload = jwt.default.verify(token, JWT_SECRET);
  } catch (error) {
    recordAuthFailure(
      req,
      "refresh",
      error instanceof Error && error.name === "TokenExpiredError"
        ? "token_expired"
        : "jwt_verification_failed",
    );
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  if (!hasValidIdentityClaims(payload)) {
    recordAuthFailure(req, "refresh", "invalid_identity_claims");
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  if (payload.tokenType !== "refresh") {
    recordAuthFailure(req, "refresh", "invalid_token_type");
    res.status(401).json({ error: "Invalid token type" });
    return;
  }
  if (!hasValidSessionVersion(payload)) {
    recordAuthFailure(req, "refresh", "invalid_session_version");
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  if (hasConsumedRefreshToken(token)) {
    recordAuthFailure(req, "refresh", "refresh_token_replayed");
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  // Check user still active
  const [user] = await executeWithCircuitBreaker(() => db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1));
  if (!user || !user.isActive) {
    recordAuthFailure(req, "refresh", "refresh_account_disabled_or_missing");
    res.status(403).json({ error: "Account disabled" });
    return;
  }
  if (user.sessionVersion !== payload.sessionVersion) {
    recordAuthFailure(req, "refresh", "session_revoked_or_unknown_user");
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  const { accessToken, refreshToken } = signTokens({
    userId: user.id,
    role:   user.role,
    teamId: user.teamId,
    sessionVersion: user.sessionVersion,
  });
  // Consume only after every validation succeeds. The operation itself is
  // atomic, preventing concurrent requests from exchanging the same token.
  if (!consumeRefreshToken(token)) {
    recordAuthFailure(req, "refresh", "refresh_token_replayed");
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  res
    .cookie("access_token",  accessToken,  { httpOnly: true, secure: true, sameSite: "strict", maxAge: 15 * 60 * 1000 })
    .cookie("refresh_token", refreshToken, { httpOnly: true, secure: true, sameSite: "strict", maxAge: 7 * 24 * 60 * 60 * 1000 })
    .json({ ok: true });
});

// POST /api/auth/logout
router.post("/auth/logout", (_req, res) => {
  res.clearCookie("access_token").clearCookie("refresh_token").json({ ok: true });
});

// GET /api/auth/me
router.get("/auth/me", requireAuth, async (req, res) => {
  const [user] = await executeWithCircuitBreaker(() => db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId)).limit(1));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash: _, sessionVersion: __, ...safe } = user;
  res.json(safe);
});

export default router;
