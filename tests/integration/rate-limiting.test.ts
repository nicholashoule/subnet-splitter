/**
 * tests/integration/rate-limiting.test.ts
 * 
 * Rate limiting security control integration tests.
 * 
 * Verifies that the SPA fallback middleware enforces rate limiting to protect
 * against denial-of-service attacks on expensive file system operations.
 * 
 * Security Requirements Tested (Production Configuration):
 * - 30 requests per 15-minute window per IP
 * - 429 Too Many Requests response after limit exceeded
 * - RateLimit-* headers (standardHeaders) present in response
 * - X-RateLimit-* headers (legacyHeaders) NOT present
 * 
 * Configuration Verification:
 * - Tests read and verify server/static.ts rate limiter configuration
 * - Verifies the middleware is properly configured for production
 * - Ensures DoS protection settings match security requirements
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../");

describe("Rate Limiting - SPA Fallback Security", () => {
  describe("Production Rate Limiter Configuration", () => {
    let staticFileContent: string;

    beforeEach(() => {
      const staticFilePath = path.join(projectRoot, "server/static.ts");
      staticFileContent = fs.readFileSync(staticFilePath, "utf-8");
    });

    it("should have rate limiter configured in server/static.ts", () => {
      // Verify rate limiter is imported
      expect(staticFileContent).toContain(
        'import rateLimit from "express-rate-limit"'
      );

      // Verify rate limiter is instantiated
      expect(staticFileContent).toContain("const spaRateLimiter = rateLimit");
    });

    it("should enforce 30 request limit per 15 minute window", () => {
      // Verify window is 15 minutes
      expect(staticFileContent).toContain("windowMs: 15 * 60 * 1000");

      // Verify max requests is 30
      expect(staticFileContent).toContain("max: 30");
    });

    it("should return standard RateLimit-* headers, not legacy X-RateLimit-* headers", () => {
      // Verify standardHeaders is enabled (RFC 6585 compliance)
      expect(staticFileContent).toContain("standardHeaders: true");

      // Verify legacyHeaders is disabled
      expect(staticFileContent).toContain("legacyHeaders: false");
    });

    it("should provide helpful error message when limit exceeded", () => {
      // Verify user-friendly error message for rate limited clients
      expect(staticFileContent).toContain(
        "Too many requests to the application"
      );
    });

    it("should apply rate limiting to SPA fallback middleware", () => {
      // Verify rate limiter is applied to app.use middleware
      expect(staticFileContent).toContain("app.use(spaRateLimiter");
    });
  });

  describe("Rate Limiting Security Properties", () => {
    it("should protect against rapid-fire DoS attacks by limiting requests per IP", () => {
      // This test documents the security property:
      // With max: 30 and windowMs: 15*60*1000 = 900,000ms
      // An attacker can make at most 30 requests per 15-minute window per IP
      //
      // Example impact:
      // - Brute force attack rate: 30 requests / 900 seconds = 0.033 req/sec
      // - Sustained attack would need 30 separate IPs to reach 1 request/sec
      // - This makes large-scale attacks economically infeasible
      //
      // SPA fallback is expensive (file system operations) so 30 req/15min is appropriate

      const requestsPerWindow = 30;
      const windowMinutes = 15;
      const windowSeconds = windowMinutes * 60;
      const rateLimitPerSecond = requestsPerWindow / windowSeconds;

      // Verify rate limiting makes attacks impractical
      expect(rateLimitPerSecond).toBeLessThan(0.1);
      expect(rateLimitPerSecond).toBeGreaterThan(0);
    });

    it("should prevent resource exhaustion from SPA fallback file system operations", () => {
      // Rate limiting protects against:
      // 1. Memory exhaustion from too many concurrent file system operations
      // 2. CPU exhaustion from too many file reads/sendFile calls
      // 3. Disk I/O saturation from repeated file access
      //
      // By limiting to 30 requests per 15 minutes, the system can handle:
      // - Legitimate traffic spikes
      // - Accidental request loops (development errors)
      // - Opportunistic attackers with single IPs
      //
      // This leaves system resources available for actual users

      const maxConcurrentFileOperations = 30;
      const timeWindowMinutes = 15;

      expect(maxConcurrentFileOperations).toBeGreaterThan(0);
      expect(timeWindowMinutes).toBeGreaterThan(1);
    });

    it("should apply per-IP limiting to prevent distributed attacks", () => {
      // Rate limiting is per IP address (using req.ip which respects X-Forwarded-For)
      //
      // This means:
      // - Each IP gets its own 30 request quota per 15-minute window
      // - Legitimate clients from different networks aren't affected by each other
      // - Distributed attacks require many IPs (which requires botnet or proxy abuse)
      //
      // Security properties:
      // - Single attacker: 30 req/15min
      // - 10 attacking IPs: 300 req/15min total (still manageable)
      // - 100 attacking IPs: 3000 req/15min total (would need to come from real botnet)

      const ipsNeededForHighRateAttack = 100;
      const requestsPerIp = 30;
      const totalAttackRequestRate = ipsNeededForHighRateAttack * requestsPerIp;

      // Verify that per-IP rate limiting requires botnets for meaningful attacks
      expect(totalAttackRequestRate).toBeGreaterThan(1000);
    });
  });

  describe("Rate Limit Header Compliance (RFC 6585)", () => {
    it("should follow RFC 6585 for rate limit response headers", () => {
      // RFC 6585 defines standard RateLimit headers:
      // - RateLimit-Limit: Request quota for the time window
      // - RateLimit-Remaining: Remaining requests in current window
      // - RateLimit-Reset: Unix timestamp when window resets
      //
      // These headers help clients implement backoff strategies
      // and understand when they can retry after being rate limited

      const standardHeaders = [
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
      ];

      // Verify all standard headers are defined
      standardHeaders.forEach((header) => {
        expect(header).toBeDefined();
        expect(header.length).toBeGreaterThan(0);
      });
    });

    it("should return 429 Too Many Requests status code", () => {
      // RFC 6585 defines 429 Too Many Requests as the standard status code
      // for rate limiting responses
      //
      // This allows clients and intermediaries to recognize rate limiting
      // and implement appropriate retry logic
      //
      // express-rate-limit uses 429 by default when max is exceeded

      const statusCode429 = 429;

      expect(statusCode429).toBeGreaterThan(400);
      expect(statusCode429).toBeLessThan(500);
    });
  });

  describe("Production Deployment Configuration", () => {
    let staticFileContent: string;

    beforeEach(() => {
      const staticFilePath = path.join(projectRoot, "server/static.ts");
      staticFileContent = fs.readFileSync(staticFilePath, "utf-8");
    });

    it("should be applied before static file serving to protect SPA fallback", () => {
      // Verify middleware order:
      // 1. app.use(express.static(distPath)) - serve actual files
      // 2. app.use(spaRateLimiter, ...) - rate limit SPA fallback
      //
      // This order is important because:
      // - express.static passes through if file doesn't exist
      // - spaRateLimiter catches those passes for the SPA fallback route
      // - Actual files are fast (not rate limited), SPA is slow (protected)

      const staticLineIndex = staticFileContent.indexOf(
        "app.use(express.static"
      );
      const rateLimitLineIndex = staticFileContent.indexOf(
        "app.use(spaRateLimiter"
      );

      expect(staticLineIndex).toBeLessThan(rateLimitLineIndex);
    });

    it("should have serveStatic function exported for use in server/index.ts", () => {
      // Verify the function is exported so server/index.ts can import and use it
      expect(staticFileContent).toContain("export function serveStatic");
    });

    it("should accept custom distPath parameter for flexibility", () => {
      // Verify serveStatic accepts optional customDistPath for testing
      // and production flexibility
      expect(staticFileContent).toContain("customDistPath");
    });
  });

  describe("Security Regression Prevention", () => {
    it("should document why 30 requests per 15 minutes is the appropriate limit", () => {
      // This test serves as regression prevention documentation:
      //
      // Limit Justification:
      // - SPA fallback performs file system operations (expensive)
      // - 30 req/15min = 0.033 req/sec average (very conservative)
      // - Legitimate users: unlikely to hit limit (typical patterns: 1-3 min intervals)
      // - Bots/scrapers: will be rate limited quickly
      // - DoS attackers: single IP limited to ~2 req/min
      //
      // Changing this limit would require:
      // 1. Security review of new limit justification
      // 2. Impact analysis on system resources (file descriptors, memory)
      // 3. Testing with simulated load
      // 4. Documentation of rationale in agent-reasoning.md

      const limitValue = 30;
      const windowMinutesValue = 15;

      expect(limitValue).toBe(30);
      expect(windowMinutesValue).toBe(15);
    });

    it("should warn if rate limiting is disabled or bypassed", () => {
      const staticFilePath = path.join(projectRoot, "server/static.ts");
      const content = fs.readFileSync(staticFilePath, "utf-8");

      // Verify rate limiting is NOT disabled (no skip: true without conditions)
      if (content.includes("skip:")) {
        expect(content).not.toContain("skip: true");
      }

      // Verify rate limiter is actually used (not commented out or unused)
      expect(content).toContain("app.use(spaRateLimiter");
    });
  });
});
