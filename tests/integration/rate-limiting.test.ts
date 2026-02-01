/**
 * tests/integration/rate-limiting.test.ts
 * 
 * Integration tests for rate limiting on the SPA fallback route.
 * Verifies that the rate limiting security feature works as intended.
 * 
 * Tests:
 * - Rate limiting is properly applied to the SPA fallback route
 * - Requests are blocked after exceeding the limit (30 requests per 15 minutes)
 * - Rate limit headers are returned correctly
 * - The limiter resets after the window expires
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { serveStatic } from "../../server/static";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../");

describe("Rate Limiting on SPA Fallback", () => {
  let app: Express;
  let distPath: string;
  let indexHtmlPath: string;
  let tempDir: string;

  beforeEach(() => {
    // Create a test Express app
    app = express();
    
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rate-limit-test-"));
    distPath = tempDir;
    indexHtmlPath = path.join(distPath, "index.html");
    
    // Create a test index.html
    fs.writeFileSync(indexHtmlPath, "<!DOCTYPE html><html><body>Test SPA</body></html>");
    
    // Setup static serving with rate limiting, using custom distPath
    serveStatic(app, distPath);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should apply rate limiting to the SPA fallback route", async () => {
    // Make a request to a route that will trigger the SPA fallback
    const response = await request(app).get("/some-spa-route");
    
    expect(response.status).toBe(200);
    expect(response.headers["ratelimit-limit"]).toBeDefined();
    expect(response.headers["ratelimit-remaining"]).toBeDefined();
    expect(response.headers["ratelimit-reset"]).toBeDefined();
  });

  it("should return correct rate limit headers", async () => {
    const response = await request(app).get("/test-route");
    
    // Check that rate limit headers are present
    expect(response.headers["ratelimit-limit"]).toBe("30");
    expect(response.headers["ratelimit-remaining"]).toBeDefined();
    expect(parseInt(response.headers["ratelimit-remaining"])).toBeLessThanOrEqual(30);
    expect(parseInt(response.headers["ratelimit-remaining"])).toBeGreaterThanOrEqual(0);
    
    // Check that legacy headers are disabled
    expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
    expect(response.headers["x-ratelimit-remaining"]).toBeUndefined();
  });

  it("should block requests after exceeding the rate limit", async () => {
    // Make 30 requests (the limit)
    const promises = Array.from({ length: 30 }, (_, i) => 
      request(app).get(`/test-route-${i}`)
    );
    
    const responses = await Promise.all(promises);
    
    // All 30 requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
    
    // The 31st request should be rate limited
    const blockedResponse = await request(app).get("/test-route-blocked");
    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.text).toContain("Too many requests");
  });

  it("should provide helpful error message when rate limited", async () => {
    // Exhaust the rate limit
    const promises = Array.from({ length: 30 }, (_, i) => 
      request(app).get(`/exhaust-${i}`)
    );
    await Promise.all(promises);
    
    // Next request should be blocked with helpful message
    const response = await request(app).get("/blocked-request");
    expect(response.status).toBe(429);
    expect(response.text).toContain("Too many requests to the application");
    expect(response.text).toContain("Please wait a moment and try again");
  });

  it("should not rate limit static file requests", async () => {
    // Create a test static file
    const staticFilePath = path.join(distPath, "test-static.txt");
    fs.writeFileSync(staticFilePath, "test content");
    
    // Make multiple requests to the static file
    // Static files should NOT be rate limited by the SPA fallback limiter
    const promises = Array.from({ length: 35 }, () => 
      request(app).get("/test-static.txt")
    );
    
    const responses = await Promise.all(promises);
    
    // All requests to the static file should succeed (not rate limited)
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.text).toBe("test content");
    });
    
    // Clean up
    fs.unlinkSync(staticFilePath);
  });

  it("should have rate limit window of 15 minutes", async () => {
    // Make a request and check the reset time
    const response = await request(app).get("/check-window");
    
    expect(response.status).toBe(200);
    
    // RateLimit-Reset header contains the timestamp when the limit resets
    const resetTime = parseInt(response.headers["ratelimit-reset"]);
    const currentTime = Math.floor(Date.now() / 1000);
    
    // The reset time should be approximately 15 minutes (900 seconds) in the future
    // Allow some tolerance for test execution time
    const timeDifference = resetTime - currentTime;
    expect(timeDifference).toBeGreaterThan(850); // At least 14 minutes
    expect(timeDifference).toBeLessThanOrEqual(900); // At most 15 minutes
  });
});

describe("Rate Limiting Configuration", () => {
  it("should have rate limiter configured with correct parameters", async () => {
    const app = express();
    const distPath = path.join(projectRoot, "dist", "public");
    
    // Ensure dist directory exists
    if (!fs.existsSync(distPath)) {
      fs.mkdirSync(distPath, { recursive: true });
    }
    
    // Create index.html if it doesn't exist
    const indexHtmlPath = path.join(distPath, "index.html");
    if (!fs.existsSync(indexHtmlPath)) {
      fs.writeFileSync(indexHtmlPath, "<!DOCTYPE html><html><body>Test</body></html>");
    }
    
    serveStatic(app);
    
    const response = await request(app).get("/config-test");
    
    // Verify rate limit is 30
    expect(response.headers["ratelimit-limit"]).toBe("30");
    
    // Verify standard headers are enabled
    expect(response.headers["ratelimit-remaining"]).toBeDefined();
    expect(response.headers["ratelimit-reset"]).toBeDefined();
  });
});
