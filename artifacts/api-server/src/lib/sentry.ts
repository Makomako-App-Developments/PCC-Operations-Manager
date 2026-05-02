import * as Sentry from "@sentry/node";

const dsn = process.env["SENTRY_DSN"];

export function initSentry(): void {
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set — error reporting disabled");
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0.2,
  });
  console.log("[sentry] Initialised");
}

export { Sentry };
