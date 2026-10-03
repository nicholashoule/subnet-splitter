/**
 * tests/integration/rate-limiting.test.ts
 * 
 * Rate limiting security control integration tests.
 * 
 * End-to-end tests verifying that the SPA fallback middleware enforces rate
 * limiting to protect against denial-of-service attacks on expensive
 * operations (file I/O and HTML transformation).
 * 
 * Security Behaviors Tested:
 * - 30 requests per 15-minute window per IP (production configuration)
 * - 429 Too Many Requests response after limit exceeded (RFC 6585)
 * - RateLimit-* headers (IETF draft-ietf-httpapi-ratelimit-headers) present in all responses
 * - X-RateLimit-* headers (legacy) NOT present
 * - Per-IP rate limiting (separate quota per client IP, told apart via X-Forwarded-For
 *   behind a trusted proxy)
 * - Message guidance when rate limited
 *
 * Also covers the API limiter (100 requests per minute, health checks exempt) and
 * request logging of rejected requests (429, 400), using the production app from
 * server/app.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import { serveStatic } from "../../server/static";
import { createApp, errorHandler } from "../../server/app";
import { logger } from "../../server/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Rate Limiting - SPA Fallback (Production Configuration)", () => {
  let app: Express;
  let mockDistPath: string;

  beforeEach(async () => {
    app = express();
    
    // Create temporary mock dist directory with index.html
    // Use os.tmpdir() + fs.mkdtemp() instead of node_modules to avoid:
    // - Polluting the workspace
    // - Conflicts with package manager (npm/yarn/pnpm)
    // - Issues with read-only installs
    const tmpPrefix = path.join(os.tmpdir(), "test-dist-");
    mockDistPath = await fs.promises.mkdtemp(tmpPrefix);
    await fs.promises.writeFile(
      path.join(mockDistPath, "index.html"),
      "<html><body>SPA</body></html>"
    );

    // Use actual production middleware from server/static.ts
    // This ensures tests verify the real configuration and behavior
    serveStatic(app, mockDistPath);
  });

  afterEach(async () => {
    // Cleanup mock directory
    try {
      await fs.promises.rm(mockDistPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Request Limit Enforcement (30 requests per 15 min)", () => {
    it("should allow 30 requests within the window", async () => {
      // Make exactly 30 requests
      for (let i = 0; i < 30; i++) {
        const response = await request(app).get("/some-route");
        expect(response.status).toBe(200);
      }
    });

    it("should reject the 31st request with 429 Too Many Requests", async () => {
      // Make 30 requests to reach the limit
      for (let i = 0; i < 30; i++) {
        await request(app).get("/route-" + i);
      }

      // 31st request should be rejected
      const response = await request(app).get("/route-31");
      expect(response.status).toBe(429);
      expect(response.text).toContain("Too many requests");
    });

    it("should return 429 with helpful error message", async () => {
      // Exhaust the limit
      for (let i = 0; i < 30; i++) {
        await request(app).get("/route-" + i);
      }

      const response = await request(app).get("/over-limit");
      expect(response.status).toBe(429);
      expect(response.text).toContain(
        "Too many requests to the application. Please wait a moment and try again."
      );
    });
  });

  describe("Standard RateLimit Headers", () => {
    it("should include RateLimit-* headers in responses", async () => {
      const response = await request(app).get("/test-route");
      expect(response.status).toBe(200);

      // Check for the standard RateLimit-* headers (IETF draft, not the legacy X-RateLimit-*)
      expect(response.headers["ratelimit-limit"]).toBeDefined();
      expect(response.headers["ratelimit-remaining"]).toBeDefined();
      expect(response.headers["ratelimit-reset"]).toBeDefined();
    });

    it("should have correct header values", async () => {
      const response = await request(app).get("/test-route");

      // Initial request should show 29 remaining (out of 30)
      expect(response.headers["ratelimit-limit"]).toBe("30");
      expect(response.headers["ratelimit-remaining"]).toBe("29");
      expect(response.headers["ratelimit-reset"]).toBeDefined();
    });

    it("should NOT include legacy X-RateLimit-* headers", async () => {
      const response = await request(app).get("/test-route");

      // Legacy headers should NOT be present
      expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
      expect(response.headers["x-ratelimit-remaining"]).toBeUndefined();
      expect(response.headers["x-ratelimit-reset"]).toBeUndefined();
    });

    it("should decrement RateLimit-Remaining with each request", async () => {
      // First request
      const response1 = await request(app).get("/test-1");
      const remaining1 = parseInt(response1.headers["ratelimit-remaining"] as string, 10);
      expect(remaining1).toBe(29);

      // Second request
      const response2 = await request(app).get("/test-2");
      const remaining2 = parseInt(response2.headers["ratelimit-remaining"] as string, 10);
      expect(remaining2).toBe(28);

      // Verify proper decrement
      expect(remaining2).toBe(remaining1 - 1);
    });

    it("should show 0 remaining when at limit", async () => {
      // Make exactly 30 requests to reach the limit
      let lastResponse;
      for (let i = 0; i < 30; i++) {
        lastResponse = await request(app).get("/route-" + i);
      }

      // Last successful request should show 0 remaining
      expect(lastResponse!.headers["ratelimit-remaining"]).toBe("0");
    });
  });

  describe("Per-IP Rate Limiting", () => {
    it("should enforce rate limits per client IP", async () => {
      // Every supertest request comes from 127.0.0.1, so two clients are told apart the
      // way they are behind a proxy: trust one hop (TRUST_PROXY=1) and let
      // X-Forwarded-For carry the client address that becomes req.ip
      app.set("trust proxy", 1);
      const first = "203.0.113.10";
      const second = "203.0.113.20";

      // Exhaust the first client's quota
      for (let i = 0; i < 30; i++) {
        const response = await request(app).get("/route-" + i).set("X-Forwarded-For", first);
        expect(response.status).toBe(200);
      }
      expect((await request(app).get("/over-limit").set("X-Forwarded-For", first)).status).toBe(429);

      // The second client still has its own full quota
      const other = await request(app).get("/over-limit").set("X-Forwarded-For", second);
      expect(other.status).toBe(200);
      expect(other.headers["ratelimit-remaining"]).toBe("29");
    });
  });

  describe("DoS Protection Effectiveness", () => {
    it("should prevent rapid-fire requests from all succeeding", async () => {
      let successCount = 0;
      let rejectedCount = 0;

      // Simulate 50 rapid requests
      for (let i = 0; i < 50; i++) {
        const response = await request(app).get("/spam-route-" + i);

        if (response.status === 200) {
          successCount++;
        } else if (response.status === 429) {
          rejectedCount++;
        }
      }

      // Should only allow 30, reject the rest
      expect(successCount).toBe(30);
      expect(rejectedCount).toBe(20);
    });

    it("should protect expensive SPA response operations", async () => {
      // Each successful request triggers HTML response generation (expensive operation)
      // Rate limiting prevents resource exhaustion from too many concurrent requests

      const successfulRequests: number[] = [];

      // Track successful responses (200 status)
      for (let i = 0; i < 40; i++) {
        const response = await request(app).get("/route-" + i);
        if (response.status === 200) {
          successfulRequests.push(i);
        }
      }

      // Only 30 requests should succeed
      expect(successfulRequests.length).toBe(30);
    });
  });

  describe("Configuration Validation", () => {
    it("should have production rate limit of 30 requests", async () => {
      // Verify by making exactly 30 requests successfully, then 31st fails
      for (let i = 0; i < 30; i++) {
        const response = await request(app).get("/route-" + i);
        expect(response.status).toBe(200);
      }

      const response31 = await request(app).get("/route-31");
      expect(response31.status).toBe(429);
    });

    it("should have 15-minute window", async () => {
      const response = await request(app).get("/test");
      
      // RateLimit-Reset is the number of seconds until the window resets (not a
      // timestamp); on the first request of a fresh window it is close to 900
      const reset = Number(response.headers["ratelimit-reset"]);
      expect(reset).toBeGreaterThan(840);
      expect(reset).toBeLessThanOrEqual(900);
      expect(response.headers["ratelimit-policy"]).toBe("30;w=900");
    });
  });

  describe("Security Regression Prevention", () => {
    it("should return 200 status with HTML content for successful SPA fallback", async () => {
      const response = await request(app).get("/any-client-route");
      
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.text).toContain("SPA");
    });

    it("should enforce rate limiting on all SPA fallback requests (no bypass)", async () => {
      // Try various route patterns - all should count toward the limit
      const routes = [
        "/dashboard",
        "/settings",
        "/profile",
        "/404-not-found",
      ];

      // Make 30 requests to different routes
      for (let i = 0; i < 30; i++) {
        const route = routes[i % routes.length];
        const response = await request(app).get(route + "-" + i);
        expect(response.status).toBe(200);
      }

      // Next request (different route) should still be rate limited
      const response31 = await request(app).get("/new-route");
      expect(response31.status).toBe(429);
    });

    it("should not expose internals in error responses", async () => {
      // Exhaust the limit
      for (let i = 0; i < 30; i++) {
        await request(app).get("/route-" + i);
      }

      const response = await request(app).get("/over-limit");
      expect(response.status).toBe(429);

      // Error message should be user-friendly, not expose stack traces
      expect(response.text).not.toContain("Error");
      expect(response.text).not.toContain("stack");
      expect(response.text).toContain("Too many requests");
    });
  });

  describe("HTTP Method Handling", () => {
    it("should serve SPA for GET requests to unknown routes", async () => {
      const response = await request(app).get("/unknown-route");
      expect(response.status).toBe(200);
      expect(response.text).toContain("SPA");
    });

    it("should serve SPA for HEAD requests to unknown routes", async () => {
      const response = await request(app).head("/unknown-route");
      expect(response.status).toBe(200);
    });

    it("should return 404 for POST to unknown routes (not SPA fallback)", async () => {
      const response = await request(app).post("/unknown-api-endpoint");
      // POST should not trigger SPA fallback - falls through to 404
      expect(response.status).toBe(404);
    });

    it("should return 404 for PUT to unknown routes (not SPA fallback)", async () => {
      const response = await request(app).put("/unknown-api-endpoint");
      expect(response.status).toBe(404);
    });

    it("should return 404 for DELETE to unknown routes (not SPA fallback)", async () => {
      const response = await request(app).delete("/unknown-api-endpoint");
      expect(response.status).toBe(404);
    });

    it("should return 404 for PATCH to unknown routes (not SPA fallback)", async () => {
      const response = await request(app).patch("/unknown-api-endpoint");
      expect(response.status).toBe(404);
    });

    it("should not count POST/PUT/DELETE toward rate limit (no SPA serve)", async () => {
      // 30 non-GET requests first: none reach the SPA fallback or its limiter
      for (let i = 0; i < 10; i++) {
        expect((await request(app).post("/some-post")).status).toBe(404);
        expect((await request(app).put("/some-put")).status).toBe(404);
        expect((await request(app).delete("/some-delete")).status).toBe(404);
      }

      // The full GET quota is still available...
      for (let i = 0; i < 30; i++) {
        expect((await request(app).get("/route-" + i)).status).toBe(200);
      }
      // ...and only then is GET limited
      expect((await request(app).get("/should-be-limited")).status).toBe(429);
    });
  });
});
describe("Rate Limiting - API (100 requests per minute)", () => {
  let app: Express;

  beforeEach(() => {
    // The production app from server/app.ts: the limiter is mounted on /api ahead of
    // the routes
    app = createApp({ isDevelopment: false });
    app.get("/api/k8s/tiers", (_req, res) => { res.json({ ok: true }); });
    app.get("/api/v1/health", (_req, res) => { res.json({ status: "healthy" }); });
  });

  it("should allow 100 API requests then return 429 with a JSON error", async () => {
    for (let i = 0; i < 100; i++) {
      const response = await request(app).get("/api/k8s/tiers");
      expect(response.status).toBe(200);
    }

    const limited = await request(app).get("/api/k8s/tiers");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: expect.stringContaining("Too many requests"),
      code: "RATE_LIMITED",
    });
    expect(limited.headers).toHaveProperty("ratelimit-limit");
  });

  it("should never rate limit health probes", async () => {
    for (let i = 0; i < 101; i++) {
      await request(app).get("/api/k8s/tiers");
    }

    const health = await request(app).get("/api/v1/health");
    expect(health.status).toBe(200);
  });

  it("should count malformed and oversized bodies toward the limit (the limiter runs before the JSON parser)", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {}); // errorHandler's "Request rejected"
    try {
      app.post("/api/k8s/plan", (_req, res) => { res.json({ ok: true }); });
      app.use(errorHandler);
      const post = () => request(app).post("/api/k8s/plan").set("Content-Type", "application/json");

      for (let i = 0; i < 50; i++) {
        expect((await post().send("{bad")).status).toBe(400);
        expect((await post().send(JSON.stringify({ pad: "a".repeat(17 * 1024) }))).status).toBe(413);
      }

      // 100 rejected bodies used the whole quota, so even a valid request is now limited
      expect((await post().send("{}")).status).toBe(429);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("Request logging of rejected requests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should log rate-limited (429) and malformed-body (400) requests", async () => {
    const logged = vi.spyOn(logger, "request").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {}); // errorHandler's "Request rejected"
    // The production app from server/app.ts (request logging, then the limiter, then
    // body parsing), a route, and the error handler, as server/index.ts assembles them
    const app = createApp({ isDevelopment: false });
    app.post("/api/k8s/plan", (_req, res) => { res.json({ ok: true }); });
    app.use(errorHandler);

    const malformed = await request(app).post("/api/k8s/plan").set("Content-Type", "application/json").send("{bad");
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("INVALID_REQUEST");
    for (let i = 0; i < 100; i++) {
      await request(app).post("/api/k8s/plan").send({});
    }
    const limited = await request(app).post("/api/k8s/plan").send({});
    expect(limited.status).toBe(429);
    await new Promise((resolve) => setImmediate(resolve)); // let the last "finish" listener run

    const statuses = logged.mock.calls.map(([, , status]) => status);
    expect(statuses).toContain(400);
    expect(statuses).toContain(429);
  });

  it("should build the server from createApp() and end with errorHandler in server/index.ts", () => {
    // The tests above exercise createApp(); this ties it to the server that ships
    const source = fs.readFileSync(path.resolve(__dirname, "../../server/index.ts"), "utf8");
    expect(source).toContain("const app = createApp({ isDevelopment });");
    expect(source).toContain("app.use(errorHandler);");
    expect(source).not.toMatch(/express\(\)|express\.json\(|app\.use\(requestLogger\)/);
  });
});
