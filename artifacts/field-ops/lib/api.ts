import { Platform } from "react-native";

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
