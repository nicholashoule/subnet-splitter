/**
 * server/app.ts
 *
 * Builds the Express app and the middleware every request passes through, in the
 * order the server relies on: path case normalization for API and health paths, security
 * headers, compression, request logging, the /api rate limit, JSON body parsing for
 * /api, and (development only) the CSP violation endpoint with its own limiter and
 * parser. server/index.ts then adds the routes, static serving or Vite, and
 * errorHandler. The rate-limiting, CSP violation, static serving and production-app
 * tests build on createApp(); the other integration tests use
 * tests/helpers/test-server.ts, a lighter stack with the same path case normalization,
 * JSON limit, routing and errorHandler.
 */

import express, { type ErrorRequestHandler, type Express } from "express";
import { STATUS_CODES } from "http";
import compression from "compression";
import { createSecurityHeaders } from "./csp-config";
import { registerCspViolationEndpoint } from "./csp-report";
import { createApiRateLimiter } from "./routes";
import { API_PATH, normalizePathCase } from "./api-path";
import { logger, requestLogger } from "./logger";

export interface AppOptions {
  /** Relaxes the CSP for Vite HMR and adds the CSP violation endpoint */
  isDevelopment: boolean;
}

export function createApp({ isDevelopment }: AppOptions): Express {
  const app = express();

  // Match routes case-sensitively, so each route has one spelling. Set before the
  // first app.use(), which creates the router.
  app.set("case sensitive routing", true);

  // API and health paths work in any letter case: lowercase the path of such a request
  // (not its query) before anything else sees it, so /API/K8s/Tiers is served, rate
  // limited, exempted as a health probe and logged exactly like /api/k8s/tiers, and
  // /HEALTH answers like /health (server/api-path.ts). Other paths, such as hashed
  // asset files, keep their case.
  app.use(normalizePathCase);

  // Security headers, with a CSP built from server/csp-config.ts
  app.use(createSecurityHeaders(isDevelopment));

  // Compress responses (gzip/brotli) to speed up first load of the JS/CSS bundle.
  app.use(compression());

  // Request logging for API calls. Registered before the rate limiter and the body
  // parser, so requests they reject (429, 400, 413, 415) are logged too.
  app.use(requestLogger);

  // Per-IP rate limit for the API (health checks are exempt so probes never fail).
  // Before body parsing, so malformed or oversized bodies count toward the limit
  // instead of being parsed and rejected without limit. Mounted on API_PATH (any letter
  // case), so even if normalizePathCase moved, no spelling of /api would skip the limit.
  app.use(API_PATH, createApiRateLimiter());

  // Parse JSON bodies for the API only; nothing else reads a body. API payloads are a
  // few hundred bytes, so cap bodies well below Express's 100kb default. The API takes
  // JSON only, so there is no urlencoded parser. API paths are lowercase by now. GET and
  // HEAD bodies are never read: no GET route uses one, and a health probe (exempt from
  // the rate limit) with a junk body must not become an unthrottled 400 and log line.
  const parseJson = express.json({ limit: "16kb" });
  app.use("/api", (req, res, next) =>
    req.method === "GET" || req.method === "HEAD" ? next() : parseJson(req, res, next));

  // CSP violation reporting endpoint (development only): browsers report blocked
  // content here, so CSP problems show up before they reach production. The route
  // applies its own rate limit before its own JSON parser (server/csp-report.ts).
  if (isDevelopment) {
    registerCspViolationEndpoint(app);
  }

  return app;
}

/** What a client is told for each body-parser rejection (by error type) */
export const CLIENT_ERRORS: Record<string, string> = {
  "entity.parse.failed": "Request body is not valid JSON",
  "entity.too.large": "Request body is larger than 16 KB",
  "charset.unsupported": "Unsupported charset in Content-Type; send UTF-8 JSON",
  "encoding.unsupported": "Unsupported Content-Encoding",
  "request.aborted": "Request aborted before the body was received",
  "request.size.invalid": "Request body size does not match Content-Length",
};

/**
 * Error handler, registered last so it also catches errors from static serving and
 * Vite. It always answers in JSON, whatever ?format= asks for: the errors that reach
 * it are malformed, oversized or wrongly encoded bodies (400, 413, 415, from
 * express.json) and unexpected failures (500). The plan and tiers routes answer their
 * own validation and planning errors, in the requested format.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  if (res.headersSent) {
    return next(err);
  }

  // Client errors (malformed JSON, oversized body) are expected; only log 5xx as errors.
  // For a client error, log body-parser's error type (entity.parse.failed,
  // entity.too.large, ...) and not its message: a JSON syntax error quotes part of the
  // body (Unexpected token 's', ..."mentName":secret-tok"...), and request bodies stay
  // out of the logs.
  if (status >= 500) {
    logger.error("Internal Server Error", { status, path: req.path, method: req.method }, err);
  } else {
    logger.warn("Request rejected", { status, path: req.path, method: req.method, type: err.type });
  }

  // Never echo an error's message: a 5xx message is internal, and a parser's message can
  // quote the submitted body. Clients get fixed text for the error's type or status.
  res.status(status).json({
    error: status >= 500 ? "Internal Server Error"
      : (Object.hasOwn(CLIENT_ERRORS, err.type) ? CLIENT_ERRORS[err.type] : STATUS_CODES[status]) ?? "Bad Request",
    code: status < 500 ? "INVALID_REQUEST" : "INTERNAL_ERROR",
  });
};
