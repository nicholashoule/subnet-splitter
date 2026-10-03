/**
 * tests/integration/swagger-ui-csp-middleware.test.ts
 *
 * Integration tests for the Content-Security-Policy of the Swagger UI page.
 *
 * Starts an in-process server with the real routes (server/routes.ts) behind the
 * global Helmet CSP that createApp() (server/app.ts) applies in production
 * (createSecurityHeaders(false), built from baseCSPDirectives),
 * then checks the headers over HTTP:
 * - /api/docs/ui replaces the global policy with buildSwaggerUICSP(), which adds
 *   'unsafe-inline' for scripts and the jsDelivr CDN for scripts, styles and source maps
 * - That policy does not depend on NODE_ENV: development and production send the
 *   same header, 'unsafe-inline' included. Only the global policy differs by
 *   environment (in development createSecurityHeaders(true) adds 'unsafe-inline', ws:
 *   and report-uri for Vite HMR).
 * - Every other route keeps the global policy: no CDN and no inline scripts
 * - The docs policy keeps every directive the global header actually sends, Helmet's
 *   defaults included, and neither sends upgrade-insecure-requests
 *
 * Headers are parsed into directives and compared source token by source token.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { registerRoutes } from "../../server/routes";
import { buildSwaggerUICSP, baseCSPDirectives, createSecurityHeaders } from "../../server/csp-config";
import { createTestServer, closeTestServer, type TestServer } from "../helpers/test-server";

const JSDELIVR_SOURCE = "https://cdn.jsdelivr.net";
const JSDELIVR_HOST = "cdn.jsdelivr.net";

/** Parse a CSP header into directive name -> source tokens */
function parseCsp(header: string | null): Map<string, string[]> {
  expect(header).toBeTruthy();
  const directives = new Map<string, string[]>();
  for (const part of header!.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

/** Hostnames of the URL sources in a list (keywords such as 'self' are skipped) */
function sourceHosts(sources: string[]): string[] {
  return sources.flatMap((source) => {
    try {
      return [new URL(source).hostname];
    } catch {
      return [];
    }
  });
}

/** scriptSrc -> script-src */
const toDirectiveName = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe("Swagger UI CSP Middleware Integration", () => {
  let server: TestServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createTestServer({
      // The global policy createApp() applies when NODE_ENV=production
      middleware: [createSecurityHeaders(false)], // the production configuration
      setup: async (app, httpServer) => {
        await registerRoutes(httpServer, app);
      },
    });
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  const cspOf = async (path: string) => {
    const response = await fetch(`${baseUrl}${path}`);
    expect(response.status).toBe(200);
    return response.headers.get("content-security-policy");
  };

  it("should send the security headers SECURITY.md lists, on the docs page and the API alike", async () => {
    for (const path of ["/api/docs/ui", "/api/version"]) {
      const headers = (await fetch(`${baseUrl}${path}`)).headers;
      expect(headers.get("strict-transport-security"), path).toBe("max-age=31536000; includeSubDomains");
      expect(headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(headers.get("x-frame-options"), path).toBe("SAMEORIGIN");
      expect(headers.get("x-xss-protection"), path).toBe("0");
      expect(headers.get("referrer-policy"), path).toBe("strict-origin-when-cross-origin");
      expect(headers.get("cross-origin-opener-policy"), path).toBe("same-origin");
      expect(headers.get("cross-origin-resource-policy"), path).toBe("same-origin");
      expect(headers.get("x-powered-by"), path).toBeNull();
    }
  });

  describe("Swagger UI Route (/api/docs/ui)", () => {
    it("should replace the global CSP with the Swagger UI policy", async () => {
      const docsHeader = await cspOf("/api/docs/ui");
      const globalHeader = await cspOf("/api/version");

      // One policy, not the global one plus an override (browsers enforce every policy sent)
      expect(docsHeader).toBe(buildSwaggerUICSP());
      expect(docsHeader).not.toBe(globalHeader);
    });

    it("should keep every directive and source of the global policy actually sent", async () => {
      // Compared with the header Helmet sends, defaults included (form-action,
      // script-src-attr), not with baseCSPDirectives alone
      const docs = parseCsp(await cspOf("/api/docs/ui"));
      const global = parseCsp(await cspOf("/api/version"));

      expect([...docs.keys()].sort()).toEqual([...global.keys()].sort());
      for (const [name, sources] of global) {
        expect(docs.get(name), name).toEqual(expect.arrayContaining(sources));
      }
      expect(global.get("form-action")).toEqual(["'self'"]);
      expect(global.get("script-src-attr")).toEqual(["'none'"]);
    });

    it("should not upgrade requests to https (the server speaks plain HTTP)", async () => {
      // Over http on a LAN address, upgrade-insecure-requests would make the browser
      // fetch the page's own assets over https, and they would fail to load
      for (const path of ["/api/docs/ui", "/api/version"]) {
        expect(parseCsp(await cspOf(path)).has("upgrade-insecure-requests"), path).toBe(false);
      }
    });

    it("should not loosen the lockdown directives", async () => {
      const docs = parseCsp(await cspOf("/api/docs/ui"));

      expect(docs.get("default-src")).toEqual(["'self'"]);
      expect(docs.get("object-src")).toEqual(["'none'"]);
      expect(docs.get("base-uri")).toEqual(["'self'"]);
      expect(docs.get("frame-ancestors")).toEqual(["'self'"]);
    });

    it("should allow jsDelivr only for scripts, styles and source maps", async () => {
      const docs = parseCsp(await cspOf("/api/docs/ui"));
      const cdnDirectives = ["script-src", "style-src", "connect-src"];

      for (const name of cdnDirectives) {
        expect(docs.get(name)).toContain(JSDELIVR_SOURCE);
      }
      for (const [name, sources] of docs) {
        if (!cdnDirectives.includes(name)) expect(sourceHosts(sources)).not.toContain(JSDELIVR_HOST);
      }
    });

    it("should allow inline scripts (SwaggerUIBundle setup) and inline styles (theming)", async () => {
      const docs = parseCsp(await cspOf("/api/docs/ui"));

      expect(docs.get("script-src")).toContain("'unsafe-inline'");
      expect(docs.get("style-src")).toContain("'unsafe-inline'");
    });
  });

  describe("Other Routes", () => {
    it("should keep the strict global CSP: no jsDelivr and no inline scripts", async () => {
      // /api/docs (the spec) shares the /api/docs/ui prefix, so it also guards against prefix matching
      for (const path of ["/api/version", "/api/docs", "/health"]) {
        const header = await cspOf(path);
        const csp = parseCsp(header);

        expect(header).not.toBe(buildSwaggerUICSP());
        expect(csp.get("script-src")).toEqual(["'self'"]);
        expect(csp.get("script-src")).not.toContain("'unsafe-inline'");
        for (const sources of csp.values()) {
          expect(sourceHosts(sources)).not.toContain(JSDELIVR_HOST);
        }
      }
    });
  });

  describe("Global CSP Scope", () => {
    it("should not allow third-party script or connect origins outside Swagger UI", () => {
      // jsDelivr serves arbitrary npm packages, so allowing it globally would let an
      // injected <script> tag load attacker-controlled code on the main app.
      expect(baseCSPDirectives.scriptSrc).toEqual(["'self'"]);
      expect(baseCSPDirectives.connectSrc).toEqual(["'self'"]);
      expect(Object.values(baseCSPDirectives).flatMap(sourceHosts)).not.toContain(JSDELIVR_HOST);
    });

    it("should not mutate the shared base directives when building Swagger CSP", () => {
      const before = JSON.stringify(baseCSPDirectives);
      buildSwaggerUICSP();
      buildSwaggerUICSP();
      expect(JSON.stringify(baseCSPDirectives)).toBe(before);
    });
  });
});

describe("Global security headers by environment", () => {
  /** CSP of a bare app that uses only createSecurityHeaders() */
  async function cspFor(isDevelopment: boolean): Promise<Map<string, string[]>> {
    const server = await createTestServer({
      middleware: [createSecurityHeaders(isDevelopment)],
      setup: (app) => { app.get("/", (_req, res) => { res.send("ok"); }); },
    });
    try {
      return parseCsp((await fetch(`${server.baseUrl}/`)).headers.get("content-security-policy"));
    } finally {
      await closeTestServer(server);
    }
  }

  it("should keep production script-src to 'self' with no CSP reporting", async () => {
    const csp = await cspFor(false);
    expect(csp.get("script-src")).toEqual(["'self'"]);
    expect(csp.has("report-uri")).toBe(false);
  });

  it("should add Vite's inline scripts, HMR websockets and CSP reporting only in development", async () => {
    const csp = await cspFor(true);
    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.get("connect-src")).toEqual(expect.arrayContaining(["ws://127.0.0.1:*", "ws://localhost:*"]));
    expect(csp.get("report-uri")).toEqual(["/__csp-violation"]);
  });

  it("should not send Helmet's upgrade-insecure-requests in either environment", async () => {
    for (const isDevelopment of [false, true]) {
      expect((await cspFor(isDevelopment)).has("upgrade-insecure-requests"), `isDevelopment=${isDevelopment}`).toBe(false);
    }
  });

  it("should list every directive Helmet sends in baseCSPDirectives (production)", async () => {
    // So buildSwaggerUICSP(), which starts from baseCSPDirectives, keeps them all
    const csp = await cspFor(false);
    expect([...csp.keys()].sort()).toEqual(Object.keys(baseCSPDirectives).map(toDirectiveName).sort());
  });
});
