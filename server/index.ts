/**
 * server/index.ts
 *
 * Main Express server entry point. Handles:
 * - HTTP server creation with security middleware (helmet)
 * - JSON/URL-encoded request parsing
 * - API rate limiting and route registration
 * - Vite development server integration
 * - Static file serving in production
 * - Request/response logging
 * - Error handling
 *
 * Environment:
 * - PORT (default 5000): serves both the API and the client
 * - HOST (default 0.0.0.0 in production, 127.0.0.1 in development)
 * - TRUST_PROXY: see below
 */

import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerCspViolationEndpoint } from "./csp-report";
import { registerRoutes, createApiRateLimiter } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logger, requestLogger } from "./logger";
import { createSecurityHeaders } from "./csp-config";

const app = express();

// Match routes case-sensitively, as the rate limiter, its health-check exemption and
// request logging do (/API/K8S/PLAN is not an API path)
app.set("case sensitive routing", true);

// Security headers with environment-aware CSP configuration
// Development mode needs relaxed CSP for Vite HMR
// Production mode uses strict CSP for maximum security
const isDevelopment = process.env.NODE_ENV !== "production";

// Security headers, with a CSP built from server/csp-config.ts
app.use(createSecurityHeaders(isDevelopment));

// Compress responses (gzip/brotli) to speed up first load of the JS/CSS bundle.
app.use(compression());

const httpServer = createServer(app);

// Configure trust proxy for accurate client IP detection in rate limiting
// WARNING: Only trust proxies you control. Trusting untrusted proxies allows X-Forwarded-For spoofing
// which breaks per-IP rate limiting. Attackers can then bypass rate limits or cause collateral damage.
//
// Configuration via environment variables (default to secure-by-default):
// - TRUST_PROXY=false (default): Don't trust any proxy headers, use direct socket IP
// - TRUST_PROXY=<N>: Trust N hops through proxies (e.g., 1 for single reverse proxy)
// - TRUST_PROXY="<IP1>,<IP2>,...": Trust specific proxy IPs/CIDRs (e.g., "10.0.0.0/8,127.0.0.1")
// - TRUST_PROXY=true: Trust every proxy (any client can then set its own IP; avoid)
const trustProxyConfig = (process.env.TRUST_PROXY || 'false').trim().toLowerCase();

try {
  if (trustProxyConfig === 'false' || trustProxyConfig === '0') {
    // Default: don't trust any proxies - use direct socket IP
    // Safe for direct internet exposure, local development, or when running behind unknown proxies
    app.set('trust proxy', false);
  } else if (trustProxyConfig === 'true') {
    logger.warn('TRUST_PROXY=true trusts X-Forwarded-For from any client; per-IP rate limits can be bypassed. Prefer a hop count or proxy addresses.');
    app.set('trust proxy', true);
  } else if (/^\d+$/.test(trustProxyConfig)) {
    // Numeric value: trust N hops through proxies
    app.set('trust proxy', parseInt(trustProxyConfig, 10));
  } else {
    // Comma-separated list of IPs/CIDRs (Express rejects invalid entries)
    app.set('trust proxy', trustProxyConfig.split(',').map(ip => ip.trim()));
  }
} catch (error) {
  logger.error('Invalid TRUST_PROXY: use false, true, a hop count, or comma-separated proxy IPs/CIDRs', {
    value: process.env.TRUST_PROXY,
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}

// Request logging for API calls. Registered before the body parsers and the rate
// limiter, so requests they reject (400, 413, 429) are logged too.
app.use(requestLogger);

// Parse JSON bodies for application/json and application/csp-report
// Browsers send CSP violation reports with Content-Type: application/csp-report per W3C spec
// API payloads are a few hundred bytes, so cap bodies well below Express's 100kb default.
app.use(express.json({ type: ['application/json', 'application/csp-report'], limit: "16kb" }));

app.use(express.urlencoded({ extended: false, limit: "16kb" }));

// Per-IP rate limit for the API (health checks are exempt so probes never fail)
app.use("/api", createApiRateLimiter());

// CSP violation reporting endpoint (development only): browsers report blocked
// content here, so CSP problems show up before they reach production
if (isDevelopment) {
  registerCspViolationEndpoint(app);
}

(async () => {
  const { routes } = await registerRoutes(httpServer, app);

  logger.info(`Registered ${routes.length} routes`);
  for (const r of routes) {
    logger.debug(`  ${r.method.padEnd(6)} ${r.path}`);
  }

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Error handler last, so it also catches errors from static serving and Vite
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
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
    return res.status(status).json({
      error: status < 500 ? err.message || "Bad Request" : "Internal Server Error",
      code: status < 500 ? "INVALID_REQUEST" : "INTERNAL_ERROR",
    });
  });

  // Serve the app on PORT (default 5000); this serves both the API and the client.
  // Production binds all interfaces so the server is reachable inside containers;
  // development binds loopback only. Override either with HOST.
  const portSetting = (process.env.PORT || "5000").trim();
  const port = Number(portSetting);
  if (!/^\d+$/.test(portSetting) || port < 1 || port > 65535) {
    logger.error("Invalid PORT: use an integer from 1 to 65535", { value: process.env.PORT });
    process.exit(1);
  }
  const host = process.env.HOST || (isDevelopment ? "127.0.0.1" : "0.0.0.0");

  // Harden the HTTP server against slow-client and hung-socket attacks.
  // keepAliveTimeout < headersTimeout avoids race conditions on keep-alive
  // connections; requestTimeout caps total time for a single request.
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
  httpServer.requestTimeout = 30_000;

  // Graceful shutdown so in-flight requests can drain on redeploys/signals.
  let shuttingDown = false;
  const shutdown = (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { signal });
    httpServer.close((err) => {
      if (err) {
        logger.error("Error during shutdown", {}, err);
        process.exit(1);
      }
      process.exit(exitCode);
    });
    // Force-exit if connections don't drain within the grace period.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error(
      "Unhandled promise rejection",
      {},
      reason instanceof Error ? reason : new Error(String(reason)),
    );
    shutdown("unhandledRejection", 1);
  });
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", {}, err);
    shutdown("uncaughtException", 1);
  });

  httpServer.once("error", (err) => {
    logger.error("Server startup error", { host, port }, err);
    process.exit(1);
  });

  httpServer.listen(port, host, () => {
    logger.info("Server started", {
      host,
      port,
      environment: process.env.NODE_ENV || "development",
    });
  });
})();
