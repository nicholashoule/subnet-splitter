---
applyTo: "server/**"
---

# Backend Instructions

## Stack

- Express.js 5 with TypeScript (strict mode)
- Node.js 24 or 26 runtime, no database (in-memory only)
- Static file serving from `dist/public` in production
- Zod for request/response validation
- `shared/schema.ts` and `shared/kubernetes-schema.ts` for shared types

## Key Files

| File | Purpose |
|------|---------|
| `server/index.ts` | Express server setup, middleware, `HOST`/`PORT` binding |
| `server/routes.ts` | API route definitions (shared handler functions) |
| `server/csp-config.ts` | Centralized CSP directive configuration and `cspViolationReportSchema` |
| `server/static.ts` | Production static file serving with file-extension guard |
| `server/vite.ts` | Vite dev server integration and SPA fallback |
| `server/openapi.ts` | OpenAPI 3.0 specification; request/response examples are generated at startup from the real generator (never hand-write them) |
| `server/swagger-ui.ts` | API docs page (`/api/docs/ui`): markup, styles, theme script, pinned Swagger UI assets and SRI hashes |
| `server/logger.ts` | Structured logging system |
| `shared/schema.ts` | Shared calculator types (`SubnetInfo`) and `SUBNET_CALCULATOR_LIMITS`; no Zod |
| `shared/kubernetes-schema.ts` | Kubernetes API schemas |
| `scripts/build.ts` | `npm run build`: Vite client to `dist/public`, esbuild server bundle to `dist/index.cjs` |
| `scripts/smoke-test.ts` | `npm run smoke`: starts `dist/index.cjs` and checks it over HTTP; writes `dist/openapi.json` |

## Server Binding

The bind address comes from `HOST`: default `0.0.0.0` in production (reachable inside containers) and `127.0.0.1` in development. The port comes from `PORT` (default `5000`). There is no fallback to another host; a bind error is logged and the process exits.

Health checks: `/health`, `/health/ready`, `/health/live`, and the same under `/api/v1/health*`.

## Security: Helmet & CSP

- All CSP directives live in `server/csp-config.ts` (single source of truth)
- **Never edit CSP strings directly** -- use `baseCSPDirectives`
- Route-specific overrides use `buildSwaggerUICSP()` pattern
- Global `script-src` is `'self'` only (no CDN origins)
- Only `/api/docs/ui` adds `'unsafe-inline'` + `cdn.jsdelivr.net` to `script-src` and `cdn.jsdelivr.net` to `style-src`/`connect-src` (principle of least privilege)
- Swagger UI assets are pinned to `swagger-ui-dist@5.33.1` with `sha384` Subresource Integrity; markup and SRI hashes live in `server/swagger-ui.ts` (`SWAGGER_UI_VERSION`, `SRI`); see `.github/swagger-ui-theming.md` before bumping the version
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

See [docs/compliance/security-reference.md](../../docs/compliance/security-reference.md) for detailed CSP examples, rate limiting code, and security issue history.

## Security: Rate Limiting

- API routes (`/api/*`): 100 req / min per IP via `createApiRateLimiter()` in `server/routes.ts`; `/api/v1/health*` exempt; 429 `{ error, code: "RATE_LIMITED" }`
- Request bodies capped at 16 KB (`express.json`/`express.urlencoded`)
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

- `POST /api/kubernetes/network-plan` -- generate network plan (optional `podsCidr`, `servicesCidr`, `availabilityZones`, `networkMode`)
- `GET /api/kubernetes/tiers` -- deployment tier information; `?provider=eks|gke|aks|kubernetes|k8s` and `?networkMode=public|private` (400 `INVALID_REQUEST` otherwise, naming the field), since layouts and `minVpcPrefix` differ by provider
- Supports providers: `eks`, `gke`, `aks`, `kubernetes`/`k8s`
- RFC 1918 private addressing, deterministic generation when `vpcCidr` is given
- Four separated address spaces in every plan: nodes (`subnets.private`) and the control plane (`subnets.controlPlane`) inside the VPC; pods and services outside it, each in its own RFC 1918 block; generated ranges avoid `172.17.0.0/16` (overlapping VPCs get a `warnings` entry)
- The control plane is one network: one `/28` for GKE, AKS, and generic Kubernetes; for EKS exactly two `/28`s in two AZs, placed as one aligned `/27`
- `networkMode`: `public` (default) or `private`. Every plan has top-level `networkMode` and `subnets.loadBalancer` (empty in public mode); private mode empties `subnets.public` and puts internal load-balancer subnets (type `load-balancer`) in `subnets.loadBalancer`. OpenAPI includes generated `gke_private` and `eks_private` examples
- Plan format version is `metadata.version` (`PLAN_FORMAT_VERSION`, currently `"2.0"`)
- See [docs/api.md](../../docs/api.md) for full API reference
- See [docs/compliance/kubernetes-network-reference.md](../../docs/compliance/kubernetes-network-reference.md) for provider compliance formulas

### Planned Endpoints (Future)

- `POST /api/subnets/calculate` -- server-side CIDR calculation
- `POST /api/subnets/split` -- split subnet into children
- `POST /api/subnets/batch` -- bulk calculation

## Error Handling

- Use clear error messages with specific error codes
- Validate all inputs before processing
- Return appropriate HTTP status codes (400 for validation, 413 for oversized bodies, 429 for rate limits, 500 for internal)
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
  "dev": "tsx server/index.ts",
  "build": "tsx scripts/build.ts",
  "start": "node dist/index.cjs",
  "smoke": "tsx scripts/smoke-test.ts",
  "check": "tsc",
  "test": "vitest",
  "test:emoji": "vitest run tests/unit/emoji-detection.test.ts",
  "emoji:check": "tsx scripts/fix-emoji.ts",
  "emoji:fix": "tsx scripts/fix-emoji.ts --fix",
  "audit": "npm audit",
  "audit:fix": "npm audit fix"
}
```

`npm run dev` serves the API and the client through Vite middleware on `127.0.0.1:5000`; React and CSS hot-reload, but server changes need a restart. `npm run smoke` runs against the last `npm run build` (port `SMOKE_PORT`, default 5099).

## Code Style

- No `any` types; TypeScript strict mode enforced
- Don't set env vars inline in npm scripts; `NODE_ENV=production` is inlined into `dist/index.cjs` at build time (`scripts/build.ts`)
- Deduplicate route handlers into shared functions
- All endpoints accepting input need rate limiting
