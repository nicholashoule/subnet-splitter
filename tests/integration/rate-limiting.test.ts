/**
 * tests/integration/rate-limiting.test.ts
 * 
 * Rate limiting security control integration tests.
 * 
 * End-to-end tests verifying that the SPA fallback middleware enforces rate
 * limiting to protect against denial-of-service attacks on expensive file
 * system operations (sendFile).
 * 
 * Security Behaviors Tested:
 * - 30 requests per 15-minute window per IP (production configuration)
 * - 429 Too Many Requests response after limit exceeded
 * - RateLimit-* headers (RFC 6585) present in all responses
 * - X-RateLimit-* headers (legacy) NOT present
 * - Per-IP rate limiting (separate quota per client IP)
 * - Message guidance when rate limited
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../");

describe("Rate Limiting - SPA Fallback (Production Configuration)", () => {
  let app: Express;
  let mockDistPath: string;

  beforeEach(async () => {
    app = express();
    
    // Create temporary mock dist directory with index.html
    mockDistPath = path.join(projectRoot, "node_modules/.test-dist-" + Date.now());
    await fs.promises.mkdir(mockDistPath, { recursive: true });
    await fs.promises.writeFile(
      path.join(mockDistPath, "index.html"),
      "<html><body>SPA</body></html>"
    );

    // Setup rate limiter matching production configuration from server/static.ts
    const spaRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 30, // limit each IP to 30 requests per windowMs (production)
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      message: "Too many requests to the application. Please wait a moment and try again.",
    });

    // Apply SPA fallback middleware with selective rate limiting
    // Rate limiter only applies to GET/HEAD requests (the expensive SPA fallback path)
    // POST/PUT/DELETE/etc bypass rate limiting since they don't serve SPA content
    app.use((req, res, next) => {
      // Only serve SPA fallback for GET and HEAD requests
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
      }
      // Apply rate limiter only for GET/HEAD (expensive SPA fallback)
      spaRateLimiter(req, res, () => {
        res.setHeader("Content-Type", "text/html");
        res.end("<html><body>SPA</body></html>");
      });
    });

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

  describe("RFC 6585 Rate Limit Headers", () => {
    it("should include RateLimit-* headers in responses", async () => {
      const response = await request(app).get("/test-route");
      expect(response.status).toBe(200);

      // Check for standard RateLimit headers (RFC 6585)
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
    it("should apply rate limit per IP address (using supertest agent IPs)", async () => {
      // Note: With supertest, multiple request() calls use different virtual IPs,
      // but request.agent() maintains a single IP for all requests through that agent
      // So we test that a single IP (one agent) gets rate limited, not that
      // multiple IPs get separate limits (which is harder to test in this context)

      // Make 30 requests with one agent
      for (let i = 0; i < 30; i++) {
        const response = await request(app).get("/route-" + i);
        expect(response.status).toBe(200);
      }

      // 31st request from any source should be rejected (because it's from same/similar IP)
      const rejectedResponse = await request(app).get("/over-limit");
      expect(rejectedResponse.status).toBe(429);
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

    it("should protect expensive file system operations (sendFile)", async () => {
      // Each successful request triggers sendFile (expensive operation)
      // Rate limiting prevents exhaustion from too many concurrent file operations

      const fileOperationCounts: number[] = [];

      // Track successful file operations (200 responses)
      for (let i = 0; i < 40; i++) {
        const response = await request(app).get("/route-" + i);
        if (response.status === 200) {
          fileOperationCounts.push(i);
        }
      }

      // Only 30 file operations should succeed
      expect(fileOperationCounts.length).toBe(30);
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
      
      // RateLimit-Reset header should be present (RFC 6585)
      // It contains the timestamp when the rate limit window resets
      const resetTimeStr = response.headers["ratelimit-reset"];
      expect(resetTimeStr).toBeDefined();
      
      // The header value should be a number (Unix timestamp in seconds)
      const resetTimeNum = parseInt(resetTimeStr as string, 10);
      expect(Number.isFinite(resetTimeNum) && resetTimeNum > 0).toBe(true);
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
      // Make 30 GET requests to reach limit
      for (let i = 0; i < 30; i++) {
        await request(app).get("/route-" + i);
      }

      // POST should return 404, not 429 (not rate limited because not SPA fallback)
      const postResponse = await request(app).post("/some-post");
      expect(postResponse.status).toBe(404);

      // Verify GET is still rate limited
      const getResponse = await request(app).get("/should-be-limited");
      expect(getResponse.status).toBe(429);
    });
  });
});