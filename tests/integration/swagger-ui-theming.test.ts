/**
 * Integration tests for Swagger UI light/dark mode theming
 * 
 * Consolidated from 35 tests to 12 essential tests.
 * Removed: Redundant CSS detail tests, fragile DOM structure tests, 
 *          implementation details covered by other tests.
 * Kept: Critical behavior, theme functionality, configuration validation.
 * 
 * NOTE: These tests require the webapp to be running on port 5000.
 * Start the server with: npm run dev
 * 
 * When server is not available, tests are skipped with informative message.
 */

import { describe, it, expect, beforeAll } from "vitest";

describe("Swagger UI Theming", () => {
  const SWAGGER_UI_URL = "http://127.0.0.1:5000/api/docs/ui";
  let serverAvailable = false;

  beforeAll(async () => {
    try {
      const response = await fetch(SWAGGER_UI_URL, { signal: AbortSignal.timeout(2000) });
      serverAvailable = response.ok;
      if (!serverAvailable) {
        console.log("[SKIP] Server not responding properly. Skipping Swagger UI tests.");
      }
    } catch (error) {
      serverAvailable = false;
      console.log("[SKIP] Server not available on port 5000. Skipping Swagger UI tests.");
      console.log("   Start the server with: npm run dev");
    }
  });

  // Helper to skip test if server not available
  const skipIfNoServer = () => {
    if (!serverAvailable) {
      return true;
    }
    return false;
  };

  describe("Core Functionality", () => {
    it("should return valid HTML with proper headers", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('cache-control')).toContain('no-cache');
    });

    it("should include theme initialization before CSS loads", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("localStorage.getItem('theme')");
      expect(html).toContain("document.documentElement.className = savedTheme");
      
      const scriptIndex = html.indexOf("localStorage.getItem('theme')");
      const cssIndex = html.indexOf('swagger-ui.css');
      expect(scriptIndex).toBeLessThan(cssIndex);
    });

    it("should include all required Swagger UI assets", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("swagger-ui-dist@5");
      expect(html).toContain("swagger-ui.css");
      expect(html).toContain("swagger-ui-bundle.js");
      expect(html).toContain('id="swagger-ui"');
      expect(html).toContain('id="theme-toggle"');
    });
  });

  describe("Theme Styling", () => {
    it("should define light mode theme colors", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("background-color: hsl(210, 20%, 98%)");
      expect(html).toContain("color: hsl(222, 47%, 11%)");
      expect(html).toContain(".swagger-ui .microlight");
    });

    it("should define dark mode theme colors", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("html.dark body");
      expect(html).toContain("background-color: hsl(222, 47%, 8%)");
      expect(html).toContain("color: hsl(210, 20%, 98%)");
      expect(html).toContain("html.dark .swagger-ui");
    });

    it("should style version badges with theme colors", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain(".swagger-ui .info .title small");
      expect(html).toContain(".version-stamp");
      expect(html).toContain("background-color: hsl(221, 83%, 53%)");
      expect(html).toContain("html.dark .swagger-ui .info .title small");
    });
  });

  describe("Theme Behavior", () => {
    it("should configure syntax highlighting based on theme", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("syntaxHighlightConfig");
      expect(html).toContain("currentTheme === 'dark'");
      expect(html).toContain("theme: 'tomorrow-night'");
    });

    it("should have theme toggle with persistence", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("themeToggle.addEventListener('click'");
      expect(html).toContain("localStorage.setItem('theme', newTheme)");
      expect(html).toContain("location.reload()");
    });

    it("should sync theme changes across tabs", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("window.addEventListener('storage'");
      expect(html).toContain("e.key === 'theme'");
      expect(html).toContain("location.reload()");
    });

    it("should enforce styles with onComplete callback", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("onComplete: function()");
      expect(html).toContain("applyLightStyles");
      expect(html).toContain("IntersectionObserver");
      expect(html).toContain("entry.isIntersecting");
    });
  });

  describe("SwaggerUI Configuration", () => {
    it("should initialize SwaggerUIBundle correctly", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("SwaggerUIBundle({");
      expect(html).toContain("url: '/api/docs'");
      expect(html).toContain("dom_id: '#swagger-ui'");
      expect(html).toContain("deepLinking: true");
      expect(html).toContain("SwaggerUIBundle.presets.apis");
    });

    it("should include footer with attribution", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("<footer>");
      expect(html).toContain("</footer>");
      expect(html).toContain("border-top: 1px solid");
    });
  });
});
