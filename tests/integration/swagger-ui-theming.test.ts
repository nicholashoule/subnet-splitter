/**
 * tests/integration/swagger-ui-theming.test.ts
 *
 * Light/dark theming of the Swagger UI page (/api/docs/ui), served by an
 * in-process server with the real routes (server/routes.ts).
 *
 * The page's inline scripts run in a node:vm sandbox with small stand-ins for
 * document, localStorage, window and SwaggerUIBundle, so these tests check what
 * the scripts do (which theme is applied, persisted and rendered), not how the
 * source is written.
 *
 * Markup, color tokens, cache headers, Subresource Integrity, the theme toggle's
 * markup and the no-reload/no-repaint checks are in api-endpoints.test.ts
 * ("Swagger UI Presentation").
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import vm from "node:vm";
import { registerRoutes } from "../../server/routes";
import { createTestServer, closeTestServer, type TestServer } from "../helpers/test-server";

/** Inline <script> blocks (those without a src) in document order */
function inlineScripts(html: string): Array<{ start: number; code: string }> {
  const open = "<script>";
  const scripts: Array<{ start: number; code: string }> = [];
  for (let start = html.indexOf(open); start !== -1; start = html.indexOf(open, start + 1)) {
    scripts.push({ start, code: html.slice(start + open.length, html.indexOf("</script>", start)) });
  }
  return scripts;
}

type SwaggerConfig = {
  url: string;
  domNode: object;
  syntaxHighlight: { activated: boolean; theme: string };
  [option: string]: unknown;
};

/**
 * Run the page's main script against stand-ins for the browser APIs it uses.
 * `saved` is the theme already in localStorage; `storageFails` makes every
 * localStorage call throw, as some private-browsing modes do.
 */
function loadDocsPage(script: string, saved: string | null, storageFails = false) {
  const storage = new Map<string, string>(saved === null ? [] : [["theme", saved]]);
  const localStorage = {
    getItem(key: string) {
      if (storageFails) throw new Error("storage disabled");
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (storageFails) throw new Error("storage disabled");
      storage.set(key, value);
    },
  };

  const root = { className: "" };
  const attributes: Record<string, string> = {};
  const clickHandlers: Array<() => void> = [];
  const toggle = {
    title: "",
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
    addEventListener: (type: string, handler: () => void) => { if (type === "click") clickHandlers.push(handler); },
  };

  // The #swagger-ui mount point; each render replaces it with a fresh clone
  const makeMountNode = (): object => ({
    cloneNode: () => makeMountNode(),
    replaceWith: (next: object) => { mountNode = next; },
  });
  let mountNode = makeMountNode();

  const renders: SwaggerConfig[] = [];
  const SwaggerUIBundle = Object.assign(
    (config: SwaggerConfig) => { renders.push(config); return { config }; },
    { presets: { apis: "apis-preset" } }
  );

  const storageHandlers: Array<(event: { key: string }) => void> = [];
  const window: Record<string, unknown> = {
    addEventListener: (type: string, handler: (event: { key: string }) => void) => {
      if (type === "storage") storageHandlers.push(handler);
    },
  };
  const document = {
    documentElement: root,
    getElementById: (id: string) => (id === "theme-toggle" ? toggle : id === "swagger-ui" ? mountNode : null),
  };

  vm.runInNewContext(script, { window, document, localStorage, SwaggerUIBundle });

  return {
    root,
    toggle,
    attributes,
    renders,
    storage,
    window,
    mountNode: () => mountNode,
    click: () => clickHandlers.forEach((handler) => handler()),
    storageEvent: (key: string) => storageHandlers.forEach((handler) => handler({ key })),
  };
}

describe("Swagger UI Theming", () => {
  let server: TestServer;
  let html: string;
  let themeInitScript: { start: number; code: string };
  let mainScript: string;

  beforeAll(async () => {
    server = await createTestServer({
      setup: async (app, httpServer) => {
        await registerRoutes(httpServer, app);
      },
    });
    const response = await fetch(`${server.baseUrl}/api/docs/ui`);
    expect(response.status).toBe(200);
    html = await response.text();

    const scripts = inlineScripts(html);
    expect(scripts).toHaveLength(2);
    [themeInitScript] = scripts;
    mainScript = scripts[1].code;
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe("Initial Theme", () => {
    it("should apply the saved theme before any stylesheet loads", () => {
      // Running ahead of the CSS means the page never paints in the wrong theme
      expect(themeInitScript.start).toBeLessThan(html.indexOf('rel="stylesheet"'));
      expect(themeInitScript.start).toBeLessThan(html.indexOf("<style>"));

      const themeFor = (getItem: () => string | null) => {
        const documentElement = { className: "" };
        vm.runInNewContext(themeInitScript.code, { document: { documentElement }, localStorage: { getItem } });
        return documentElement.className;
      };

      expect(themeFor(() => "dark")).toBe("dark");
      expect(themeFor(() => "light")).toBe("light");
      // Same rule as the web app: anything but a saved "dark" is light
      expect(themeFor(() => null)).toBe("light");
      expect(themeFor(() => "sepia")).toBe("light");
      expect(themeFor(() => { throw new Error("storage disabled"); })).toBe("light");
    });

    it("should mount Swagger UI with the saved theme's code highlighting", () => {
      const light = loadDocsPage(mainScript, null);
      expect(light.renders).toHaveLength(1);
      expect(light.renders[0]).toMatchObject({
        url: "/api/docs",
        deepLinking: true,
        layout: "BaseLayout",
        presets: ["apis-preset"],
        validatorUrl: null,
        syntaxHighlight: { activated: true, theme: "idea" },
      });
      // Rendered into the node that replaced #swagger-ui
      expect(light.renders[0].domNode).toBe(light.mountNode());
      expect(light.window.ui).toEqual({ config: light.renders[0] });
      expect(light.root.className).toBe("light");
      expect(light.attributes["aria-label"]).toBe("Switch to dark mode");

      const dark = loadDocsPage(mainScript, "dark");
      expect(dark.renders[0].syntaxHighlight.theme).toBe("tomorrow-night");
      expect(dark.root.className).toBe("dark");
      expect(dark.attributes["aria-label"]).toBe("Switch to light mode");
      expect(dark.toggle.title).toBe("Switch to light mode");
    });

    it("should point Swagger UI at the URL that serves the OpenAPI spec", async () => {
      const { renders } = loadDocsPage(mainScript, null);
      const response = await fetch(`${server.baseUrl}${renders[0].url}`);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      const spec = await response.json();
      expect(spec.openapi).toMatch(/^3\./);
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    });
  });

  describe("Theme Toggle", () => {
    it("should switch theme, save it, and re-mount Swagger UI in place", () => {
      const page = loadDocsPage(mainScript, null);
      const firstMount = page.mountNode();

      page.click();
      expect(page.root.className).toBe("dark");
      expect(page.storage.get("theme")).toBe("dark");
      expect(page.renders).toHaveLength(2);
      expect(page.renders[1].syntaxHighlight.theme).toBe("tomorrow-night");
      // A fresh mount node, so the old Swagger UI instance is discarded
      expect(page.mountNode()).not.toBe(firstMount);
      expect(page.renders[1].domNode).toBe(page.mountNode());
      expect(page.attributes["aria-label"]).toBe("Switch to light mode");

      page.click();
      expect(page.root.className).toBe("light");
      expect(page.storage.get("theme")).toBe("light");
      expect(page.renders[2].syntaxHighlight.theme).toBe("idea");
      expect(page.attributes["aria-label"]).toBe("Switch to dark mode");
    });

    it("should still switch theme when localStorage is unavailable", () => {
      const page = loadDocsPage(mainScript, null, true);
      expect(page.root.className).toBe("light");

      page.click();
      expect(page.root.className).toBe("dark");
      expect(page.renders.map((config) => config.syntaxHighlight.theme)).toEqual(["idea", "tomorrow-night"]);
    });

    it("should follow theme changes made in another tab", () => {
      const page = loadDocsPage(mainScript, null);

      // Another tab (the web app or the docs) saves a new theme
      page.storage.set("theme", "dark");
      page.storageEvent("theme");
      expect(page.root.className).toBe("dark");
      expect(page.renders).toHaveLength(2);
      expect(page.renders[1].syntaxHighlight.theme).toBe("tomorrow-night");

      // Changes to other keys are ignored
      page.storageEvent("unrelated-key");
      expect(page.renders).toHaveLength(2);
    });
  });

  describe("Theme Styling", () => {
    it("should color the version badge with the theme's primary tokens", () => {
      const selector = ".swagger-ui .info .title small.version-stamp {";
      const start = html.indexOf(selector);
      expect(start).toBeGreaterThan(-1);
      const declarations = html.slice(start + selector.length, html.indexOf("}", start));

      expect(declarations).toMatch(/background:\s*var\(--primary\);/);
      expect(declarations).toMatch(/color:\s*var\(--primary-foreground\);/);
    });
  });
});
