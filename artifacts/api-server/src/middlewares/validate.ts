import { Request, Response, NextFunction } from "express";

type ParseResult =
  | { success: true; data: unknown }
  | { success: false; error: { issues: unknown[] } };

interface Schema {
  safeParse(data: unknown): ParseResult;
}

export function validateBody(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Validation failed", issues: result.error.issues });
      return;
    }
    res.locals.body = result.data;
    next();
  };
}

export function validateQuery(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: "Validation failed", issues: result.error.issues });
      return;
    }
    res.locals.query = result.data;
    next();
  };
}
