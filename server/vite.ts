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

const viteDevLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  // Localhost is exempt from rate limiting for better DX
  skip: (req) => {
    const ip = req.ip;
    const hostHeader = req.headers.host ?? "";
    return (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      hostHeader.startsWith("localhost") ||
      hostHeader.startsWith("127.0.0.1")
    );
  },
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests, please try again later.",
    });
  },
});

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

  const spaRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // limit each IP to 30 SPA fallback requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many requests to the application. Please wait a moment and try again.",
  });

  app.use("/{*path}", spaRateLimiter, async (req, res, next) => {
    const url = req.originalUrl;

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
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
