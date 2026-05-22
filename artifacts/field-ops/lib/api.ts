const domain = process.env["EXPO_PUBLIC_DOMAIN"] ?? "";
const BASE = domain ? `https://${domain}` : "";

/**
 * Resolves a server-relative path (e.g. "/api/jobs/123/photos") to an
 * absolute URL using the same domain as the API client.
 */
export function getApiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${clean}`;
}
