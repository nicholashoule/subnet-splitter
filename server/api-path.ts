/**
 * server/api-path.ts
 *
 * API and health paths in any letter case. Every API and health route is lowercase and
 * has no path parameters, so normalizePathCase() lowercases the path of such a request
 * before anything else sees it: /API/K8s/Tiers is served, rate limited and logged
 * exactly like /api/k8s/tiers, and /HEALTH answers like /health. The query string keeps
 * its case (?provider=EKS is still a validation error), and so does every other path:
 * the web app's hashed assets (/assets/index-CoaPm5lw.js) are case-sensitive file names.
 */

import type { Request, Response, NextFunction } from "express";

/** /api and anything under it, in any letter case. The lookahead keeps the slash out of
 * the match, so a mount on it sets req.baseUrl to "/api" and req.path to the rest. */
export const API_PATH = /^\/api(?=\/|$)/i;

/** Paths whose letter case does not matter: the API and the health checks at the root */
const CASE_INSENSITIVE_PATH = /^\/(?:api|health)(?=\/|$)/i;

/**
 * Splits a request target into its scheme and host, its path and its query. Only the
 * absolute form that proxies send ("http://host/api/x", which Node accepts) has a
 * scheme and host; the usual origin form ("/api/x?y") has none.
 */
export function splitRequestTarget(url: string): { origin: string; path: string; query: string } {
  const queryAt = url.indexOf("?");
  const target = queryAt === -1 ? url : url.slice(0, queryAt);
  const query = queryAt === -1 ? "" : url.slice(queryAt);
  let origin = "";
  const schemeEnd = target.startsWith("/") ? -1 : target.indexOf("://");
  if (schemeEnd !== -1) {
    const pathAt = target.indexOf("/", schemeEnd + 3);
    origin = pathAt === -1 ? target : target.slice(0, pathAt);
  }
  return { origin, path: target.slice(origin.length), query };
}

/** Lowercases the path, not the query, of an API or health request. Register it first. */
export function normalizePathCase(req: Request, _res: Response, next: NextFunction): void {
  const { origin, path, query } = splitRequestTarget(req.url);
  if (CASE_INSENSITIVE_PATH.test(path)) {
    const lower = path.toLowerCase();
    if (lower !== path) req.url = origin + lower + query;
  }
  next();
}
