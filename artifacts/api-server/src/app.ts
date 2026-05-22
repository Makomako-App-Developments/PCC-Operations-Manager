import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import router from "./routes";
import { initSentry, Sentry } from "./lib/sentry";

initSentry();

const app: Express = express();

// Trust the first hop of proxy headers (Replit / cloud load balancers)
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // CSP handled by nginx for the web app
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env["ALLOWED_ORIGINS"]
  ? process.env["ALLOWED_ORIGINS"].split(",").map(o => o.trim())
  : true; // dev: allow all

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── Body limits ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later" },
  skipSuccessfulRequests: true,
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);

// ── Static uploads (photo evidence, dev only) ─────────────────────────────────
app.use(
  "/api/uploads",
  express.static(path.resolve(process.cwd(), "uploads"), { maxAge: "1d" }),
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Sentry error handler (must be last) ──────────────────────────────────────
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (process.env["SENTRY_DSN"]) {
    Sentry.captureException(err);
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[error]", err);
  res.status(500).json({ error: message });
});

export default app;
