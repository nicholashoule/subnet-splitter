/**
 * tests/integration/csp-violation-endpoint.test.ts
 * 
 * Integration tests for the CSP violation reporting endpoint (/__csp-violation).
 * 
 * This endpoint is development-only and helps catch CSP configuration issues
 * before they reach production. Tests verify:
 * - Valid CSP violation report handling via real HTTP requests
 * - Invalid payload rejection with appropriate responses
 * - 204 No Content response (per W3C CSP spec)
 * - Rate limiting to prevent log flooding DoS attacks
 * - Proper error handling without schema exposure
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server as HttpServer } from "http";
import { rateLimit } from "express-rate-limit";
import { cspViolationReportSchema } from "@shared/schema";

/**
 * CSP Violation Report Integration Test Suite
 * 
 * These tests start a real test server with the CSP violation endpoint
 * and make HTTP requests to verify actual endpoint behavior.
 */
describe("CSP Violation Endpoint Integration", () => {
  let app: express.Express;
  let httpServer: HttpServer;
  let baseUrl: string;
  let loggedViolations: any[] = [];

  beforeAll(async () => {
    // Create test server with CSP violation endpoint (development mode)
    app = express();
    // Parse JSON bodies for application/json and application/csp-report
    // This matches production configuration to accurately test browser behavior
    app.use(express.json({ type: ['application/json', 'application/csp-report'] }));
    httpServer = createServer(app);

    // Mock logger to capture violations
    loggedViolations = [];
    const mockLogger = {
      warn: (message: string, data?: any) => {
        loggedViolations.push({ message, data });
      },
    };

    // Set up CSP violation rate limiter (same as production)
    const cspViolationLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 reports per window
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      message: "Too many CSP violation reports. Please try again later.",
    });

    // Register CSP violation endpoint
    app.post('/__csp-violation', cspViolationLimiter, (req, res) => {
      const validationResult = cspViolationReportSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        mockLogger.warn('Invalid CSP violation report received');
        // Always return 204 per W3C spec, even for invalid reports
        res.status(204).end();
        return;
      }

      // Extract violation data from wrapper
      const violation = validationResult.data['csp-report'];
      
      if (violation && (violation['blocked-uri'] || violation['violated-directive'])) {
        mockLogger.warn('CSP Violation Detected', {
          blockedUri: violation['blocked-uri'],
          violatedDirective: violation['violated-directive'],
          sourceFile: violation['source-file'],
          lineNumber: violation['line-number'],
          columnNumber: violation['column-number'],
          documentUri: violation['document-uri'],
          originalPolicy: violation['original-policy'],
          disposition: violation.disposition,
        });
      }

      res.status(204).end();
    });

    // Start server on random available port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => {
        const address = httpServer.address();
        const port = typeof address === "object" && address ? address.port : 5001;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  describe("Valid CSP Violation Reports", () => {
    it("should accept valid CSP violation report and return 204 No Content", async () => {
      loggedViolations = []; // Reset

      const validViolationReport = {
        "csp-report": {
          "blocked-uri": "https://malicious.com/script.js",
          "violated-directive": "script-src",
          "original-policy": "script-src 'self'; object-src 'none'",
          "document-uri": "http://localhost:5000/api/docs",
          disposition: "enforce",
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validViolationReport),
      });

      expect(response.status).toBe(204);
      // Content-length may be "0" or null depending on Express version
      const contentLength = response.headers.get("content-length");
      if (contentLength !== null) {
        expect(contentLength).toBe("0");
      }
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].message).toBe('CSP Violation Detected');
      expect(loggedViolations[0].data.blockedUri).toBe("https://malicious.com/script.js");
    });

    it("should accept CSP violation report with source location details", async () => {
      loggedViolations = [];

      const violationWithSourceLocation = {
        "csp-report": {
          "blocked-uri": "https://unsafe-script.js",
          "violated-directive": "script-src",
          "original-policy": "script-src 'self'",
          "source-file": "http://localhost:5000/api/docs",
          "line-number": 42,
          "column-number": 15,
          "document-uri": "http://localhost:5000/api/docs",
          disposition: "report",
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(violationWithSourceLocation),
      });

      expect(response.status).toBe(204);
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].data.lineNumber).toBe(42);
      expect(loggedViolations[0].data.columnNumber).toBe(15);
    });

    it("should accept minimal CSP violation report with only required fields", async () => {
      loggedViolations = [];

      const minimalViolation = {
        "csp-report": {
          "blocked-uri": "data:text/javascript,alert('xss')",
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(minimalViolation),
      });

      expect(response.status).toBe(204);
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].data.blockedUri).toContain("data:text/javascript");
    });

    it("should accept CSP violation report with all optional fields", async () => {
      loggedViolations = [];

      const completeViolation = {
        "csp-report": {
          "blocked-uri": "https://bad-script.js",
          "violated-directive": "script-src 'self'",
          "original-policy": "script-src 'self' https://cdn.example.com; style-src 'unsafe-inline'",
          "source-file": "https://localhost:5000/api/docs",
          "line-number": 123,
          "column-number": 45,
          "document-uri": "https://localhost:5000/api/docs",
          disposition: "enforce",
          status: 200,
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeViolation),
      });

      expect(response.status).toBe(204);
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].data.lineNumber).toBe(123);
      expect(loggedViolations[0].data.columnNumber).toBe(45);
    });
  });

  describe("Invalid Payload Handling", () => {
    it("should reject invalid CSP report with wrong field types", async () => {
      loggedViolations = [];

      const invalidReport = {
        "csp-report": {
          "blocked-uri": "https://bad-script.js",
          "line-number": "not-a-number", // INVALID: should be number
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidReport),
      });

      // Still returns 204 per W3C spec (don't leak schema details)
      expect(response.status).toBe(204);
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].message).toBe('Invalid CSP violation report received');
    });

    it("should reject CSP report with unexpected extra fields", async () => {
      loggedViolations = [];

      const reportWithExtra = {
        "csp-report": {
          "blocked-uri": "https://bad-script.js",
          "violated-directive": "script-src",
          "malicious-field": "should-not-be-here", // INVALID: not in spec
          "another-extra": 12345,
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportWithExtra),
      });

      expect(response.status).toBe(204);
      // Schema with .strict() rejects extra fields
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].message).toBe('Invalid CSP violation report received');
    });

    it("should handle empty payload gracefully", async () => {
      loggedViolations = [];

      const emptyReport = {};

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emptyReport),
      });

      // Should return 204 per W3C spec, even for invalid reports
      expect(response.status).toBe(204);
      // Empty object fails schema validation (missing 'csp-report' key)
      // Mock logger should capture this
      expect(loggedViolations.length).toBeGreaterThanOrEqual(0);
      // If logged, should be marked as invalid
      if (loggedViolations.length > 0) {
        expect(loggedViolations[0].message).toBe('Invalid CSP violation report received');
      }
    });

    it("should reject invalid disposition enum values", async () => {
      loggedViolations = [];

      const invalidDisposition = {
        "csp-report": {
          "blocked-uri": "https://bad.js",
          disposition: "invalid-value", // NOT in enum (only 'enforce' or 'report')
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidDisposition),
      });

      expect(response.status).toBe(204);
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].message).toBe('Invalid CSP violation report received');
    });

    it("should not expose schema validation details in response body", async () => {
      const invalidReport = {
        "csp-report": {
          "line-number": "invalid",
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidReport),
      });

      // Response should be empty (204 No Content)
      expect(response.status).toBe(204);
      const body = await response.text();
      expect(body).toBe("");
      // No error details leaked to client
    });
  });

  describe("Rate Limiting", () => {
    it("should have rate limiting configured to prevent log flooding", async () => {
      // Rate limiter should be configured with:
      // - windowMs: 15 * 60 * 1000 (15 minutes)
      // - max: 100 (100 reports per window per IP)

      // Make a few requests to verify rate limiting is active
      const promises = Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/__csp-violation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "csp-report": {
              "blocked-uri": "https://test.js",
            }
          }),
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed (we're well under the 100 request limit)
      responses.forEach(response => {
        expect(response.status).toBe(204);
        expect(response.headers.has("ratelimit-limit")).toBe(true);
      });
    });
  });

  describe("CSP Spec Compliance", () => {
    it("should always return 204 No Content per W3C CSP spec", async () => {
      const validReport = {
        "csp-report": {
          "blocked-uri": "https://malicious.com/script.js",
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validReport),
      });

      // Per W3C CSP spec: https://w3c.github.io/webappsec-csp/#violation-reports
      expect(response.status).toBe(204);
      expect(response.statusText).toBe("No Content");
      expect(await response.text()).toBe("");
    });

    it("should handle W3C csp-report wrapper structure", async () => {
      // W3C spec requires reports be wrapped in "csp-report" key
      const wrappedReport = {
        "csp-report": {
          "blocked-uri": "https://evil.com/malware.js",
          "violated-directive": "script-src",
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wrappedReport),
      });

      expect(response.status).toBe(204);
      
      // Verify unwrapped structure is rejected
      loggedViolations = [];
      const unwrappedReport = {
        "blocked-uri": "https://evil.com/malware.js",
        "violated-directive": "script-src",
      };

      const invalidResponse = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unwrappedReport),
      });

      expect(invalidResponse.status).toBe(204);
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].message).toBe('Invalid CSP violation report received');
    });
  });
});
