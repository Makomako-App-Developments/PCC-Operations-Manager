import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { verifyPassword, hashPassword } from "../lib/password";
import { signTokens, requireAuth } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";

const router = Router();

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post("/auth/login", validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const [user] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = lower(${email})`).limit(1);

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
    res.status(401).json({ error: "No refresh token" });
    return;
  }
  let payload: import("../middlewares/auth").AuthPayload;
  try {
    const jwt = await import("jsonwebtoken");
    const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
    payload = jwt.default.verify(token, JWT_SECRET) as import("../middlewares/auth").AuthPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  if (payload.tokenType !== "refresh") {
    res.status(401).json({ error: "Invalid token type" });
    return;
  }
  // Check user still active
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
  if (!user || !user.isActive) {
    res.status(403).json({ error: "Account disabled" });
    return;
  }
  const { accessToken, refreshToken } = signTokens({
    userId: user.id,
    role:   user.role,
    teamId: user.teamId,
  });
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
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash: _, ...safe } = user;
  res.json(safe);
});

export default router;
