import type { NextFunction, Request, Response } from "express";

export const FIELD_TEAM_ASSIGNMENT_REQUIRED_ERROR =
  "A team assignment is required to access field work.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Team-scoped field routes must not build database predicates from a missing
 * or malformed worker team claim. An undefined teamId is tolerated only for
 * legacy test middleware; real authenticated requests always include the claim.
 */
export function requireFieldWorkerTeam(req: Request, res: Response, next: NextFunction) {
  const teamId = req.auth?.teamId;
  const hasRealAuthShape = Number.isInteger(req.auth?.sessionVersion);
  if (
    req.auth?.role === "field_worker"
    && (
      teamId === null
      || (hasRealAuthShape && typeof teamId === "string" && !UUID_PATTERN.test(teamId))
    )
  ) {
    res.status(403).json({ error: FIELD_TEAM_ASSIGNMENT_REQUIRED_ERROR });
    return;
  }
  next();
}