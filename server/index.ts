/**
 * server/index.ts
 * 
 * Main Express server entry point. Handles:
 * - HTTP server creation with security middleware (helmet)
 * - JSON/URL-encoded request parsing
 * - API route registration
 * - Vite development server integration
 * - Static file serving in production
 * - Request/response logging
 * - Error handling
 * 
 * Serves on PORT env variable (default 5000) for both API and client
 */

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logger } from "./logger";
import { baseCSPDirectives, developmentCSPAdditions, replitCSPAdditions } from "./csp-config";

const app = express();

// Security headers with environment-aware CSP configuration
// Development mode needs relaxed CSP for Vite HMR and Replit plugins
// Production mode uses strict CSP for maximum security
const isDevelopment = process.env.NODE_ENV !== "production";
const isReplit = process.env.REPL_ID !== undefined;

// Build CSP directives from shared configuration
// Start with base directives, then add environment-specific additions
const cspDirectives: Record<string, string[]> = { ...baseCSPDirectives };

// In development, add relaxed CSP for Vite HMR, CSP violation reporting, and Replit tooling
if (isDevelopment) {
  // Vite injects inline scripts for Fast Refresh and HMR
  cspDirectives.scriptSrc = [...(cspDirectives.scriptSrc || []), ...developmentCSPAdditions.scriptSrc];
  // Enable CSP violation reporting so we catch issues before production
  cspDirectives.connectSrc = [...(cspDirectives.connectSrc || []), ...developmentCSPAdditions.connectSrc];
  cspDirectives.reportUri = developmentCSPAdditions.reportUri;

  // In Replit development environment, allow additional origins for Replit plugins
  // These plugins inject runtime error overlays, cartographer, and dev banner
  if (isReplit) {
    cspDirectives.scriptSrc = [...(cspDirectives.scriptSrc || []), ...replitCSPAdditions.scriptSrc];
    cspDirectives.connectSrc = [...(cspDirectives.connectSrc || []), ...replitCSPAdditions.connectSrc];
    cspDirectives.imgSrc = [...(cspDirectives.imgSrc || []), ...replitCSPAdditions.imgSrc];
  }
}

// Security middleware with strict CSP configuration
// crossOriginEmbedderPolicy is disabled to allow embedding external resources needed by the SPA
// Note: xssFilter and noSniff were removed - they are deprecated and not supported in Helmet v8
// X-XSS-Protection header is deprecated by browsers and should not be enabled
// X-Content-Type-Options: nosniff is set by default in Helmet v8
app.use(helmet({
  contentSecurityPolicy: {
    directives: cspDirectives,
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
const httpServer = createServer(app);

// Configure trust proxy for accurate client IP detection in rate limiting
// WARNING: Only trust proxies you control. Trusting untrusted proxies allows X-Forwarded-For spoofing
// which breaks per-IP rate limiting. Attackers can then bypass rate limits or cause collateral damage.
//
// Configuration via environment variables (default to secure-by-default):
// - TRUST_PROXY=false (default): Don't trust any proxy headers, use direct socket IP
// - TRUST_PROXY=loopback: Trust only loopback (127.0.0.1, ::1) - for development
// - TRUST_PROXY=<N>: Trust N hops through proxies (e.g., 1 for single reverse proxy)
// - TRUST_PROXY="<IP1>,<IP2>,...": Trust specific proxy IPs/CIDRs (e.g., "10.0.0.0/8,127.0.0.1")
const trustProxyConfig = process.env.TRUST_PROXY || (isDevelopment ? 'loopback' : 'false');

if (trustProxyConfig === 'false' || trustProxyConfig === '0') {
  // Default: don't trust any proxies - use direct socket IP
  // Safe for direct internet exposure or when running behind unknown proxies
  app.set('trust proxy', false);
} else if (trustProxyConfig === 'loopback') {
  // Development mode: trust only localhost (safe for local development)
  app.set('trust proxy', ['127.0.0.1', '::1']);
} else if (/^\d+$/.test(trustProxyConfig)) {
  // Numeric value: trust N hops through proxies
  app.set('trust proxy', parseInt(trustProxyConfig, 10));
} else {
  // Assume it's a comma-separated list of IPs/CIDRs
  app.set('trust proxy', trustProxyConfig.split(',').map(ip => ip.trim()));
}

app.use(express.json());

app.use(express.urlencoded({ extended: false }));

// CSP violation reporting endpoint (development only)
// Browsers send CSP violation reports here when content is blocked
// This helps catch CSP issues early before pushing to production
if (isDevelopment) {
  app.post('/__csp-violation', (req: Request, res: Response) => {
    const violation = req.body;
    if (violation && violation['blocked-uri']) {
      logger.warn('CSP Violation Detected in Development', {
        blockedUri: violation['blocked-uri'],
        violatedDirective: violation['violated-directive'],
        originalPolicy: violation['original-policy'],
        sourceFile: violation['source-file'],
        lineNumber: violation['line-number'],
        columnNumber: violation['column-number'],
        documentUri: violation['document-uri'],
      });
    }
    res.status(204).end();
  });
}

// Deprecated: Legacy log function - use structured logger instead
// Kept for backward compatibility during transition
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Request logging middleware with structured logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const context: Record<string, any> = {
        method: req.method,
        path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      };

      if (capturedJsonResponse) {
        context.response = capturedJsonResponse;
      }

      logger.request(req.method, path, res.statusCode, duration, context);
    }
  });

  next();
});

(async () => {
  const { routes } = await registerRoutes(httpServer, app);

  // Categorize routes
  const healthRoutes = routes.filter(r => r.path.startsWith("/health") && !r.path.startsWith("/api"));
  const apiHealthRoutes = routes.filter(r => r.path.startsWith("/api/v1/health"));
  
  // Primary API endpoints (concise)
  const primaryApiRoutes = routes.filter(r => 
    r.path === "/api/k8s/plan" || 
    r.path === "/api/k8s/tiers" ||
    r.path === "/api/version" ||
    r.path === "/api/docs" ||
    r.path === "/api/docs/ui"
  );
  
  // Versioned short-form aliases
  const versionedAliases = routes.filter(r => r.path.startsWith("/api/v1/k8s/"));
  
  // Descriptive long-form endpoints
  const descriptiveRoutes = routes.filter(r => 
    r.path.includes("/kubernetes/") && 
    (r.path.startsWith("/api/v1/kubernetes/") || r.path.startsWith("/api/kubernetes/"))
  );
  
  // Other routes
  const otherRoutes = routes.filter(r => 
    !healthRoutes.includes(r) &&
    !apiHealthRoutes.includes(r) &&
    !primaryApiRoutes.includes(r) &&
    !versionedAliases.includes(r) &&
    !descriptiveRoutes.includes(r)
  );

  logger.info(`Registered ${routes.length} routes`, {
    total: routes.length,
    health: healthRoutes.length,
    apiHealth: apiHealthRoutes.length,
    primary: primaryApiRoutes.length,
    aliases: versionedAliases.length,
    descriptive: descriptiveRoutes.length,
    other: otherRoutes.length
  });

  if (healthRoutes.length > 0) {
    logger.info("Health check routes:");
    healthRoutes.forEach(r => {
      logger.info(`  ${r.method.padEnd(6)} ${r.path}`);
    });
  }

  if (apiHealthRoutes.length > 0) {
    logger.info("API health routes:");
    apiHealthRoutes.forEach(r => {
      logger.info(`  ${r.method.padEnd(6)} ${r.path}`);
    });
  }

  if (primaryApiRoutes.length > 0) {
    logger.info("Primary API routes (concise):");
    primaryApiRoutes.forEach(r => {
      logger.info(`  ${r.method.padEnd(6)} ${r.path}`);
    });
  }

  if (versionedAliases.length > 0) {
    logger.info("Versioned short-form aliases:");
    versionedAliases.forEach(r => {
      logger.info(`  ${r.method.padEnd(6)} ${r.path}`);
    });
  }

  if (descriptiveRoutes.length > 0) {
    logger.info("Descriptive long-form endpoints:");
    descriptiveRoutes.forEach(r => {
      logger.info(`  ${r.method.padEnd(6)} ${r.path}`);
    });
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error("Internal Server Error", {
      status,
      path: _req.path,
      method: _req.method,
    }, err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const hosts = ["127.0.0.1", "localhost"];
  let hostIndex = 0;
  
  const tryListen = () => {
    if (hostIndex >= hosts.length) {
      throw new Error("Could not bind to any host");
    }
    
    const host = hosts[hostIndex];
    httpServer.listen(port, host, () => {
      logger.info(`Server started`, {
        host,
        port,
        environment: process.env.NODE_ENV || "development",
      });
    });
    
    httpServer.once("error", (err: any) => {
      if (err.code === "ENOTSUP" || err.code === "EADDRINUSE") {
        logger.warn(`Failed to bind to ${host}`, {
          code: err.code,
          host,
          port,
        });
        httpServer.removeAllListeners();
        hostIndex++;
        tryListen();
      } else {
        logger.error("Server startup error", { host, port }, err);
        throw err;
      }
    });
  };
  
  tryListen();
})();
