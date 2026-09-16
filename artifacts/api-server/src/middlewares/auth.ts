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

export type AuthFailureSurface = "access" | "refresh";
export type AuthFailureReason =
  | "missing_token"
  | "token_expired"
  | "jwt_verification_failed"
  | "invalid_identity_claims"
  | "invalid_token_type"
  | "invalid_session_version"
  | "session_revoked_or_unknown_user"
  | "refresh_token_replayed"
  | "refresh_account_disabled_or_missing";

/**
 * Emits only a reason category and non-sensitive request context. In
 * particular, never include the bearer token, decoded claims, or verifier
 * error message in authentication telemetry.
 */
export function recordAuthFailure(
  req: Request,
  surface: AuthFailureSurface,
  reason: AuthFailureReason,
): void {
  const requestPath =
    (typeof req.path === "string" && req.path) ||
    (typeof req.originalUrl === "string" && req.originalUrl.split("?")[0]) ||
    "unknown";
  const event = {
    event: "authentication_failure",
    surface,
    reason,
    method: req.method || "UNKNOWN",
    path: requestPath,
  };

  console.warn("[auth-failure]", JSON.stringify(event));
}

function getVerificationFailureReason(error: unknown): "token_expired" | "jwt_verification_failed" {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "TokenExpiredError"
  ) {
    return "token_expired";
  }
  return "jwt_verification_failed";
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
    recordAuthFailure(req, "access", "missing_token");
    res.status(401).json({ error: "Unauthorised" });
    return;
  }

  let payload: unknown;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    recordAuthFailure(req, "access", getVerificationFailureReason(error));
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  if (!hasValidIdentityClaims(payload)) {
    recordAuthFailure(req, "access", "invalid_identity_claims");
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  if (payload.tokenType !== "access") {
    recordAuthFailure(req, "access", "invalid_token_type");
    res.status(401).json({ error: "Invalid token type" });
    return;
  }
  if (!hasValidSessionVersion(payload)) {
    recordAuthFailure(req, "access", "invalid_session_version");
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const [user] = await executeWithCircuitBreaker(() =>
      db
        .select({
          sessionVersion: usersTable.sessionVersion,
          teamId: usersTable.teamId,
        })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1),
    );
    if (!user || user.sessionVersion !== payload.sessionVersion) {
      recordAuthFailure(req, "access", "session_revoked_or_unknown_user");
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.auth = {
      ...payload,
      teamId: user.teamId,
    };
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
