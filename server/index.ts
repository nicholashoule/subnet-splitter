/**
 * server/index.ts
 *
 * Main Express server entry point. Builds the app with server/app.ts (security
 * headers, compression, request logging, JSON body parsing, API rate limiting), then:
 * - Registers the API routes
 * - Serves the built client (production) or the Vite dev server (development)
 * - Adds the JSON error handler
 * - Starts the HTTP server with request timeouts and graceful shutdown
 *
 * Environment:
 * - PORT (default 5000): serves both the API and the client
 * - HOST (default 0.0.0.0 in production, 127.0.0.1 in development)
 * - TRUST_PROXY: see below
 */

import { createServer } from "http";
import { createApp, errorHandler } from "./app";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { logger } from "./logger";

// Development relaxes the CSP for Vite HMR and adds the CSP violation endpoint.
// Production (NODE_ENV=production, inlined into dist/index.cjs by scripts/build.ts)
// uses the strict CSP.
const isDevelopment = process.env.NODE_ENV !== "production";

const app = createApp({ isDevelopment });

// Timeouts against slow or stalled clients, passed to the constructor so Node checks
// them at startup (headersTimeout must not exceed requestTimeout):
// - requestTimeout: a whole request, headers and body, must arrive within 30 s
// - headersTimeout: its headers within 20 s
// - keepAliveTimeout: an idle keep-alive connection is kept for 65 s, longer than
//   common load-balancer idle timeouts (AWS ALB: 60 s), so the load balancer closes
//   idle connections first and never sends a request on one this server just closed
// Node enforces the first two on a 30 s timer (connectionsCheckingInterval), so a
// request is cut off up to 30 s after its limit.
const httpServer = createServer(
  { requestTimeout: 30_000, headersTimeout: 20_000, keepAliveTimeout: 65_000 },
  app,
);

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
  app.use(errorHandler);

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
