/**
 * server/app.ts
 *
 * Builds the Express app and the middleware every request passes through, in the
 * order the server relies on: security headers, compression, request logging, the
 * /api rate limit, JSON body parsing for /api, and (development only) the CSP
 * violation endpoint with its own limiter and parser. server/index.ts then adds the routes, static serving or Vite, and
 * errorHandler. Integration tests build their servers with these same functions,
 * so they exercise this configuration rather than a copy of it.
 */

import express, { type ErrorRequestHandler, type Express } from "express";
import compression from "compression";
import { createSecurityHeaders } from "./csp-config";
import { registerCspViolationEndpoint } from "./csp-report";
import { createApiRateLimiter } from "./routes";
import { logger, requestLogger } from "./logger";

export interface AppOptions {
  /** Relaxes the CSP for Vite HMR and adds the CSP violation endpoint */
  isDevelopment: boolean;
}

export function createApp({ isDevelopment }: AppOptions): Express {
  const app = express();

  // Match routes case-sensitively, as the rate limiter, its health-check exemption and
  // request logging do. Set before the first app.use(), which creates the router.
  // Other spellings of /api (/API/k8s/plan) get the JSON 404 from server/routes.ts.
  app.set("case sensitive routing", true);

  // Security headers, with a CSP built from server/csp-config.ts
  app.use(createSecurityHeaders(isDevelopment));

  // Compress responses (gzip/brotli) to speed up first load of the JS/CSS bundle.
  app.use(compression());

  // Request logging for API calls. Registered before the rate limiter and the body
  // parser, so requests they reject (429, 400, 413) are logged too.
  app.use(requestLogger);

  // Per-IP rate limit for the API (health checks are exempt so probes never fail).
  // Before body parsing, so malformed or oversized bodies count toward the limit
  // instead of being parsed and rejected without limit.
  app.use("/api", createApiRateLimiter());

  // Parse JSON bodies for the API only; nothing else reads a body. API payloads are a
  // few hundred bytes, so cap bodies well below Express's 100kb default. The API takes
  // JSON only, so there is no urlencoded parser.
  app.use("/api", express.json({ limit: "16kb" }));

  // CSP violation reporting endpoint (development only): browsers report blocked
  // content here, so CSP problems show up before they reach production. The route
  // applies its own rate limit before its own JSON parser (server/csp-report.ts).
  if (isDevelopment) {
    registerCspViolationEndpoint(app);
  }

  return app;
}

/**
 * Error handler, registered last so it also catches errors from static serving and
 * Vite. It always answers in JSON, whatever ?format= asks for: the errors that reach
 * it are malformed or oversized bodies (400, 413, from express.json) and unexpected
 * failures (500). The plan and tiers routes answer their own validation and planning
 * errors, in the requested format.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  if (res.headersSent) {
    return next(err);
  }

  // Client errors (malformed JSON, oversized body) are expected; only log 5xx as errors
  if (status >= 500) {
    logger.error("Internal Server Error", { status, path: req.path, method: req.method }, err);
  } else {
    logger.warn("Request rejected", { status, path: req.path, method: req.method, message: err.message });
  }

  // Never echo internal error details to clients
  res.status(status).json({
    error: status < 500 ? err.message || "Bad Request" : "Internal Server Error",
    code: status < 500 ? "INVALID_REQUEST" : "INTERNAL_ERROR",
  });
};
