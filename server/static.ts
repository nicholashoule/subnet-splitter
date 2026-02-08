/**
 * server/static.ts
 * 
 * Static file serving for production builds. Used in production mode to serve
 * the built client application and handle SPA routing.
 * 
 * Serves files from the dist/public directory and falls back to index.html
 * for client-side routing (SPA pattern).
 */

import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export function serveStatic(app: Express, customDistPath?: string) {
  const distPath = customDistPath || path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const spaRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // limit each IP to 30 SPA fallback requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many requests to the application. Please wait a moment and try again.",
    // Custom key generator: handle undefined IPs gracefully and normalize IPv6
    // When trust proxy = false, req.ip may be undefined for some connections
    keyGenerator: (req) => req.ip ? ipKeyGenerator(req.ip) : 'unknown',
  });

  app.use(express.static(distPath));

  // SPA fallback for client-side routing with selective rate limiting:
  // - GET/HEAD requests to routes (no file extension) are rate-limited and served index.html
  // - GET/HEAD requests to files (with extension) fall through to 404
  // - POST/PUT/DELETE/etc bypass rate limiting and fall through to 404
  // Runs AFTER express.static so actual assets are served first
  app.use((req, res, next) => {
    // Only serve SPA fallback for GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    // Only serve SPA fallback for route-like requests (no file extension)
    // This prevents accidentally serving index.html for missed assets
    const ext = path.extname(req.path);
    if (ext && ext !== '.html') {
      // Request has a file extension (other than .html), let it fall through to 404
      return next();
    }

    // Apply rate limiter to GET/HEAD (expensive file system operation)
    spaRateLimiter(req, res, () => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  });
}
