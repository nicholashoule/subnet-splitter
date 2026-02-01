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

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
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

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", spaRateLimiter, (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
