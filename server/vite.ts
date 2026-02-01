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

  // SPA fallback: serve index.html for client-side routes
  // This runs AFTER Vite middleware, so Vite handles actual assets first
  app.use(async (req, res, next) => {
    // Use req.path to exclude query strings (req.originalUrl includes ?params)
    const urlPath = req.path;
    
    // Skip fallback for file requests (has extension but not .html)
    // Use path.extname() for proper extension detection instead of string matching
    // This prevents issues like /foo?ref=a.b from being incorrectly treated as files
    const ext = path.extname(urlPath);
    if (ext && ext !== '.html') {
      return next();
    }

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
