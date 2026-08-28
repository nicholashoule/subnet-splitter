/**
 * tests/integration/static-serving.test.ts
 *
 * Production static-serving integration tests.
 *
 * Verifies the performance-oriented behaviors of the production build path:
 * - Content-hashed assets are cached aggressively (immutable, 1 year)
 * - index.html is never cached (must revalidate to pick up new builds)
 * - Responses are gzip-compressed to speed up first load
 *
 * Mirrors the production middleware order from server/index.ts:
 *   app.use(compression()) -> serveStatic(app)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import compression from "compression";
import request from "supertest";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import { serveStatic } from "../../server/static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A hashed asset filename, as emitted by Vite (content hash in the name).
const HASHED_ASSET = "assets/index-TESTHASH.js";
// Payload large enough to exceed compression's default 1KB threshold.
const LARGE_JS = `console.log(${JSON.stringify("x".repeat(4096))});\n`;

describe("Static Serving (Production Configuration)", () => {
  let app: Express;
  let mockDistPath: string;

  beforeEach(async () => {
    app = express();

    const tmpPrefix = path.join(os.tmpdir(), "test-static-");
    mockDistPath = await fs.promises.mkdtemp(tmpPrefix);

    await fs.promises.writeFile(
      path.join(mockDistPath, "index.html"),
      "<html><body>SPA</body></html>",
    );
    await fs.promises.mkdir(path.join(mockDistPath, "assets"));
    await fs.promises.writeFile(path.join(mockDistPath, HASHED_ASSET), LARGE_JS);

    // A non-hashed static file (favicon, manifest, robots.txt, etc.).
    await fs.promises.writeFile(
      path.join(mockDistPath, "favicon.ico"),
      "icon-bytes",
    );

    // Match production middleware order: compression before static serving.
    app.use(compression());
    serveStatic(app, mockDistPath);
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(mockDistPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Cache-Control headers", () => {
    it("should serve content-hashed assets as immutable for one year", async () => {
      const response = await request(app).get("/" + HASHED_ASSET);

      expect(response.status).toBe(200);
      const cacheControl = response.headers["cache-control"];
      expect(cacheControl).toContain("max-age=31536000");
      expect(cacheControl).toContain("immutable");
    });

    it("should serve index.html with no-cache", async () => {
      const response = await request(app).get("/index.html");

      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-cache");
    });

    it("should not cache non-hashed static files immutably", async () => {
      const response = await request(app).get("/favicon.ico");

      expect(response.status).toBe(200);
      const cacheControl = response.headers["cache-control"];
      expect(cacheControl).toBe("no-cache");
      expect(cacheControl).not.toContain("immutable");
    });
  });

  describe("Response compression", () => {
    it("should gzip-compress large assets when the client accepts gzip", async () => {
      const response = await request(app)
        .get("/" + HASHED_ASSET)
        .set("Accept-Encoding", "gzip");

      expect(response.status).toBe(200);
      expect(response.headers["content-encoding"]).toBe("gzip");
    });

    it("should not compress when the client does not accept encoding", async () => {
      const response = await request(app)
        .get("/" + HASHED_ASSET)
        .set("Accept-Encoding", "identity");

      expect(response.status).toBe(200);
      expect(response.headers["content-encoding"]).toBeUndefined();
    });
  });
});
