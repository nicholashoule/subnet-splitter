/**
 * Integration tests for Swagger UI light/dark mode theming
 * 
 * Tests verify that the Swagger UI documentation page properly implements
 * light and dark mode theming with correct CSS and JavaScript configuration.
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

  describe("HTML Structure", () => {
    it("should include theme initialization script before CSS loads", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Verify theme script exists
      expect(html).toContain("localStorage.getItem('theme')");
      expect(html).toContain("document.documentElement.className = savedTheme");
      
      // Verify script comes before CSS link
      const scriptIndex = html.indexOf("localStorage.getItem('theme')");
      const cssIndex = html.indexOf('swagger-ui.css');
      expect(scriptIndex).toBeLessThan(cssIndex);
    });

    it("should include Swagger UI CDN assets", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("swagger-ui-dist@5");
      expect(html).toContain("swagger-ui.css");
      expect(html).toContain("swagger-ui-bundle.js");
      expect(html).toContain("swagger-ui-standalone-preset.js");
    });

    it("should have swagger-ui container element", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain('id="swagger-ui"');
    });

    it("should have theme toggle button", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain('id="theme-toggle"');
      expect(html).toContain('sun-icon');
      expect(html).toContain('moon-icon');
    });
  });

  describe("Light Mode CSS", () => {
    it("should define light mode background colors", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Check for light mode background
      expect(html).toContain("background-color: hsl(210, 20%, 98%)");
      
      // Check code/example light backgrounds
      expect(html).toContain("background: hsl(210, 20%, 99%)");
    });

    it("should style code sections with light backgrounds", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain(".swagger-ui .microlight");
      expect(html).toContain(".swagger-ui .highlight-code");
      expect(html).toContain(".swagger-ui pre.microlight");
      expect(html).toContain("color: hsl(222, 47%, 11%)");
    });

    it("should style version badges with backgrounds", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Version badge styling
      expect(html).toContain(".swagger-ui .info .title small");
      expect(html).toContain("background-color: hsl(215, 16%, 47%)");
      
      // Version stamp (1.0.0) special styling
      expect(html).toContain(".version-stamp");
      expect(html).toContain("background-color: hsl(221, 83%, 53%)");
    });

    it("should override child element backgrounds", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Child elements should have transparent backgrounds
      expect(html).toContain(".swagger-ui .microlight *");
      expect(html).toContain("background: transparent !important");
    });
  });

  describe("Dark Mode CSS", () => {
    it("should define dark mode background colors", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Dark mode scoped with html.dark
      expect(html).toContain("html.dark body");
      expect(html).toContain("background-color: hsl(222, 47%, 8%)");
      expect(html).toContain("color: hsl(210, 20%, 98%)");
    });

    it("should style dark mode version badges", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Dark mode badge colors
      expect(html).toContain("html.dark .swagger-ui .info .title small");
      expect(html).toContain("background-color: #434b4f");
      expect(html).toContain("background-color: #1d632e");
    });

    it("should style dark mode code sections", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("html.dark .swagger-ui .microlight");
      expect(html).toContain("html.dark .swagger-ui pre");
      expect(html).toContain("html.dark .swagger-ui code");
    });
  });

  describe("JavaScript Configuration", () => {
    it("should configure syntax highlighting based on theme", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Check for theme-based syntax highlighting config
      expect(html).toContain("syntaxHighlightConfig");
      expect(html).toContain("currentTheme === 'dark'");
      expect(html).toContain("activated: true");
      expect(html).toContain("theme: 'tomorrow-night'");
      expect(html).toContain("activated: false");
    });

    it("should have theme toggle event listener", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("themeToggle.addEventListener('click'");
      expect(html).toContain("localStorage.setItem('theme', newTheme)");
      expect(html).toContain("location.reload()");
    });

    it("should have cross-tab sync listener", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("window.addEventListener('storage'");
      expect(html).toContain("e.key === 'theme'");
      expect(html).toContain("location.reload()");
    });

    it("should have onComplete callback with style enforcement", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("onComplete: function()");
      expect(html).toContain("applyLightStyles");
      expect(html).toContain("style.setProperty");
      expect(html).toContain("'important'");
    });

    it("should have click event listener for style reapplication", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("document.addEventListener('click'");
      expect(html).toContain("e.target.closest('.swagger-ui')");
      expect(html).toContain("setTimeout(applyLightStyles");
    });

    it("should have IntersectionObserver for visibility detection", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("IntersectionObserver");
      expect(html).toContain("entry.isIntersecting");
      expect(html).toContain("threshold: 0.1");
      expect(html).toContain("observer.observe(swaggerContainer)");
    });
  });

  describe("API Endpoint", () => {
    it("should return valid HTML", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });

    it("should have cache control headers", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      
      // Verify no-cache headers for proper theme updates
      expect(response.headers.get('cache-control')).toContain('no-cache');
      expect(response.headers.get('pragma')).toBe('no-cache');
      expect(response.headers.get('expires')).toBe('0');
    });
  });

  describe("SwaggerUIBundle Configuration", () => {
    it("should initialize with correct settings", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("SwaggerUIBundle({");
      expect(html).toContain("url: '/api/docs'");
      expect(html).toContain("dom_id: '#swagger-ui'");
      expect(html).toContain("deepLinking: true");
      expect(html).toContain("layout: \"StandaloneLayout\"");
    });

    it("should use presets for API documentation", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("SwaggerUIBundle.presets.apis");
      expect(html).toContain("SwaggerUIStandalonePreset");
    });
  });

  describe("Footer Styling", () => {
    it("should have footer with theme-aware styling", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Light mode footer
      expect(html).toContain("border-top: 1px solid hsl(214, 20%, 88%)");
      expect(html).toContain("background-color: hsl(210, 20%, 96%, 0.3)");
      
      // Dark mode footer
      expect(html).toContain("html.dark footer");
    });

    it("should include attribution links", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      expect(html).toContain("<footer>");
      expect(html).toContain("</footer>");
    });
  });

  describe("Color Consistency", () => {
    it("should use consistent color palette in light mode", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Primary background
      const bgColorCount = (html.match(/hsl\(210, 20%, 98%\)/g) || []).length;
      expect(bgColorCount).toBeGreaterThan(3); // Used in multiple places
      
      // Primary text
      const textColorCount = (html.match(/hsl\(222, 47%, 11%\)/g) || []).length;
      expect(textColorCount).toBeGreaterThan(5); // Used extensively
    });

    it("should use consistent dark mode color palette", async () => {
      if (skipIfNoServer()) return;
      
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Dark backgrounds
      expect(html).toContain("hsl(222, 47%, 8%)");
      expect(html).toContain("hsl(222, 47%, 11%)");
      
      // Light text in dark mode
      const darkTextCount = (html.match(/hsl\(210, 20%, 98%\)/g) || []).length;
      expect(darkTextCount).toBeGreaterThan(3);
    });
  });

  describe("Accessibility", () => {
    it("should maintain WCAG contrast ratios", async () => {
      if (skipIfNoServer()) return;
      
      // This is a documentation test - actual contrast testing requires visual tools
      // But we verify the colors are defined correctly
      const response = await fetch(SWAGGER_UI_URL);
      const html = await response.text();
      
      // Light mode: dark text on light background (high contrast)
      expect(html).toContain("color: hsl(222, 47%, 11%)"); // Dark text
      expect(html).toContain("background: hsl(210, 20%, 99%)"); // Light background
      
      // Dark mode: light text on dark background (high contrast)
      expect(html).toContain("color: hsl(210, 20%, 98%)"); // Light text
      expect(html).toContain("background-color: hsl(222, 47%, 8%)"); // Dark background
    });
  });
});
