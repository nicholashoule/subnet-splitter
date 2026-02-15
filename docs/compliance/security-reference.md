# Security Reference

Detailed security configuration, examples, and issue history for the CIDR Subnet Calculator. This file contains long-form reference material extracted from the instruction files.

## Dependency Audit Protocol

### Audit Commands

```bash
npm audit               # Check for vulnerabilities
npm audit fix --force   # Fix vulnerabilities
npm audit               # Verify 0 vulnerabilities
```

### When to Run

- Before installing new dependencies
- After modifying `package.json`
- Before committing code
- Before running tests or build

### Known Vulnerability Resolutions

| Dependency | Issue | Resolution |
|-----------|-------|------------|
| `qs` 6.14.1 | arrayLimit bypass DoS (GHSA-w7fw-mjwx-w883) | `"qs": "6.14.2"` in `overrides` |
| Vitest 2.1.8 | 5 moderate vulnerabilities (esbuild/vite) | Updated to Vitest ^3.0.0 |

### Failed Audit Recovery

1. Review `package.json` changes
2. Run `npm install` to sync `package-lock.json`
3. Test: `npm run dev` (starts), `npm run test` (passes), `npm run build` (succeeds)
4. Manually review and revert if issues persist

## Helmet & CSP Configuration

### Base CSP Directives (`server/csp-config.ts`)

**Production (Strict):**

```typescript
{
  scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
  connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:"],
}
```

**Development additions:**

```typescript
cspDirectives.scriptSrc.push("'unsafe-inline'");           // Vite HMR
cspDirectives.connectSrc.push("ws://127.0.0.1:*", "ws://localhost:*");  // WebSocket
cspDirectives.reportUri = ["/__csp-violation"];
```

### Swagger UI Route-Specific CSP

Only `/api/docs/ui` gets `cdn.jsdelivr.net` in `connectSrc` (principle of least privilege):

```typescript
export function buildSwaggerUICSP(isDevelopment: boolean = false): string {
  const swaggerDirectives = { ...baseCSPDirectives };
  if (isDevelopment) {
    swaggerDirectives.scriptSrc.push("'unsafe-inline'");
  }
  swaggerDirectives.connectSrc.push("https://cdn.jsdelivr.net");
  return convertToCSPString(swaggerDirectives);
}
```

### CSP Violation Reporting

**Endpoint:** `POST /__csp-violation` (development only)

Browsers send CSP violations wrapped in `"csp-report"` key per W3C spec:

```json
{
  "csp-report": {
    "blocked-uri": "https://malicious.com/script.js",
    "violated-directive": "script-src",
    "original-policy": "script-src 'self'",
    "document-uri": "http://localhost:5000",
    "disposition": "enforce"
  }
}
```

Validation uses `cspViolationReportSchema` in `shared/schema.ts`. Always returns 204 No Content (W3C spec).

### Helmet v8 Rules

- `X-Content-Type-Options: nosniff` is automatic (no config)
- Do NOT use deprecated options: `xssFilter`, `noSniff`
- `referrerPolicy: "strict-origin-when-cross-origin"`
- `crossOriginEmbedderPolicy: false` (allow SPA resource embedding)

## Rate Limiting Configuration

### Production SPA Fallback (`server/static.ts`)

```typescript
const spaRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests..."
});
```

### CSP Violation Endpoint (`server/index.ts`)

```typescript
const cspViolationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: "Too many CSP violation reports. Please try again later.",
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
- [ ] Production build: `npm run build && npm start`
- [ ] CSP: test in Chrome/Edge/Firefox, check DevTools
- [ ] If modifying CSP: document rationale, test both modes
