/**
 * tests/integration/csp-violation-endpoint.test.ts
 * 
 * Integration tests for the CSP violation reporting endpoint (/__csp-violation).
 * 
 * This endpoint is development-only and helps catch CSP configuration issues
 * before they reach production. Tests verify:
 * - Valid CSP violation report handling via real HTTP requests, including the
 *   application/csp-report content type browsers send
 * - Invalid payload rejection with appropriate responses
 * - An empty 204 No Content for every report (browsers ignore the response); malformed
 *   JSON is rejected by the body parser first (400)
 * - Rate limiting to prevent log flooding DoS attacks
 * - Proper error handling without schema exposure
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { createApp, errorHandler } from "../../server/app";
import { logger } from "../../server/logger";
import { closeTestServer, type TestServer } from "../helpers/test-server";

/**
 * Serves the development app from server/app.ts, which registers the endpoint behind
 * the server's own body parser and limiter, followed by the error handler, as
 * server/index.ts does
 */
async function startDevServer(): Promise<TestServer> {
  const app = createApp({ isDevelopment: true });
  app.use(errorHandler);
  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;
  return { app, httpServer, port, baseUrl: `http://127.0.0.1:${port}` };
}

/**
 * CSP Violation Report Integration Test Suite
 *
 * These tests make real HTTP requests to the production endpoint
 * (server/csp-report.ts) in the development app.
 */
describe("CSP Violation Endpoint Integration", () => {
  let server: TestServer;
  let baseUrl: string;
  let loggedViolations: any[] = [];
  let debugLog: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    // Capture what the real handler logs
    debugLog = vi.spyOn(logger, "debug").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation((message: string, data?: any) => {
      loggedViolations.push({ message, data });
    });

    server = await startDevServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await closeTestServer(server);
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
      // A 204 carries no Content-Length (RFC 9110, section 8.6)
      expect(response.headers.get("content-length")).toBeNull();
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].message).toBe('CSP Violation Detected in Development');
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

      // Every field of the report-uri serialization, as Chrome and Firefox send it
      const completeViolation = {
        "csp-report": {
          "document-uri": "https://localhost:5000/api/docs",
          referrer: "",
          "blocked-uri": "inline",
          "effective-directive": "script-src-elem",
          "violated-directive": "script-src-elem",
          "original-policy": "script-src 'self' 'report-sample'; report-uri /__csp-violation",
          disposition: "enforce",
          "status-code": 200,
          "script-sample": "alert(1)",
          "source-file": "https://localhost:5000/api/docs",
          "line-number": 123,
          "column-number": 45,
        }
      };

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeViolation),
      });

      expect(response.status).toBe(204);
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].message).toBe('CSP Violation Detected in Development');
      expect(loggedViolations[0].data).toMatchObject({
        effectiveDirective: "script-src-elem",
        scriptSample: "alert(1)",
        lineNumber: 123,
        columnNumber: 45,
      });
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

      // Still answers 204 (don't leak schema details)
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

      // Answers 204 even for invalid reports
      expect(response.status).toBe(204);
      // The csp-report wrapper is optional, so {} is a valid but empty report:
      // no warning, just a debug entry
      expect(loggedViolations).toHaveLength(0);
      expect(debugLog).toHaveBeenCalledWith('CSP violation report received with minimal data', { bodyFields: 0 });
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
      // - limit: 100 (100 reports per window per IP)

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

      // All succeed (well under the limit); the policy header shows 100 reports per 15 minutes
      responses.forEach(response => {
        expect(response.status).toBe(204);
        expect(response.headers.get("ratelimit-limit")).toBe("100");
        expect(response.headers.get("ratelimit-policy")).toBe("100;w=900");
      });
    });
  });

  describe("CSP Spec Compliance", () => {
    it("should answer a report with an empty 204 No Content", async () => {
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

      // The CSP spec defines no response (browsers ignore it); the endpoint sends an empty 204
      expect(response.status).toBe(204);
      expect(response.statusText).toBe("No Content");
      expect(await response.text()).toBe("");
    });

    it("should handle the csp-report wrapper structure", async () => {
      // The report-uri serialization (CSP spec) wraps each report in a "csp-report" key
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

    it("should parse application/csp-report bodies, the type browsers send", async () => {
      loggedViolations = [];

      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: JSON.stringify({ "csp-report": { "blocked-uri": "inline", "effective-directive": "script-src-elem" } }),
      });

      expect(response.status).toBe(204);
      expect(loggedViolations).toHaveLength(1);
      expect(loggedViolations[0].message).toBe('CSP Violation Detected in Development');
      expect(loggedViolations[0].data).toMatchObject({ blockedUri: "inline", effectiveDirective: "script-src-elem" });
    });

    it("should leave malformed JSON to the body parser: 400 with the JSON error body", async () => {
      loggedViolations = [];

      // express.json() rejects it before the endpoint runs, so it is not a 204
      const response = await fetch(`${baseUrl}/__csp-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: "{not json",
      });

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("INVALID_REQUEST");
      expect(loggedViolations.map((entry) => entry.message)).toEqual(["Request rejected"]);
    });
  });
});

describe("CSP Violation Endpoint Rate Limit", () => {
  it("should acknowledge reports past the limit with 204 but not log them", async () => {
    // A server of its own, so the reports above don't count toward this limiter
    const server = await startDevServer();
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const report = () => fetch(`${server.baseUrl}/__csp-violation`, {
      method: "POST",
      headers: { "Content-Type": "application/csp-report" },
      body: JSON.stringify({ "csp-report": { "blocked-uri": "https://flood.example/x.js", "effective-directive": "script-src-elem" } }),
    });

    try {
      for (let i = 0; i < 100; i++) {
        expect((await report()).status).toBe(204);
      }
      expect(warn).toHaveBeenCalledTimes(100);
      // Parsed as JSON (application/csp-report) and logged as real violations
      expect(warn).toHaveBeenLastCalledWith('CSP Violation Detected in Development', expect.objectContaining({ blockedUri: "https://flood.example/x.js" }));

      const limited = await report();
      expect(limited.status).toBe(204);
      expect(await limited.text()).toBe("");
      expect(limited.headers.get("ratelimit-remaining")).toBe("0");
      expect(warn).toHaveBeenCalledTimes(100);
    } finally {
      warn.mockRestore();
      await closeTestServer(server);
    }
  });
});
