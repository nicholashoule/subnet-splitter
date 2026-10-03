/**
 * tests/integration/static-serving.test.ts
 *
 * Production static-serving integration tests.
 *
 * Verifies the performance-oriented behaviors of the production build path:
 * - Vite's content-hashed files in assets/ are cached aggressively (immutable, 1 year)
 * - Everything else revalidates: index.html, and files copied from client/public,
 *   even when their names look hashed (github-nicholashoule.png)
 * - Responses are gzip-compressed to speed up first load
 *
 * Builds the production app as server/index.ts does: createApp() (server/app.ts,
 * which adds compression) followed by serveStatic().
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Express } from "express";
import request from "supertest";
import path from "path";
import fs from "fs";
import os from "os";
import { createApp } from "../../server/app";
import { serveStatic } from "../../server/static";

// A hashed asset filename, as emitted by Vite (content hash in the name).
const HASHED_ASSET = "assets/index-TESTHASH.js";
// Payload large enough to exceed compression's default 1KB threshold.
const LARGE_JS = `console.log(${JSON.stringify("x".repeat(4096))});\n`;

describe("Static Serving (Production Configuration)", () => {
  let app: Express;
  let mockDistPath: string;

  beforeEach(async () => {
    const tmpPrefix = path.join(os.tmpdir(), "test-static-");
    mockDistPath = await fs.promises.mkdtemp(tmpPrefix);

    await fs.promises.writeFile(
      path.join(mockDistPath, "index.html"),
      "<html><body>SPA</body></html>",
    );
    await fs.promises.mkdir(path.join(mockDistPath, "assets"));
    await fs.promises.writeFile(path.join(mockDistPath, HASHED_ASSET), LARGE_JS);

    // Non-hashed static files copied from client/public. The second one's name
    // matches the hash pattern (a hyphen and 8+ letters before the extension).
    await fs.promises.writeFile(path.join(mockDistPath, "favicon.ico"), "icon-bytes");
    await fs.promises.writeFile(path.join(mockDistPath, "github-nicholashoule.png"), "png-bytes");

    app = createApp({ isDevelopment: false });
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

    it("should not cache files outside assets/ immutably, even when their names look hashed", async () => {
      const response = await request(app).get("/github-nicholashoule.png");

      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-cache");
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
