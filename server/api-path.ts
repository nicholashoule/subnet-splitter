/**
 * server/api-path.ts
 *
 * API paths in any letter case. Every API route is lowercase and has no path
 * parameters, so normalizeApiPath() lowercases the path of an API request before
 * anything else sees it: /API/K8s/Tiers is served, rate limited and logged exactly
 * like /api/k8s/tiers. The query string keeps its case (?provider=EKS is still a
 * validation error), and so does every other path: the web app's hashed assets
 * (/assets/index-CoaPm5lw.js) are case-sensitive file names.
 */

import type { Request, Response, NextFunction } from "express";

/** /api and anything under it, in any letter case. The lookahead keeps the slash out of
 * the match, so a mount on it sets req.baseUrl to "/api" and req.path to the rest. */
export const API_PATH = /^\/api(?=\/|$)/i;

/** Lowercases the path, not the query, of an API request. Register it first. */
export function normalizeApiPath(req: Request, _res: Response, next: NextFunction): void {
  const queryAt = req.url.indexOf("?");
  const path = queryAt === -1 ? req.url : req.url.slice(0, queryAt);
  if (API_PATH.test(path)) {
    const lower = path.toLowerCase();
    if (lower !== path) req.url = lower + (queryAt === -1 ? "" : req.url.slice(queryAt));
  }
  next();
}
