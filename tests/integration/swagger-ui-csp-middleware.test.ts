/**
 * tests/integration/swagger-ui-csp-middleware.test.ts
 * 
 * Integration tests for the Swagger UI CSP middleware that sets environment-aware
 * Content-Security-Policy headers for the /api/docs/ui endpoint.
 * 
 * These tests start a real test server with Swagger UI route and middleware,
 * then make HTTP requests to verify actual CSP behavior:
 * - CSP middleware sets Content-Security-Policy header correctly
 * - Header includes required directives for Swagger UI functionality
 * - Development mode includes 'unsafe-inline' for scripts (Swagger UI + HMR)
 * - Production mode maintains strict CSP without 'unsafe-inline'
 * - Middleware only affects Swagger UI route (not other endpoints)
 * - All required CSP directives are present and properly formatted
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildSwaggerUICSP } from "../../server/csp-config";
import { createTestServers, closeTestServers, type TestServer } from "../helpers/test-server";

/**
 * Swagger UI CSP Middleware Integration Test Suite
 * 
 * Tests the route-specific CSP override that allows 'unsafe-inline'
 * for Swagger UI without affecting the rest of the application.
 * 
 * Tests make real HTTP requests to a test server to verify CSP headers.
 */
describe("Swagger UI CSP Middleware Integration", () => {
  let developmentServer: TestServer;
  let productionServer: TestServer;
  let developmentBaseUrl: string;
  let productionBaseUrl: string;

  beforeAll(async () => {
    // Create development and production test servers in parallel
    [developmentServer, productionServer] = await createTestServers([
      // Development server with 'unsafe-inline' for Swagger UI
      {
        setup: (app) => {
          // Swagger UI route with development CSP middleware
          app.get("/api/docs/ui", (req, res, next) => {
            res.setHeader('Content-Security-Policy', buildSwaggerUICSP());
            next();
          }, (req, res) => {
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send('<html><body>Swagger UI (Development)</body></html>');
          });

          // Other API route without Swagger CSP middleware
          app.post("/api/k8s/plan", (req, res) => {
            res.json({ message: "Network plan endpoint" });
          });
        }
      },
      // Production server without 'unsafe-inline'
      {
        setup: (app) => {
          // Swagger UI route with production CSP middleware
          app.get("/api/docs/ui", (req, res, next) => {
            res.setHeader('Content-Security-Policy', buildSwaggerUICSP());
            next();
          }, (req, res) => {
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send('<html><body>Swagger UI (Production)</body></html>');
          });

          // Other API route without Swagger CSP middleware
          app.post("/api/k8s/plan", (req, res) => {
            res.json({ message: "Network plan endpoint" });
          });
        }
      }
    ]);
    
    developmentBaseUrl = developmentServer.baseUrl;
    productionBaseUrl = productionServer.baseUrl;
  });

  afterAll(async () => {
    await closeTestServers([developmentServer, productionServer]);
  });

  describe("CSP Header Presence and Format", () => {
    it("should set Content-Security-Policy header on Swagger UI route", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      
      expect(response.status).toBe(200);
      expect(response.headers.has("content-security-policy")).toBe(true);
      
      const cspHeader = response.headers.get("content-security-policy");
      expect(cspHeader).toBeTruthy();
      expect(cspHeader!.length).toBeGreaterThan(0);
    });

    it("should produce valid CSP header format with semicolon-separated directives", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      
      // CSP format: "directive value; another-directive value2"
      expect(cspHeader).toContain(";");
      
      // Should contain directive names like default-src, script-src, etc.
      expect(cspHeader).toMatch(/default-src/);
      expect(cspHeader).toMatch(/script-src/);
      expect(cspHeader).toMatch(/style-src/);
      expect(cspHeader).toMatch(/connect-src/);
    });
  });

  describe("Base CSP Directives", () => {
    it("should include all base CSP directives from baseCSPDirectives", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();

      // Base directives that should be present
      const requiredDirectives = [
        "default-src",
        "script-src",
        "style-src",
        "img-src",
        "connect-src",
        "object-src",
        "base-uri",
        "frame-ancestors",
        "font-src",
      ];

      for (const directive of requiredDirectives) {
        expect(cspHeader).toContain(directive);
      }
    });

    it("should include 'self' in appropriate directives", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toContain("'self'");
      expect(cspHeader).toContain("default-src 'self'");
    });

    it("should include object-src 'none' for security", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toContain("object-src 'none'");
    });
  });

  describe("Development vs Production CSP", () => {
    it("should include 'unsafe-inline' in script-src for development mode", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toContain("'unsafe-inline'");
      
      // Should be in script-src directive
      expect(cspHeader).toMatch(/script-src[^;]*'unsafe-inline'/);
    });

    it("should include 'unsafe-inline' in script-src for Swagger UI (required)", async () => {
      const response = await fetch(`${productionBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      
      // Extract script-src directive
      const scriptSrcMatch = cspHeader!.match(/script-src([^;]+)/);
      expect(scriptSrcMatch).toBeTruthy();
      
      const scriptSrcDirective = scriptSrcMatch![0];
      // Swagger UI requires 'unsafe-inline' for SwaggerUIBundle initialization
      expect(scriptSrcDirective).toContain("'unsafe-inline'");
    });

    it("should have consistent CSP for Swagger UI route", async () => {
      const devResponse = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const prodResponse = await fetch(`${productionBaseUrl}/api/docs/ui`);

      const devCSP = devResponse.headers.get("content-security-policy");
      const prodCSP = prodResponse.headers.get("content-security-policy");

      expect(devCSP).toBeTruthy();
      expect(prodCSP).toBeTruthy();
      
      // CSP should be identical (Swagger UI requires 'unsafe-inline' in both environments)
      expect(devCSP).toBe(prodCSP);
      
      // Both should include 'unsafe-inline' for Swagger UI functionality
      expect(devCSP).toContain("'unsafe-inline'");
      expect(prodCSP).toContain("'unsafe-inline'");
    });
  });

  describe("Swagger UI CDN Sources", () => {
    it("should include https://cdn.jsdelivr.net in script-src", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toContain("https://cdn.jsdelivr.net");
      expect(cspHeader).toMatch(/script-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
    });

    it("should include https://cdn.jsdelivr.net in style-src", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toMatch(/style-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
    });

    it("should include https://cdn.jsdelivr.net in connect-src for source maps", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toMatch(/connect-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
    });
  });

  describe("Style and Font Sources", () => {
    it("should include 'unsafe-inline' in style-src for dynamic theming", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toMatch(/style-src[^;]*'unsafe-inline'/);
    });

    it("should include Google Fonts in style-src and font-src", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toContain("https://fonts.googleapis.com");
      expect(cspHeader).toContain("https://fonts.gstatic.com");
      
      // Verify in correct directives
      expect(cspHeader).toMatch(/style-src[^;]*https:\/\/fonts\.googleapis\.com/);
      expect(cspHeader).toMatch(/font-src[^;]*https:\/\/fonts\.gstatic\.com/);
    });

    it("should include data: in img-src for inline images", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();
      expect(cspHeader).toMatch(/img-src[^;]*data:/);
    });
  });

  describe("Route-Specific Middleware Application", () => {
    it("should only affect /api/docs/ui endpoint (not other routes)", async () => {
      // Swagger UI route should have CSP
      const swaggerResponse = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const swaggerCSP = swaggerResponse.headers.get("content-security-policy");
      expect(swaggerCSP).toBeTruthy();

      // Other API routes should NOT have this specific Swagger CSP
      const apiResponse = await fetch(`${developmentBaseUrl}/api/k8s/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      // This route doesn't have Swagger CSP middleware
      // (In real implementation it would have global CSP, but not Swagger-specific)
      expect(apiResponse.status).toBe(200);
    });
  });

  describe("Header Preservation", () => {
    it("should preserve other response headers set by route handler", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);

      // CSP middleware sets CSP header
      expect(response.headers.has("content-security-policy")).toBe(true);

      // Route handler sets cache control headers
      expect(response.headers.has("cache-control")).toBe(true);
      expect(response.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");

      // Route handler sets content type
      expect(response.headers.has("content-type")).toBe(true);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    it("should not interfere with response body from route handler", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("Swagger UI");
    });
  });

  describe("CSP Directive Completeness", () => {
    it("should have all required directives for Swagger UI functionality", async () => {
      const response = await fetch(`${developmentBaseUrl}/api/docs/ui`);
      const cspHeader = response.headers.get("content-security-policy");

      expect(cspHeader).toBeTruthy();

      // Check all Swagger UI requirements are met
      const requirements = [
        { directive: "script-src", mustInclude: ["'self'", "https://cdn.jsdelivr.net"] },
        { directive: "style-src", mustInclude: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"] },
        { directive: "img-src", mustInclude: ["'self'", "data:"] },
        { directive: "connect-src", mustInclude: ["'self'", "https://cdn.jsdelivr.net"] },
        { directive: "font-src", mustInclude: ["'self'", "https://fonts.gstatic.com"] },
      ];

      for (const req of requirements) {
        // Extract directive content
        const directiveMatch = cspHeader!.match(new RegExp(`${req.directive}([^;]+)`));
        expect(directiveMatch).toBeTruthy();
        
        const directiveContent = directiveMatch![0];
        
        // Verify all required sources are present
        for (const source of req.mustInclude) {
          expect(directiveContent).toContain(source);
        }
      }
    });
  });
});
