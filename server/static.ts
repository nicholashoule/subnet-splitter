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
import rateLimit from "express-rate-limit";

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
  });

  app.use(express.static(distPath));

  // SPA fallback for client-side routing with selective rate limiting:
  // - GET/HEAD requests (the expensive SPA fallback) are rate-limited
  // - POST/PUT/DELETE/etc bypass rate limiting and fall through to 404
  app.use((req, res, next) => {
    // Only serve SPA fallback for GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    // Apply rate limiter to GET/HEAD (expensive file system operation)
    spaRateLimiter(req, res, () => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  });
}
