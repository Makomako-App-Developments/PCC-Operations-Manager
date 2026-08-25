import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";
import { setRequestDiagnosticHandler, type RequestDiagnostic } from "@workspace/api-client-react";

const domain = process.env["EXPO_PUBLIC_DOMAIN"] ?? "";

// On web, use relative paths so the browser resolves them against the current
// origin. This prevents a dev-tunnel URL being baked into the bundle at build
// time from being used in production.
const BASE = Platform.OS !== "web" && domain ? `https://${domain}` : "";

/**
 * Resolves a server-relative path (e.g. "/api/jobs/123/photos") to an
 * absolute URL using the same domain as the API client.
 */
export function getApiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${clean}`;
}

function recordRequestDiagnostic(diagnostic: RequestDiagnostic): void {
  if (typeof Sentry.addBreadcrumb !== "function") return;
  Sentry.addBreadcrumb({
    category: "field-ops.request",
    level: diagnostic.failureCategory ? "error" : "info",
    message: `${diagnostic.method} ${diagnostic.endpoint}`,
    data: diagnostic,
  });
}

setRequestDiagnosticHandler(recordRequestDiagnostic);

export async function trackedFetch(
  path: string,
  options?: RequestInit,
  retryCount = 0,
): Promise<Response> {
  const endpoint = getApiUrl(path);
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint, options);
    const durationMs = Math.round(performance.now() - startedAt);
    const safe = path.split("?")[0].replace(/\/[0-9a-f-]{8,}/gi, "/:id");
    const jobMatch = path.match(/\/(?:jobs|assets)\/([0-9a-f-]{8,})/i);
    const diagnostic: RequestDiagnostic = {
      method: options?.method?.toUpperCase() ?? "GET",
      endpoint: safe,
      ...(jobMatch ? { jobId: jobMatch[1] } : {}),
      durationMs,
      status: response.status,
      retryCount,
      ...(response.ok ? {} : { failureCategory: response.status >= 500 ? "http_5xx" : "http_4xx" }),
    };
    recordRequestDiagnostic(diagnostic);
    return response;
  } catch (error) {
    const diagnostic: RequestDiagnostic = {
      method: options?.method?.toUpperCase() ?? "GET",
      endpoint: path.split("?")[0].replace(/\/[0-9a-f-]{8,}/gi, "/:id"),
      durationMs: Math.round(performance.now() - startedAt),
      retryCount,
      failureCategory: error instanceof Error && /timeout|timed out|abort/i.test(error.message) ? "timeout" : "network",
    };
    const jobMatch = path.match(/\/(?:jobs|assets)\/([0-9a-f-]{8,})/i);
    if (jobMatch) diagnostic.jobId = jobMatch[1];
    recordRequestDiagnostic(diagnostic);
    throw error;
  }
}
