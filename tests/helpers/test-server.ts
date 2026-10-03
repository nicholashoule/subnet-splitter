/**
 * tests/helpers/test-server.ts
 * 
 * Shared utilities for integration tests that need HTTP server lifecycle.
 *
 * createTestServer() builds a lighter stack than production's createApp()
 * (server/app.ts): it keeps case-sensitive routing, API paths in any letter case
 * (normalizeApiPath), the 16 KB JSON body limit and errorHandler (registered after
 * setup), but adds no security headers, logging or rate limiting. Tests that need
 * those pass them as middleware, or build on createApp().
 * 
 * Usage:
 * ```typescript
 * import { createTestServer, closeTestServer, type TestServer } from "../helpers/test-server";
 * 
 * let server: TestServer;
 * 
 * beforeAll(async () => {
 *   server = await createTestServer({
 *     setup: async (app, httpServer) => {
 *       await registerRoutes(httpServer, app);
 *     }
 *   });
 * });
 * 
 * afterAll(async () => {
 *   await closeTestServer(server);
 * });
 * ```
 */

import express, { type Express, type RequestHandler } from "express";
import { errorHandler } from "../../server/app";
import { normalizeApiPath } from "../../server/api-path";
import { createServer, type Server as HttpServer } from "http";
import type { OptionsJson } from "body-parser";

export interface TestServerConfig {
  /** App configuration callback (register routes, middleware) */
  setup?: (app: Express, httpServer: HttpServer) => void | Promise<void>;
  /** Express middleware to add before routes */
  middleware?: RequestHandler[];
  /** JSON parser options, merged over production's 16 KB limit */
  jsonOptions?: OptionsJson;
}

export interface TestServer {
  app: Express;
  httpServer: HttpServer;
  baseUrl: string;
  port: number;
}

/**
 * Create and start a test HTTP server
 * 
 * @param config - Server configuration options
 * @returns Promise resolving to TestServer with app, httpServer, baseUrl, and port
 * 
 * @example
 * const server = await createTestServer({
 *   setup: async (app, httpServer) => {
 *     await registerRoutes(httpServer, app);
 *   }
 * });
 */
export async function createTestServer(config: TestServerConfig = {}): Promise<TestServer> {
  const app = express();
  // As in production, before the first app.use() creates the router
  app.set("case sensitive routing", true);
  // As in production: /API/k8s/tiers is served like /api/k8s/tiers
  app.use(normalizeApiPath);

  // JSON bodies, capped at 16 KB like the API (custom options merged over that)
  app.use(express.json({ limit: "16kb", ...config.jsonOptions }));
  
  // Add custom middleware
  if (config.middleware) {
    config.middleware.forEach(mw => app.use(mw));
  }
  
  const httpServer = createServer(app);
  
  // Run setup callback
  if (config.setup) {
    await config.setup(app, httpServer);
  }

  // Production's error handler, last: malformed or oversized bodies get its JSON errors
  app.use(errorHandler);
  
  // Start on a free port chosen by the OS (port 0); a listen error fails the test
  const port = await new Promise<number>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.off("error", reject);
      const address = httpServer.address();
      if (typeof address === "object" && address) {
        resolve(address.port);
      } else {
        reject(new Error(`Test server has no TCP address: ${String(address)}`));
      }
    });
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  
  return { app, httpServer, baseUrl, port };
}

/**
 * Close a test server gracefully
 * 
 * @param server - TestServer instance to close
 * @returns Promise that resolves when server is closed
 */
export async function closeTestServer(server: TestServer): Promise<void> {
  await new Promise<void>((resolve) => {
    server.httpServer.close(() => resolve());
  });
}

/**
 * Create multiple test servers in parallel (for environment comparison tests)
 * 
 * Useful when testing different configurations (e.g., development vs production).
 * 
 * @param configs - Array of server configurations
 * @returns Promise resolving to array of TestServer instances
 * 
 * @example
 * const [devServer, prodServer] = await createTestServers([
 *   { setup: (app) => setupDevRoutes(app) },
 *   { setup: (app) => setupProdRoutes(app) }
 * ]);
 */
export async function createTestServers(configs: TestServerConfig[]): Promise<TestServer[]> {
  return Promise.all(configs.map(config => createTestServer(config)));
}

/**
 * Close multiple test servers in parallel
 * 
 * @param servers - Array of TestServer instances to close
 * @returns Promise that resolves when all servers are closed
 */
export async function closeTestServers(servers: TestServer[]): Promise<void> {
  await Promise.all(servers.map(server => closeTestServer(server)));
}
