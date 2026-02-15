# Test Suite Improvement Analysis

**Date**: 2025-01-XX  
**Scope**: Integration test duplication and shared utilities  
**Test Count**: 406 tests (218 unit + 188 integration)

## Executive Summary

Analysis of the test suite identified **~90 lines of duplicated server setup code** across 3 integration test files, plus a unique pattern in swagger-ui-csp-middleware.test.ts that duplicates setup logic internally. By creating shared test utilities, we can:

- Reduce duplication by ~90 lines
- Improve test maintainability
- Standardize server lifecycle patterns
- Reduce cognitive load when writing new integration tests

## Duplication Patterns Identified

### Pattern 1: HTTP Server Lifecycle (High Priority)

**Affected Files**:
- [tests/integration/api-endpoints.test.ts](../tests/integration/api-endpoints.test.ts)
- [tests/integration/csp-violation-endpoint.test.ts](../tests/integration/csp-violation-endpoint.test.ts)
- [tests/integration/swagger-ui-csp-middleware.test.ts](../tests/integration/swagger-ui-csp-middleware.test.ts)

**Duplicated Code** (~30 lines per file, 90 total):

```typescript
// Repeated in 3 files
let app: express.Express;
let httpServer: HttpServer;
let baseUrl: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  httpServer = createServer(app);
  
  // Register routes (varies by test)
  await registerRoutes(httpServer, app);
  
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
```

**Recommendation**: Create `tests/helpers/test-server.ts` with shared utilities.

---

### Pattern 2: Double Server Setup (Medium Priority)

**Affected Files**:
- [tests/integration/swagger-ui-csp-middleware.test.ts](../tests/integration/swagger-ui-csp-middleware.test.ts)

**Issue**: This test creates **two separate servers** (development and production) with nearly identical setup code (~50 lines total).

```typescript
// Development server setup
developmentApp = express();
developmentServer = createServer(developmentApp);
// ... route setup ...
await new Promise<void>((resolve) => {
  developmentServer.listen(0, "127.0.0.1", () => {
    const address = developmentServer.address();
    const port = typeof address === "object" && address ? address.port : 5001;
    developmentBaseUrl = `http://127.0.0.1:${port}`;
    resolve();
  });
});

// Production server setup (DUPLICATED LOGIC)
productionApp = express();
productionServer = createServer(productionApp);
// ... route setup ...
await new Promise<void>((resolve) => {
  productionServer.listen(0, "127.0.0.1", () => {
    const address = productionServer.address();
    const port = typeof address === "object" && address ? address.port : 5002;
    productionBaseUrl = `http://127.0.0.1:${port}`;
    resolve();
  });
});
```

**Recommendation**: Use parameterized server factory to create multiple servers with different configurations.

---

### Pattern 3: Temporary Directory Management (Low Priority)

**Affected Files**:
- [tests/integration/rate-limiting.test.ts](../tests/integration/rate-limiting.test.ts)

**Code** (~15 lines):

```typescript
let mockDistPath: string;

beforeEach(async () => {
  const tmpPrefix = path.join(os.tmpdir(), "test-dist-");
  mockDistPath = await fs.promises.mkdtemp(tmpPrefix);
  await fs.promises.writeFile(
    path.join(mockDistPath, "index.html"),
    "<html><body>SPA</body></html>"
  );
});

afterEach(async () => {
  await fs.promises.rm(mockDistPath, { recursive: true, force: true });
});
```

**Recommendation**: Currently only used in one test. Consider extracting if pattern repeats in future tests.

---

### Pattern 4: External Server Dependency (Documentation)

**Affected Files**:
- [tests/integration/swagger-ui-theming.test.ts](../tests/integration/swagger-ui-theming.test.ts)

**Approach**: This test expects the development server to be running on port 5000 and implements custom skip logic:

```typescript
beforeAll(async () => {
  try {
    const response = await fetch(SWAGGER_UI_URL, { signal: AbortSignal.timeout(2000) });
    serverAvailable = response.ok;
  } catch (error) {
    serverAvailable = false;
    console.log("[SKIP] Server not available on port 5000. Skipping tests.");
  }
});
```

**Observation**: Different testing approach from other integration tests (external vs internal server). This is intentional for end-to-end testing.

**Recommendation**: Document this pattern in [tests/README.md](../tests/README.md) as a valid approach for E2E tests.

---

## Proposed Solution: Shared Test Utilities

Create `tests/helpers/test-server.ts`:

```typescript
/**
 * tests/helpers/test-server.ts
 * 
 * Shared utilities for integration tests that need HTTP server lifecycle.
 * Reduces duplication across api-endpoints, csp-violation, and CSP middleware tests.
 */

import express, { type Express } from "express";
import { createServer, type Server as HttpServer } from "http";

export interface TestServerConfig {
  /** App configuration callback (register routes, middleware) */
  setup?: (app: Express, httpServer: HttpServer) => void | Promise<void>;
  /** Express middleware to add before routes */
  middleware?: express.RequestHandler[];
  /** Default port to use if random port allocation fails */
  defaultPort?: number;
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
 * @example
 * const server = await createTestServer({
 *   setup: async (app, httpServer) => {
 *     await registerRoutes(httpServer, app);
 *   }
 * });
 * // ... run tests ...
 * await closeTestServer(server);
 */
export async function createTestServer(config: TestServerConfig = {}): Promise<TestServer> {
  const app = express();
  
  // Add default JSON middleware
  app.use(express.json());
  
  // Add custom middleware
  if (config.middleware) {
    config.middleware.forEach(mw => app.use(mw));
  }
  
  const httpServer = createServer(app);
  
  // Run setup callback
  if (config.setup) {
    await config.setup(app, httpServer);
  }
  
  // Start server on random port
  const { port, baseUrl } = await new Promise<{ port: number; baseUrl: string }>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : (config.defaultPort ?? 5001);
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({ port, baseUrl });
    });
  });
  
  return { app, httpServer, baseUrl, port };
}

/**
 * Close a test server gracefully
 */
export async function closeTestServer(server: TestServer): Promise<void> {
  await new Promise<void>((resolve) => {
    server.httpServer.close(() => resolve());
  });
}

/**
 * Create multiple test servers in parallel (for environment comparison tests)
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
 */
export async function closeTestServers(servers: TestServer[]): Promise<void> {
  await Promise.all(servers.map(server => closeTestServer(server)));
}
```

---

## Impact Analysis

### Before (api-endpoints.test.ts)

```typescript
describe("API Endpoints Integration", () => {
  let app: express.Express;
  let httpServer: HttpServer;
  let baseUrl: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    
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

  // ... tests ...
});
```

**Lines**: 30 (including imports and cleanup)

---

### After (api-endpoints.test.ts)

```typescript
import { createTestServer, closeTestServer, type TestServer } from "../helpers/test-server";

describe("API Endpoints Integration", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({
      setup: async (app, httpServer) => {
        await registerRoutes(httpServer, app);
      }
    });
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  // Tests use server.baseUrl, server.app, server.httpServer
});
```

**Lines**: 12  
**Reduction**: 18 lines per file × 3 files = **54 lines saved**

---

### swagger-ui-csp-middleware.test.ts (Double Server)

**Before**: ~100 lines of setup/cleanup

**After**:

```typescript
import { createTestServers, closeTestServers, type TestServer } from "../helpers/test-server";

describe("Swagger UI CSP Middleware Integration", () => {
  let developmentServer: TestServer;
  let productionServer: TestServer;

  beforeAll(async () => {
    [developmentServer, productionServer] = await createTestServers([
      {
        setup: (app) => {
          app.get("/api/docs/ui", (req, res, next) => {
            res.setHeader('Content-Security-Policy', buildSwaggerUICSP());
            next();
          }, (req, res) => {
            res.send('<html><body>Swagger UI (Development)</body></html>');
          });
        }
      },
      {
        setup: (app) => {
          app.get("/api/docs/ui", (req, res, next) => {
            res.setHeader('Content-Security-Policy', buildSwaggerUICSP());
            next();
          }, (req, res) => {
            res.send('<html><body>Swagger UI (Production)</body></html>');
          });
        }
      }
    ]);
  });

  afterAll(async () => {
    await closeTestServers([developmentServer, productionServer]);
  });
  
  // Tests use developmentServer.baseUrl and productionServer.baseUrl
});
```

**Reduction**: ~36 lines of boilerplate setup code

---

## Summary of Improvements

| File | Current Lines | Proposed Lines | Saved |
|------|---------------|----------------|-------|
| api-endpoints.test.ts | 30 (setup) | 12 | 18 |
| csp-violation-endpoint.test.ts | 30 (setup) | 12 | 18 |
| swagger-ui-csp-middleware.test.ts | 100 (dual setup) | 64 | 36 |
| **Total** | **160** | **88** | **72** |

**Additional Benefits**:
- [x] Standardized server lifecycle across all integration tests
- [x] Easier to add new integration tests (copy pattern)
- [x] Single place to fix bugs in server setup
- [x] Better TypeScript type safety with `TestServer` interface
- [x] Support for parallel server creation (dual server pattern)

---

## Implementation Plan

### Step 1: Create Shared Utility
- Create `tests/helpers/test-server.ts` with utilities above
- Add tests for the helper itself (optional but recommended)

### Step 2: Migrate Existing Tests
- Update [tests/integration/api-endpoints.test.ts](../tests/integration/api-endpoints.test.ts)
- Update [tests/integration/csp-violation-endpoint.test.ts](../tests/integration/csp-violation-endpoint.test.ts)
- Update [tests/integration/swagger-ui-csp-middleware.test.ts](../tests/integration/swagger-ui-csp-middleware.test.ts)

### Step 3: Verify
```bash
npm run test -- --run  # All 406 tests should pass
```

### Step 4: Document Pattern
- Update [tests/README.md](../tests/README.md) with `createTestServer()` usage examples
- Document when to use internal vs external server testing

---

## Future Considerations

### Temporary Directory Helper (if needed)

```typescript
/**
 * tests/helpers/test-fixtures.ts
 */
export async function createTempDir(prefix: string = "test-"): Promise<string> {
  const tmpPrefix = path.join(os.tmpdir(), prefix);
  return await fs.promises.mkdtemp(tmpPrefix);
}

export async function removeTempDir(dirPath: string): Promise<void> {
  await fs.promises.rm(dirPath, { recursive: true, force: true });
}
```

Currently only used in rate-limiting.test.ts, but pattern available if needed.

---

## Risk Assessment

**Low Risk**: 
- Changes are isolated to test files
- No production code affected
- Easy to verify with `npm run test`
- Can migrate one file at a time

**Testing Strategy**:
1. Run full test suite before changes: `npm run test -- --run`
2. Create helper utility
3. Migrate one test file
4. Verify tests still pass
5. Migrate remaining files
6. Final verification

---

## References

- [Test Suite Analysis](./test-suite-analysis.md) - Current test audit
- [Testing Instructions](./.github/instructions/testing.instructions.md) - Test conventions
- [tests/README.md](../tests/README.md) - Test documentation
