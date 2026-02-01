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
import rateLimit from "express-rate-limit";

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
    skip: (req): boolean => {
      // Skip rate limiting for certain development paths
      // Only apply to actual SPA fallback requests (routes without file extensions)
      const urlPath = req.path;
      const ext = path.extname(urlPath);
      return !!(ext && ext !== '.html'); // Only rate limit HTML/route requests
    },
  });

  // SPA fallback: serve index.html for client-side routes
  // This runs AFTER Vite middleware, so Vite handles actual assets first
  app.use(spaRateLimiter, async (req, res, next) => {
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

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
}
