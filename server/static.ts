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

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
