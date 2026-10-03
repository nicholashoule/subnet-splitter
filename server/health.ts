/**
 * server/health.ts
 *
 * What counts as a health probe, shared by the API rate limiter (which exempts probes)
 * and request logging (which skips them). Only GET or HEAD on an exact health path
 * qualifies, so nothing else under /api/v1/health* (a POST with a body, or a lookalike
 * path such as /api/v1/healthz) escapes the rate limit.
 */

/** Health endpoints, served at the root and under /api/v1 (server/routes.ts) */
export const HEALTH_PATHS = ["/health", "/health/ready", "/health/live"] as const;

/** True for GET or HEAD on a health path, at the root or under /api/v1 */
export function isHealthProbe(method: string, fullPath: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  // Express treats a trailing slash as the same route (strict routing is off)
  const path = fullPath.length > 1 && fullPath.endsWith("/") ? fullPath.slice(0, -1) : fullPath;
  const relative = path.startsWith("/api/v1/") ? path.slice("/api/v1".length) : path;
  return (HEALTH_PATHS as readonly string[]).includes(relative);
}
