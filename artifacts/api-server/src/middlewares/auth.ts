import { Request, Response, NextFunction } from "express";
import { createHash, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { db, executeWithCircuitBreaker, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Refresh tokens are bearer credentials, so do not retain the raw token in
// memory. The expiry value lets the registry clean itself up as refreshes
// happen instead of growing for the lifetime of the process.
const consumedRefreshTokens = new Map<string, number>();

function refreshTokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function pruneConsumedRefreshTokens(now: number): void {
  for (const [fingerprint, expiresAt] of consumedRefreshTokens) {
    if (expiresAt <= now) {
      consumedRefreshTokens.delete(fingerprint);
    }
  }
}

/**
 * Atomically consume a refresh token.
 *
 * The check and insert are synchronous so two requests that race after the
 * database lookup cannot both exchange the same token.
 */
export function consumeRefreshToken(token: string): boolean {
  const now = Date.now();
  pruneConsumedRefreshTokens(now);

  const fingerprint = refreshTokenFingerprint(token);
  if (consumedRefreshTokens.has(fingerprint)) {
    return false;
  }

  consumedRefreshTokens.set(fingerprint, now + REFRESH_TOKEN_TTL_MS);
  return true;
}

export function hasConsumedRefreshToken(token: string): boolean {
  const now = Date.now();
  pruneConsumedRefreshTokens(now);
  return consumedRefreshTokens.has(refreshTokenFingerprint(token));
}

export interface AuthPayload {
  userId: string;
  role: string;
  teamId: string | null;
  sessionVersion: number;
  tokenType: "access" | "refresh";
}

export function hasValidIdentityClaims(
  payload: unknown,
): payload is Partial<AuthPayload> & Pick<AuthPayload, "userId" | "role" | "teamId"> {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const claims = payload as Record<string, unknown>;
  return (
    typeof claims.userId === "string" &&
    claims.userId.length > 0 &&
    typeof claims.role === "string" &&
    claims.role.length > 0 &&
    (typeof claims.teamId === "string" || claims.teamId === null)
  );
}

export function hasValidSessionVersion(payload: Partial<AuthPayload>): payload is AuthPayload {
  return Number.isInteger(payload.sessionVersion) && payload.sessionVersion >= 0;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token =
    req.cookies?.["access_token"] ??
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "Unauthorised" });
    return;
  }

  let payload: unknown;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  if (!hasValidIdentityClaims(payload)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  if (payload.tokenType !== "access") {
    res.status(401).json({ error: "Invalid token type" });
    return;
  }
  if (!hasValidSessionVersion(payload)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const [user] = await executeWithCircuitBreaker(() =>
      db
        .select({ sessionVersion: usersTable.sessionVersion })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1),
    );
    if (!user || user.sessionVersion !== payload.sessionVersion) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.auth = payload;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // administrator is always allowed — they supersede all role restrictions
    if (!req.auth || (req.auth.role !== "administrator" && !roles.includes(req.auth.role))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function signTokens(payload: Omit<AuthPayload, "tokenType">) {
  const accessToken = jwt.sign({ ...payload, tokenType: "access" }, JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign(
    { ...payload, tokenType: "refresh", jti: randomUUID() },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
  return { accessToken, refreshToken };
}
