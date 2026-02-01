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

const app = express();

// Security headers with environment-aware CSP configuration
// Development mode needs relaxed CSP for Vite HMR and Replit plugins
// Production mode uses strict CSP for maximum security
const isDevelopment = process.env.NODE_ENV !== "production";
const isReplit = process.env.REPL_ID !== undefined;

const cspDirectives: Record<string, string[]> = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  // 'unsafe-inline' required for dynamic chart inline styles (see client/src/components/ui/chart.tsx)
  // and for Tailwind CSS compiled styles that rely on inline style blocks.
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
};

// In development, allow WebSocket connections for Vite HMR
if (isDevelopment) {
  cspDirectives.connectSrc.push("ws://127.0.0.1:*", "ws://localhost:*");
}

// In Replit development environment, allow additional origins for Replit plugins
// These plugins inject runtime error overlays, cartographer, and dev banner
// Also relax frameAncestors to allow embedding in Replit IDE's webview/iframe
if (isDevelopment && isReplit) {
  cspDirectives.scriptSrc.push("https://*.replit.com", "https://*.replit.dev");
  cspDirectives.connectSrc.push("https://*.replit.com", "https://*.replit.dev", "wss://*.replit.com", "wss://*.replit.dev");
  cspDirectives.imgSrc.push("https://*.replit.com", "https://*.replit.dev");
  cspDirectives.frameAncestors.push("https://*.replit.com", "https://*.replit.dev");
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: cspDirectives,
  },
  crossOriginEmbedderPolicy: false,
}));
const httpServer = createServer(app);

app.use(express.json());

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

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
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

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
      log(`serving on ${host}:${port}`);
    });
    
    httpServer.once("error", (err: any) => {
      if (err.code === "ENOTSUP" || err.code === "EADDRINUSE") {
        log(`${host} failed (${err.code}), trying next host`);
        httpServer.removeAllListeners();
        hostIndex++;
        tryListen();
      } else {
        throw err;
      }
    });
  };
  
  tryListen();
})();
