---
applyTo: "server/**"
---

# Backend Instructions

## Stack

- Express.js 5 with TypeScript (strict mode)
- Node.js runtime, no database (in-memory only)
- Static file serving from `dist/public` in production
- Zod for request/response validation
- `shared/schema.ts` and `shared/kubernetes-schema.ts` for shared types

## Key Files

| File | Purpose |
|------|---------|
| `server/index.ts` | Express server setup, fallback listen logic |
| `server/routes.ts` | API route definitions (shared handler functions) |
| `server/csp-config.ts` | Centralized CSP directive configuration |
| `server/static.ts` | Production static file serving with file-extension guard |
| `server/vite.ts` | Vite dev server integration and SPA fallback |
| `server/openapi.ts` | OpenAPI 3.0 specification |
| `server/logger.ts` | Structured logging system |
| `shared/schema.ts` | Shared Zod schemas and TypeScript types |
| `shared/kubernetes-schema.ts` | Kubernetes API schemas |

## Server Binding

Windows doesn't support `0.0.0.0` binding. Fallback order: `127.0.0.1` then `localhost`.

## Security: Helmet & CSP

- All CSP directives live in `server/csp-config.ts` (single source of truth)
- **Never edit CSP strings directly** -- use `baseCSPDirectives`
- Route-specific overrides use `buildSwaggerUICSP()` pattern
- Only `/api/docs/ui` gets `cdn.jsdelivr.net` in `connectSrc` (principle of least privilege)
- Development adds `'unsafe-inline'` for Vite HMR + WebSocket URLs
- CSP violation endpoint: `POST /__csp-violation` (dev only, W3C `"csp-report"` wrapper format)

**Helmet v8 rules:**
- Do NOT use `xssFilter` or `noSniff` options (removed in v8)
- `X-Content-Type-Options: nosniff` is automatic
- `referrerPolicy: "strict-origin-when-cross-origin"` is configured
- `crossOriginEmbedderPolicy: false` for SPA resource embedding

**When modifying CSP:**
1. Update `baseCSPDirectives` in `server/csp-config.ts`
2. Test both dev and prod modes
3. Check browser DevTools for blocked resources
4. Test in Chrome/Edge/Firefox (enforcement varies)

See [docs/security-reference.md](../../docs/security-reference.md) for detailed CSP examples, rate limiting code, and security issue history.

## Security: Rate Limiting

- Production SPA fallback: 30 req / 15 min (file system ops are expensive)
- Dev SPA fallback: 100 req / 15 min (more permissive)
- CSP violation endpoint: 100 reports / 15 min
- All limiters use `ipKeyGenerator` with fallback for undefined `req.ip`

**Trust Proxy:** Configured via `TRUST_PROXY` env var. Default `false` (secure).
- NEVER set `trust proxy = true` -- allows IP spoofing via `X-Forwarded-For`
- Use `TRUST_PROXY=1` for single reverse proxy, or specific CIDRs

## SPA Fallback Middleware

- File-extension guard **must live in the SPA fallback itself** (not just in rate limiter `skip`)
- Requests with file extensions (`.js`, `.css`, `.tsx`) must `next()` to Vite/static middleware
- Without this guard, `.tsx` files render as HTML, breaking Vite React plugin
- Middleware order: Vite middleware -> static serving -> rate limiter -> SPA fallback

## API Conventions

- Use Zod for all request validation in route handlers
- Shared handler functions (e.g., `handleNetworkPlan`, `handleTiers`) -- no code duplication
- Error responses: `{ error: string, code: string }` with appropriate HTTP status
- Support JSON (default) and YAML (`?format=yaml`) output formats

### Kubernetes Network Planning API

- `POST /api/kubernetes/network-plan` -- generate network plan
- `GET /api/kubernetes/tiers` -- deployment tier information
- Supports providers: `eks`, `gke`, `aks`, `kubernetes`/`k8s`
- RFC 1918 private addressing, deterministic generation
- See [docs/API.md](../../docs/API.md) for full API reference
- See [docs/kubernetes-network-reference.md](../../docs/kubernetes-network-reference.md) for provider compliance formulas

### Planned Endpoints (Future)

- `POST /api/subnets/calculate` -- server-side CIDR calculation
- `POST /api/subnets/split` -- split subnet into children
- `POST /api/subnets/batch` -- bulk calculation

## Error Handling

- Use clear error messages with specific error codes
- Validate all inputs before processing
- Return appropriate HTTP status codes (400 for validation, 500 for internal)
- CSP violation endpoint always returns 204 (W3C spec)

## Security Pitfalls (Do NOT)

- Disable CSP: `contentSecurityPolicy: false`
- Use broad directives: `scriptSrc: ["*"]`
- Leave `'unsafe-inline'` in production scripts
- Skip browser testing for CSP changes
- Set `trust proxy = true`

## URL Validation vs CSP Directives

- **User input URLs:** always extract and validate `.host` before redirect
- **CSP directives:** hardcoded constants, not user input -- `Array.includes()` is safe
- These are fundamentally different security contexts

## npm Scripts

```json
{
  "dev": "cross-env NODE_ENV=development tsx server/index.ts",
  "build": "tsx scripts/build.ts",
  "start": "NODE_ENV=production node dist/index.cjs",
  "check": "tsc",
  "audit": "npm audit",
  "audit:fix": "npm audit fix"
}
```

## Code Style

- No `any` types; TypeScript strict mode enforced
- Use `cross-env` for environment variables in npm scripts
- Deduplicate route handlers into shared functions
- All endpoints accepting input need rate limiting
