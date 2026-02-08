/**
 * server/vite.ts
 * 
 * Vite development server integration. Sets up Vite's middleware mode for
 * development to provide HMR (Hot Module Replacement) and on-the-fly compilation.
 * 
 * Used only in development mode. Handles:
 * - Template transformation and injection
 * - Vite middleware integration with Express
 * - HMR configuration
 * - Module resolution and bundling
 */

import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Rate limiter for SPA fallback (development or production)
  // Even in development, protect file system operations from resource exhaustion
  const spaRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // More generous limit for development (100 vs production 30)
    standardHeaders: true,
    legacyHeaders: false,
    // Custom key generator: handle undefined IPs gracefully and normalize IPv6
    // When trust proxy = false, req.ip may be undefined for some connections
    keyGenerator: (req) => req.ip ? ipKeyGenerator(req.ip) : 'localhost-dev',
    skip: (req): boolean => {
      // Skip rate limiting for requests with file extensions
      // NOTE: This only skips rate limiting; the SPA fallback handler has its own
      // file-extension guard to prevent serving index.html for file requests
      const urlPath = req.path;
      const ext = path.extname(urlPath);
      return !!(ext && ext !== '.html'); // Only rate limit HTML/route requests
    },
  });

  // SPA fallback for client-side routing with selective rate limiting:
  // - GET/HEAD requests to routes (no file extension) are rate-limited and served index.html
  // - GET/HEAD requests to files (with extension) fall through to 404
  // - POST/PUT/DELETE/etc bypass rate limiting and fall through to 404
  // Runs AFTER Vite middleware so actual assets are served by Vite first
  app.use(async (req, res, next) => {
    // Only serve SPA fallback for GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    // Only serve SPA fallback for route-like requests (no file extension)
    // This prevents accidentally serving index.html for missed assets/modules
    const urlPath = req.path;
    const ext = path.extname(urlPath);
    if (ext && ext !== '.html') {
      // Request has a file extension (other than .html), let it fall through to 404
      return next();
    }

    // Apply rate limiter to GET/HEAD (expensive file system operation)
    spaRateLimiter(req, res, async () => {
      try {
        const clientTemplate = path.resolve(
          import.meta.dirname,
          "..",
          "client",
          "index.html",
        );

        // For HEAD requests, skip transformation and just send headers
        if (req.method === 'HEAD') {
          res.status(200).set({ "Content-Type": "text/html" }).end();
          return;
        }

        // always reload the index.html file from disk incase it changes
        let template = await fs.promises.readFile(clientTemplate, "utf-8");
        template = template.replace(
          `src="/src/main.tsx"`,
          `src="/src/main.tsx?v=${nanoid()}"`,
        );
        const page = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(page);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  });
}
