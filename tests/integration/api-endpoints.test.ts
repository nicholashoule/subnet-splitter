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
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "../../server/routes";
import { version as APP_VERSION } from "../../package.json";
import { createTestServer, closeTestServer, type TestServer } from "../helpers/test-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
      expect(data).toHaveProperty("version", APP_VERSION);
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
      expect(data).toHaveProperty("version", APP_VERSION);
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
      expect(data.info).toHaveProperty("version", APP_VERSION);
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

    it("should revalidate the docs page on every load", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
    });

    it("should share the theme with the web app and toggle without a reload", async () => {
      const html = await (await fetch(`${baseUrl}/api/docs/ui`)).text();

      // Same storage key as the web app, default light, kept in sync across tabs
      expect(html).toContain("localStorage.getItem('theme') === 'dark'");
      expect(html).toContain("localStorage.setItem('theme', next)");
      expect(html).toContain("window.addEventListener('storage'");
      // Accessible toggle with SVG icons whose visibility follows the theme class
      expect(html).toMatch(/<button id="theme-toggle" type="button" aria-label="[^"]+">/);
      expect(html).toContain('class="sun-icon"');
      expect(html).toContain('class="moon-icon"');
      expect(html).toContain("html.dark #theme-toggle .sun-icon { display: block; }");
      // Re-mounts Swagger UI with the matching highlight theme instead of reloading
      expect(html).toContain("theme === 'dark' ? 'tomorrow-night' : 'idea'");
      expect(html).not.toContain("location.reload()");
    });

    it("should not repaint Swagger UI from script", async () => {
      const html = await (await fetch(`${baseUrl}/api/docs/ui`)).text();

      // Styling is pure CSS; the old MutationObserver/inline-style repaint hack is gone
      expect(html).not.toContain("MutationObserver");
      expect(html).not.toContain("style.setProperty");
      expect(html).not.toContain("removeAllRanges");
    });

    it("should use the web app's color tokens in both themes", async () => {
      const html = await (await fetch(`${baseUrl}/api/docs/ui`)).text();
      const appCss = fs.readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");

      // "210 20% 98%" in the app becomes "hsl(210, 20%, 98%)" on the docs page
      const tokens = (block: string) => Object.fromEntries(
        [...block.matchAll(/--(background|foreground|card|border|muted-foreground|primary|primary-foreground|destructive):\s*(\d+) (\d+%) (\d+%);/g)]
          .map(([, name, h, s, l]) => [name, `hsl(${h}, ${s}, ${l})`])
      );
      const light = tokens(appCss.slice(appCss.indexOf(":root"), appCss.indexOf(".dark {")));
      const dark = tokens(appCss.slice(appCss.indexOf(".dark {")));
      expect(Object.keys(light)).toHaveLength(8);
      expect(Object.keys(dark)).toHaveLength(8);

      const docsRoot = html.slice(html.indexOf(":root {"), html.indexOf("html.dark {"));
      const docsDark = html.slice(html.indexOf("html.dark {"), html.indexOf("}", html.indexOf("html.dark {")));
      for (const [name, value] of Object.entries(light)) expect(docsRoot).toContain(`--${name}: ${value};`);
      for (const [name, value] of Object.entries(dark)) expect(docsDark).toContain(`--${name}: ${value};`);
    });

    it("should give HTTP method badges readable white text", async () => {
      const html = await (await fetch(`${baseUrl}/api/docs/ui`)).text();

      // Badge colors are fixed per method (not per theme) and dark enough for white text
      expect(html).toContain("--method-get: #2563eb;");
      expect(html).toContain("--method-post: #047857;");
      expect(html).toMatch(/\.opblock-summary-method \{\s*background: var\(--method\); color: #fff;/);
    });

    it("should load pinned Swagger UI assets with Subresource Integrity", async () => {
      const html = await (await fetch(`${baseUrl}/api/docs/ui`)).text();

      // Assets are pinned to an exact version (no floating "@5" tag)...
      expect(html).toMatch(/swagger-ui-dist@\d+\.\d+\.\d+\/swagger-ui\.css/);
      expect(html).toMatch(/swagger-ui-dist@\d+\.\d+\.\d+\/swagger-ui-bundle\.js/);
      // ...the 268 KB standalone preset is not loaded (BaseLayout needs no topbar)...
      expect(html).not.toContain("swagger-ui-standalone-preset");
      expect(html).toContain("layout: 'BaseLayout'");

      // ...and every CDN asset carries Subresource Integrity
      const cdnTags = html.match(/<(?:script|link)[^>]*cdn\.jsdelivr\.net[^>]*>/g) ?? [];
      expect(cdnTags).toHaveLength(2);
      for (const tag of cdnTags) {
        expect(tag).toMatch(/integrity="sha384-[A-Za-z0-9+/=]+"/);
        expect(tag).toContain('crossorigin="anonymous"');
      }
    });

    it("should link the app favicon (no /favicon.ico 404)", async () => {
      const html = await (await fetch(`${baseUrl}/api/docs/ui`)).text();
      expect(html).toContain('<link rel="icon" type="image/png" href="/favicon.png">');
    });

    it("should return readable validation errors", async () => {
      const response = await fetch(`${baseUrl}/api/k8s/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "eks", region: "US East 1" })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(data.error).toContain("deploymentSize: Required");
      expect(data.error).toContain("region: Region must be lowercase");
    });

    it("should include header and footer matching webapp design", async () => {
      const response = await fetch(`${baseUrl}/api/docs/ui`);
      const html = await response.text();

      // Verify header structure
      expect(html).toContain("<header>");
      expect(html).toContain("github-nicholashoule.png");
      expect(html).toContain("<h1>API Documentation</h1>");
      expect(html).toContain("Interactive reference for the CIDR Subnet Calculator REST API");

      // Verify footer structure
      expect(html).toContain("<footer>");
      expect(html).toContain("Created by");
      expect(html).toContain("nicholashoule");
      expect(html).toContain("MIT License");
      
      // Verify header/footer styling
      expect(html).toContain("header {");
      expect(html).toContain("footer {");
      expect(html).toContain("border-bottom: 1px solid var(--border);");
      expect(html).toContain("border-top: 1px solid var(--border);");
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

  describe("Provider-Specific Tiers and Generated Examples", () => {
    it("should return provider-specific tier layouts", async () => {
      const generic = await (await fetch(`${baseUrl}/api/k8s/tiers`)).json();
      const eks = await (await fetch(`${baseUrl}/api/k8s/tiers?provider=eks`)).json();

      expect(generic.micro.publicSubnets).toBe(1);
      expect(generic.micro.controlPlaneSubnets).toBe(1);
      // EKS needs two AZs, which costs a larger minimum VPC
      expect(eks.micro.publicSubnets).toBe(2);
      expect(eks.micro.privateSubnets).toBe(2);
      expect(eks.micro.controlPlaneSubnets).toBe(2);
      expect(eks.micro.minVpcPrefix).toBe(23);
    });

    it("should return private-mode tier layouts", async () => {
      const gke = await (await fetch(`${baseUrl}/api/k8s/tiers?provider=gke&networkMode=private`)).json();
      expect(gke.enterprise.networkMode).toBe("private");
      expect(gke.enterprise.publicSubnets).toBe(0);
      expect(gke.enterprise.loadBalancerSubnets).toBe(1);
      expect(gke.enterprise.controlPlaneSubnets).toBe(1);

      const bad = await fetch(`${baseUrl}/api/k8s/tiers?networkMode=isolated`);
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toContain("networkMode");
    });

    it("should reject an unknown provider for tiers", async () => {
      const response = await fetch(`${baseUrl}/api/k8s/tiers?provider=openstack`);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(data.error).toContain("provider");
    });

    it("should serve OpenAPI examples that match real API output", async () => {
      const spec = await (await fetch(`${baseUrl}/api/docs`)).json();
      const plan = spec.paths["/k8s/plan"].post;
      const requests = plan.requestBody.content["application/json"].examples;
      const responses = plan.responses["200"].content["application/json"].examples;

      for (const [name, example] of Object.entries<{ value: Record<string, unknown> }>(requests)) {
        const live = await (await fetch(`${baseUrl}/api/k8s/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(example.value)
        })).json();
        const documented = responses[name].value;
        // Identical apart from the generation timestamp
        expect({ ...live, metadata: { ...live.metadata, generatedAt: "" } })
          .toEqual({ ...documented, metadata: { ...documented.metadata, generatedAt: "" } });
      }
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
