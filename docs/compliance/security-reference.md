# Security Reference

Detailed security configuration, examples, and issue history for the CIDR Subnet Calculator. This file contains long-form reference material extracted from the instruction files.

## Dependency Audit Protocol

### Audit Commands

```bash
npm run audit           # Check for vulnerabilities (npm audit)
npm run audit:fix       # Fix vulnerabilities (npm audit fix)
npm run audit           # Verify 0 vulnerabilities
```

`npm audit fix --force` can install breaking major versions; use it only after reviewing what it would change. CI runs `npm audit` on every push to `main` and every pull request (`.github/workflows/ci.yml`).

### When to Run

- Before installing new dependencies
- After modifying `package.json`
- Before committing code
- Before running tests or build

### Known Vulnerability Resolutions

| Dependency | Issue | Resolution |
|-----------|-------|------------|
| `qs` 6.14.1 | arrayLimit bypass DoS (GHSA-w7fw-mjwx-w883) | `"qs": "6.14.2"` in `overrides` (now pinned to 6.16.0) |
| Vitest 2.1.8 | 5 moderate vulnerabilities (esbuild/vite) | Updated to Vitest ^3.0.0 (now ^5.0.0) |

### Failed Audit Recovery

1. Review `package.json` changes
2. Run `npm install` to sync `package-lock.json`
3. Test: `npm run dev` (starts), `npm run test -- --run` (passes), `npm run build` (succeeds), `npm run smoke` (the built server passes)
4. Manually review and revert if issues persist

## Helmet & CSP Configuration

### Base CSP Directives (`server/csp-config.ts`)

**Production (Strict):**

```typescript
{
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  formAction: ["'self'"],      // Helmet default, listed so the Swagger UI policy keeps it
  scriptSrcAttr: ["'none'"],   // Helmet default: no inline event handler attributes
}
```

No third-party script origins: the app bundle is served from `'self'`, and only `/api/docs/ui` gets `cdn.jsdelivr.net` (see below).

These are all the directives of the production header. `createSecurityHeaders()` turns off the one other Helmet default, `upgrade-insecure-requests` (`upgradeInsecureRequests: null`): the server speaks plain HTTP, and over plain HTTP on a LAN address that directive makes browsers request the app's own `/assets` over https, so the page loads blank.

**Development additions** (`createSecurityHeaders(isDevelopment)` in `server/csp-config.ts`, which `createApp()` in `server/app.ts` applies with Helmet):

```typescript
scriptSrc: [...base, "'unsafe-inline'"],                         // Vite HMR
connectSrc: [...base, "ws://127.0.0.1:*", "ws://localhost:*"],  // HMR WebSocket
reportUri: ["/__csp-violation"],
```

### Swagger UI Route-Specific CSP

Only `/api/docs/ui` adds `'unsafe-inline'` and `https://cdn.jsdelivr.net` to `script-src`, and `https://cdn.jsdelivr.net` to `style-src` and `connect-src` (principle of least privilege). Built from `baseCSPDirectives`, it keeps every other directive and source of the production header; `tests/integration/swagger-ui-csp-middleware.test.ts` and `npm run smoke` compare the two headers:

```typescript
export function buildSwaggerUICSP(): string {
  const cdnSource = "https://cdn.jsdelivr.net";
  const additions: CSPDirectives = {
    scriptSrc: ["'unsafe-inline'", cdnSource],
    styleSrc: [cdnSource],
    connectSrc: [cdnSource],
  };
  // Copy baseCSPDirectives (never mutate the shared object), append the
  // additions without duplicates, then serialize to "script-src ...; ..."
}
```

**Subresource Integrity:** Swagger UI assets are pinned to `https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.1` and loaded with `sha384` `integrity` hashes and `crossorigin="anonymous"` (`SWAGGER_UI_VERSION` and `SRI` in `server/swagger-ui.ts`), so the browser refuses a changed or compromised CDN file. When upgrading Swagger UI, update the version and both hashes (CSS and bundle) as described in `.github/swagger-ui-theming.md`.

### CSP Violation Reporting

**Endpoint:** `POST /__csp-violation` (development only)

Browsers send each violation as an `application/csp-report` body wrapped in a `"csp-report"` key (the report-uri serialization in the CSP spec), for example from Chrome:

```json
{
  "csp-report": {
    "document-uri": "http://localhost:5000/",
    "referrer": "",
    "blocked-uri": "inline",
    "effective-directive": "script-src-elem",
    "violated-directive": "script-src-elem",
    "original-policy": "default-src 'self'; script-src 'self'; report-uri /__csp-violation",
    "disposition": "enforce",
    "status-code": 200,
    "source-file": "http://localhost:5000/",
    "line-number": 12,
    "column-number": 5
  }
}
```

`cspViolationReportSchema` in `server/csp-config.ts` accepts exactly the fields of that serialization (`script-sample` too, sent when the policy has `'report-sample'`). It is strict, so a body with any other field is logged as an invalid report. The handler lives in `server/csp-report.ts`. Each IP may send 100 reports per 15 minutes. The rate limit runs first, then the route's JSON parser, so malformed reports count toward it too. Reports past the limit never reach the handler: the limiter answers them with an empty `204` and nothing is logged. Every report that reaches the handler, valid or invalid, gets an empty `204 No Content` (browsers ignore the response). A body that is not valid JSON, is larger than 16 KB, or has an unsupported character set never reaches the handler either: the parser rejects it with `400`, `413` or `415` and the JSON error body.

### Helmet v8 Rules

- `X-Content-Type-Options: nosniff` is automatic (no config)
- Do NOT use deprecated options: `xssFilter`, `noSniff`
- `referrerPolicy: "strict-origin-when-cross-origin"`
- `crossOriginEmbedderPolicy: false` (allow SPA resource embedding)

## Rate Limiting Configuration

### API Routes (`server/routes.ts`)

Mounted for every `/api` route in `server/app.ts` (`createApp()`) with `app.use("/api", createApiRateLimiter())`. Health endpoints (`/api/v1/health*`) are skipped so probes are never throttled; the unprefixed `/health*` routes are outside `/api` and not limited.

```typescript
export function createApiRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a minute and try again.", code: "RATE_LIMITED" },
    skip: (req) => req.path.startsWith("/v1/health"),
    keyGenerator: (req) => req.ip ? ipKeyGenerator(req.ip) : "unknown",
  });
}
```

### Request Body Limit (`server/app.ts`)

`express.json()` runs on `/api` only, after the `/api` rate limiter, so malformed or oversized bodies count toward the limit, and is capped at 16 KB (`limit: "16kb"`). Larger bodies are rejected with 413 and code `INVALID_REQUEST`, always in JSON (`errorHandler`), whatever `?format=` asks for. There is no URL-encoded parser: the API takes JSON only.

### Production SPA Fallback (`server/static.ts`)

```typescript
const spaRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests..."
});
```

### CSP Violation Endpoint (`server/csp-report.ts`)

```typescript
const cspViolationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  // Past the limit, reports are dropped unlogged but still acknowledged with 204
  handler: (_req, res) => { res.status(204).end(); },
});
```

### Trust Proxy Configuration

| Setting | Use Case | Security |
|---------|----------|----------|
| `TRUST_PROXY=false` (default) | Direct connections, local dev | Safe |
| `TRUST_PROXY=1` | Single reverse proxy | Safe |
| `TRUST_PROXY="10.0.0.0/8,127.0.0.1"` | Specific proxy CIDRs | Safe |

**NEVER** set `trust proxy = true` -- allows IP spoofing via `X-Forwarded-For`.

When `trust proxy = false`, `req.ip` may be undefined. All rate limiters use `ipKeyGenerator` with fallback values.

## URL Validation vs CSP Directives

**User input URLs** (security-sensitive -- validate host):

```javascript
let url = req.param('url'),
    host = urlLib.parse(url).host;
let allowedHosts = ['example.com', 'beta.example.com'];
if (allowedHosts.includes(host)) {
    res.redirect(url);
}
```

**CSP directives** (server config -- hardcoded constants, not user input):

```typescript
const cdnSource = "https://cdn.jsdelivr.net";
if (!swaggerDirectives.connectSrc.includes(cdnSource)) {
    swaggerDirectives.connectSrc.push(cdnSource);
}
```

These are fundamentally different contexts. CSP uses exact string matching on constants. References: OWASP SSRF, CWE-20, CWE-601.

## Security Issues & Resolutions

### Issue 1: Helmet v8 Deprecated Options

- `xssFilter` and `noSniff` removed in Helmet v8
- Resolution: removed from config; v8 provides `nosniff` automatically

### Issue 2: CSP Blocking Dev Tools

- Vite HMR blocked by `script-src 'self'`
- Resolution: `'unsafe-inline'` in development only

### Issue 3: SPA Fallback Rendering .tsx as HTML

- Catch-all middleware ran before file extension check
- Resolution: skip fallback for requests with file extensions

### Issue 4: CSP Report Wrapper Not Handled

- Endpoint validated `req.body` directly instead of extracting W3C `"csp-report"` wrapper
- All browser reports silently rejected
- Resolution: updated schema and endpoint to expect wrapper structure

### Issue 5: CSP Endpoint Not Rate Limited

- No rate limiting allowed log flooding DoS
- Resolution: added 100 reports / 15 min limiter

## Security Checklist

Before committing:

- [ ] `npm audit` -- 0 vulnerabilities
- [ ] `npm run check` -- TypeScript strict passes
- [ ] `npm run test -- --run` -- all tests pass
- [ ] Dev server: no console errors
- [ ] Production build: `npm run build && npm run smoke` (checks the strict CSP, `nosniff`, rate-limit headers, and docs-page SRI on the bundle; `npm start` to try it by hand)
- [ ] CSP: test in Chrome/Edge/Firefox, check DevTools
- [ ] If modifying CSP: document rationale, test both modes
