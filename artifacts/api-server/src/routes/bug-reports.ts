import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { Sentry } from "../lib/sentry";

const router = Router();

const schema = z.object({
  description: z.string().min(1).max(2000),
  route: z.string().optional(),
  deviceInfo: z.record(z.unknown()).optional(),
  username: z.string().optional(),
  userRole: z.string().optional(),
  appVersion: z.string().optional(),
  occurredAt: z.string().optional(),
});

router.post("/api/bug-reports", requireAuth, async (req, res) => {
  try {
    const body = schema.parse(req.body);
    const user = (req as any).user;

    const context = {
      description: body.description,
      route: body.route ?? "unknown",
      deviceInfo: body.deviceInfo ?? {},
      username: body.username ?? user?.name ?? "unknown",
      userRole: body.userRole ?? user?.role ?? "unknown",
      appVersion: body.appVersion ?? "unknown",
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      serverReceivedAt: new Date().toISOString(),
    };

    console.log("[bug-report]", JSON.stringify(context, null, 2));

    Sentry.withScope(scope => {
      scope.setUser({ username: context.username });
      scope.setTag("role", context.userRole);
      scope.setTag("route", context.route);
      scope.setTag("appVersion", context.appVersion);
      scope.setExtra("deviceInfo", context.deviceInfo);
      scope.setExtra("occurredAt", context.occurredAt);
      Sentry.captureMessage(
        `[Field Report] ${context.username}: ${context.description}`,
        "info",
      );
    });

    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: err.errors });
      return;
    }
    console.error("[bug-report] Error:", err);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

export default router;
