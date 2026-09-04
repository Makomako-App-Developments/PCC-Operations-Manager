import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, executeWithCircuitBreaker, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

export interface AuthPayload {
  userId: string;
  role: string;
  teamId: string | null;
  sessionVersion: number;
  tokenType: "access" | "refresh";
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

  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  if (payload.tokenType !== "access") {
    res.status(401).json({ error: "Invalid token type" });
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
  const refreshToken = jwt.sign({ ...payload, tokenType: "refresh" }, JWT_SECRET, { expiresIn: "7d" });
  return { accessToken, refreshToken };
}
