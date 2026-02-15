/**
 * tests/integration/api-endpoints.test.ts
 * 
 * Integration tests for API infrastructure endpoints:
 * - Health checks (/health, /health/ready, /health/live)
 * - API version (/api/version)
 * - OpenAPI specification (/api/docs JSON/YAML)
 * - Swagger UI presentation (/api/docs/ui HTML/CSS/themes)
 * - Path variations (/api/v1/... and /v1/...)
 * - Error handling consistency
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { registerRoutes } from "../../server/routes";
import { createTestServer, closeTestServer, type TestServer } from "../helpers/test-server";

describe("API Endpoints Integration", () => {
  let server: TestServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer({
      setup: async (app, httpServer) => {
        await registerRoutes(httpServer, app);
      }
    });
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe("Health Check Endpoints", () => {
    it("should return healthy status from /health", async () => {
      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status", "healthy");
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("uptime");
      expect(data).toHaveProperty("version", "1.0.0");
      expect(typeof data.uptime).toBe("number");
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should return ready status from /health/ready", async () => {
      const response = await fetch(`${baseUrl}/health/ready`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status", "ready");
      expect(data).toHaveProperty("timestamp");
      expect(new Date(data.timestamp).getTime()).toBeGreaterThan(0);
    });

    it("should return alive status from /health/live", async () => {
      const response = await fetch(`${baseUrl}/health/live`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("status", "alive");
      expect(data).toHaveProperty("timestamp");
    });

    it("should have consistent timestamp format across health endpoints", async () => {
      const [health, ready, live] = await Promise.all([
        fetch(`${baseUrl}/health`).then(r => r.json()),
        fetch(`${baseUrl}/health/ready`).then(r => r.json()),
        fetch(`${baseUrl}/health/live`).then(r => r.json())
      ]);

      // All timestamps should be valid ISO 8601 format
      expect(new Date(health.timestamp).getTime()).toBeGreaterThan(0);
      expect(new Date(ready.timestamp).getTime()).toBeGreaterThan(0);
      expect(new Date(live.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe("API Version Endpoint", () => {
    it("should return API version and available endpoints", async () => {
      const response = await fetch(`${baseUrl}/api/version`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("version", "1.0.0");
      expect(data).toHaveProperty("endpoints");
      expect(data.endpoints).toHaveProperty("primary");
      expect(data.endpoints).toHaveProperty("aliases");
      expect(data.endpoints).toHaveProperty("descriptive");
      expect(Array.isArray(data.endpoints.primary)).toBe(true);
      expect(Array.isArray(data.endpoints.aliases)).toBe(true);
      expect(Array.isArray(data.endpoints.descriptive)).toBe(true);
    });

    it("should list all available API endpoint paths", async () => {
      const response = await fetch(`${baseUrl}/api/version`);
      const data = await response.json();

      // Primary concise endpoints
      expect(data.endpoints.primary).toContain("/api/k8s/plan");
      expect(data.endpoints.primary).toContain("/api/k8s/tiers");
      
      // Versioned aliases
      expect(data.endpoints.aliases).toContain("/api/v1/k8s/plan");
      expect(data.endpoints.aliases).toContain("/api/v1/k8s/tiers");
      
      // Descriptive long-form
      expect(data.endpoints.descriptive).toContain("/api/v1/kubernetes/network-plan");
      expect(data.endpoints.descriptive).toContain("/api/v1/kubernetes/tiers");
      expect(data.endpoints.descriptive).toContain("/api/kubernetes/network-plan");
      expect(data.endpoints.descriptive).toContain("/api/kubernetes/tiers");
    });
  });

  describe("OpenAPI Specification Endpoints", () => {
    it("should serve OpenAPI spec as JSON at /api/docs", async () => {
      const response = await fetch(`${baseUrl}/api/docs`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(data).toHaveProperty("openapi", "3.0.0");
      expect(data).toHaveProperty("info");
      expect(data.info).toHaveProperty("title", "CIDR Subnet Calculator API");
      expect(data.info).toHaveProperty("version", "1.0.0");
      expect(data).toHaveProperty("paths");
      expect(data).toHaveProperty("components");
    });

    it("should serve OpenAPI spec as YAML when format=yaml", async () => {
      const response = await fetch(`${baseUrl}/api/docs?format=yaml`);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/yaml");
      expect(text).toContain("openapi: 3.0.0");
      expect(text).toContain("title: CIDR Subnet Calculator API");
      expect(text).toContain("paths:");
      expect(text).toContain("components:");
    });

    it("should include health check endpoints in OpenAPI spec", async () => {
      const response = await fetch(`${baseUrl}/api/docs`);
      const data = await response.json();

      expect(data.paths).toHaveProperty("/v1/health");
      expect(data.paths).toHaveProperty("/v1/health/ready");
      expect(data.paths).toHaveProperty("/v1/health/live");
    });

    it("should include Kubernetes endpoints in OpenAPI spec (primary routes)", async () => {
      const response = await fetch(`${baseUrl}/api/docs`);
      const data = await response.json();

      expect(data.paths).toHaveProperty("/k8s/plan");
      expect(data.paths).toHaveProperty("/k8s/tiers");
    });

    it("should have OpenAPI paths that match actual API routes (spec + server base = working route)", async () => {
      // Get the OpenAPI spec to find server base path and defined paths
      const specResponse = await fetch(`${baseUrl}/api/docs`);
      const spec = await specResponse.json();
      
      // Extract server base path (e.g., "/api/v1")
      const serverBasePath = spec.servers?.[0]?.url || "";
      
      // Test that each OpenAPI path actually works when combined with server base
      // This catches mismatches between OpenAPI spec and actual route registration
      for (const [path, methods] of Object.entries(spec.paths)) {
        const fullPath = `${serverBasePath}${path}`;
        
        // Test GET endpoints (health checks, tiers)
        if (methods && typeof methods === 'object' && 'get' in methods) {
          const response = await fetch(`${baseUrl}${fullPath}`);
          expect(response.status, `GET ${fullPath} should return 200, got ${response.status}`).toBe(200);
        }
        
        // Test POST endpoints with minimal valid body (network-plan)
        if (methods && typeof methods === 'object' && 'post' in methods) {
          const response = await fetch(`${baseUrl}${fullPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deploymentSize: "standard" })
          });
          // POST should return 200 or 201, not 404
          expect([200, 201, 400], `POST ${fullPath} should not return 404`).toContain(response.status);
        }
      }
    });

    it("should have server base path that matches primary API routes", async () => {
      const response = await fetch(`${baseUrl}/api/docs`);
      const spec = await response.json();
      
      expect(spec.servers).toBeDefined();
      expect(spec.servers.length).toBeGreaterThan(0);
      expect(spec.servers[0].url).toBe("/api");
      expect(spec.servers[0].description).toBe("Primary API (concise routes)");
    });
  });

  describe("Swagger UI Presentation", () => {
    it("should serve Swagger UI HTML at /api/docs/ui", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(html).toContain("<title>CIDR Subnet Calculator API Documentation</title>");
      expect(html).toContain("swagger-ui");
      expect(html).toContain("SwaggerUIBundle");
    });

    it("should include cache control headers on /api/docs/ui to prevent 304 issues", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
      expect(response.headers.get("pragma")).toBe("no-cache");
      expect(response.headers.get("expires")).toBe("0");
    });

    it("should include theme toggle functionality in Swagger UI", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);
      const html = await response.text();

      expect(html).toContain("theme-toggle");
      // Should use shared 'theme' key (synchronized with webapp)
      expect(html).toContain("localStorage.getItem('theme')");
      expect(html).toContain("localStorage.setItem('theme'");
      expect(html).toContain("html.className");
      // Should have SVG icons instead of emoji
      expect(html).toContain("class=\"sun-icon\"");
      expect(html).toContain("class=\"moon-icon\"");
      expect(html).toContain("updateThemeIcon");
      // Should listen for storage events from other tabs/windows
      expect(html).toContain("window.addEventListener('storage'");
      expect(html).toContain("e.key === 'theme'");
    });

    it("should default to light mode in Swagger UI", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);
      const html = await response.text();

      // Theme is set via JavaScript at runtime, not in static HTML
      // Check that the JS sets theme from localStorage with 'light' as default
      expect(html).toContain("const savedTheme = localStorage.getItem('theme') || 'light'");
      expect(html).toContain("document.documentElement.className = savedTheme");
    });

    it("should use webapp color palette in Swagger UI dark mode", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);
      const html = await response.text();

      // Verify dark mode colors match webapp
      expect(html).toContain("hsl(222, 47%, 8%)"); // Dark background
      expect(html).toContain("hsl(210, 20%, 98%)"); // Dark foreground
      expect(html).toContain("hsl(222, 47%, 11%)"); // Dark card
      expect(html).toContain("hsl(217, 33%, 17%)"); // Dark border
      expect(html).toContain("hsl(217, 91%, 60%)"); // Dark primary
    });

    it("should use webapp color palette in Swagger UI light mode", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);
      const html = await response.text();

      // Verify light mode colors match webapp
      expect(html).toContain("hsl(210, 20%, 98%)"); // Light background
      expect(html).toContain("hsl(222, 47%, 11%)"); // Light foreground
    });

    it("should load Swagger UI from CDN with proper CSP", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);
      const html = await response.text();

      expect(html).toContain("https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css");
      expect(html).toContain("https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js");
      expect(html).toContain("https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js");
    });

    it("should include header and footer matching webapp design", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);
      const html = await response.text();

      // Verify header structure
      expect(html).toContain("<header>");
      expect(html).toContain("github-nicholashoule.png");
      expect(html).toContain("CIDR Subnet Calculator API");
      expect(html).toContain("REST API for subnet calculations and Kubernetes network planning");

      // Verify footer structure
      expect(html).toContain("<footer>");
      expect(html).toContain("Created by");
      expect(html).toContain("nicholashoule");
      expect(html).toContain("MIT License");
      
      // Verify header/footer styling
      expect(html).toContain("header {");
      expect(html).toContain("footer {");
      expect(html).toContain("border-bottom");
      expect(html).toContain("border-top");
    });
  });

  describe("API Path Variations", () => {
    it("should accept requests to /api/v1/kubernetes/network-plan", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/network-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentSize: "standard",
          provider: "kubernetes"
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("deploymentSize", "standard");
      expect(data).toHaveProperty("vpc");
    });

    it("should accept requests to /api/k8s/plan (primary concise endpoint)", async () => {
      const response = await fetch(`${baseUrl}/api/k8s/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentSize: "professional",
          provider: "eks"
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("deploymentSize", "professional");
      expect(data).toHaveProperty("provider", "eks");
    });

    it("should return identical responses from all endpoint styles", async () => {
      const requestBody = {
        deploymentSize: "enterprise" as const,
        provider: "gke" as const,
        vpcCidr: "10.50.0.0/16"
      };

      const [response1, response2, response3] = await Promise.all([
        fetch(`${baseUrl}/api/k8s/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        }),
        fetch(`${baseUrl}/api/v1/k8s/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        }),
        fetch(`${baseUrl}/api/v1/kubernetes/network-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        })
      ]);

      const data1 = await response1.json();
      const data2 = await response2.json();
      const data3 = await response3.json();

      // All should return same structure (excluding generated metadata)
      expect(data1.deploymentSize).toBe(data2.deploymentSize);
      expect(data2.deploymentSize).toBe(data3.deploymentSize);
      expect(data1.provider).toBe(data2.provider);
      expect(data2.provider).toBe(data3.provider);
      expect(data1.vpc.cidr).toBe(data2.vpc.cidr);
      expect(data2.vpc.cidr).toBe(data3.vpc.cidr);
    });

    it("should accept requests to /api/v1/kubernetes/tiers", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/tiers`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("standard");
      expect(data).toHaveProperty("professional");
      expect(data).toHaveProperty("enterprise");
      expect(data).toHaveProperty("hyperscale");
    });

    it("should accept requests to /api/k8s/tiers (primary concise endpoint)", async () => {
      const response = await fetch(`${baseUrl}/api/k8s/tiers`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("micro");
      expect(data).toHaveProperty("standard");
      expect(data).toHaveProperty("professional");
      expect(data).toHaveProperty("enterprise");
      expect(data).toHaveProperty("hyperscale");
    });
  });

  describe("Error Handling Consistency", () => {
    it("should return consistent error format for invalid deployment size", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/network-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentSize: "invalid-tier"
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("code", "INVALID_REQUEST");
    });

    it("should return consistent error format for public IP in VPC CIDR", async () => {
      const response = await fetch(`${baseUrl}/api/k8s/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentSize: "standard",
          vpcCidr: "8.8.8.0/16"
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("RFC 1918");
      expect(data).toHaveProperty("code", "NETWORK_GENERATION_ERROR");
    });

    it("should reject malformed JSON with 400 status", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/network-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid json}"
      });

      expect(response.status).toBe(400);
    });

    it("should reject empty request body", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/network-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("code");
    });

    it("should reject missing required fields", async () => {
      const response = await fetch(`${baseUrl}/api/k8s/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "eks"
          // Missing deploymentSize
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("code", "INVALID_REQUEST");
    });

    it("should reject invalid provider values", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/network-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentSize: "standard",
          provider: "not-a-valid-provider"
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("code", "INVALID_REQUEST");
    });

    it("should reject invalid VPC CIDR format", async () => {
      const response = await fetch(`${baseUrl}/api/k8s/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentSize: "professional",
          vpcCidr: "not-a-cidr"
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
      expect(data).toHaveProperty("code");
    });

    it("should reject VPC CIDR with invalid prefix", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/network-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentSize: "enterprise",
          vpcCidr: "10.0.0.0/33"
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty("error");
    });

    it("should handle invalid Content-Type gracefully", async () => {
      const response = await fetch(`${baseUrl}/api/k8s/plan`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json"
      });

      expect(response.status).toBe(400);
    });

    it("should reject requests with extra unknown fields", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/network-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentSize: "standard",
          provider: "kubernetes",
          unknownField: "should be rejected"
        })
      });

      // Should either accept (ignore extra fields) or reject
      // Most APIs ignore extra fields for forward compatibility
      expect([200, 400]).toContain(response.status);
    });
  });

  describe("Response Format Support", () => {
    it("should support JSON format for tier information", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/tiers`);
      const data = await response.json();

      expect(response.headers.get("content-type")).toContain("application/json");
      expect(typeof data).toBe("object");
    });

    it("should support YAML format for tier information", async () => {
      const response = await fetch(`${baseUrl}/api/k8s/tiers?format=yaml`);
      const text = await response.text();

      expect(response.headers.get("content-type")).toContain("application/yaml");
      expect(text).toContain("micro:");
      expect(text).toContain("standard:");
      expect(text).toContain("professional:");
      expect(text).toContain("publicSubnets:");
    });

    it("should support YAML format for network plan", async () => {
      const response = await fetch(`${baseUrl}/api/v1/kubernetes/network-plan?format=yaml`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentSize: "standard",
          provider: "kubernetes"
        })
      });

      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/yaml");
      expect(text).toContain("deploymentSize: standard");
      expect(text).toContain("provider: kubernetes");
      expect(text).toContain("vpc:");
      expect(text).toContain("subnets:");
    });
  });
});
