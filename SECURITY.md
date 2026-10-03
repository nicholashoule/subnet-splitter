# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Do NOT open a public issue for security vulnerabilities.**

Report it privately through [GitHub's private vulnerability reporting](https://github.com/nicholashoule/subnet-splitter/security/advisories/new). Only the maintainers can see the report.

### What to Include

Please provide:
- **Description** of the vulnerability
- **Steps to reproduce** the issue (a `curl` command or request body is ideal)
- **Affected version** (`GET /api/version` reports it) and whether it affects the API, the web UI, or both
- **Potential impact** of the vulnerability
- **Suggested fix** (if you have one)

### Response Timeline

- **Initial response**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix and disclosure**: Coordinated with reporter

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 2.x     | Yes       |
| < 2.0   | No        |

We provide security updates for the latest major version only. Changes are listed in each version's [GitHub release](https://github.com/nicholashoule/subnet-splitter/releases).

## Scope and Threat Model

The application is a stateless calculator. It has no database, no user accounts, no sessions or cookies, and stores nothing between requests. The web UI computes subnets in the browser; the API (`/api/k8s/plan`, `/api/k8s/tiers` and their aliases) computes network plans from the request alone. The main risks are therefore:

- **Abuse of the public API** (resource exhaustion), handled by rate limits, body limits and server timeouts
- **Script injection in the web UI or docs page**, handled by Content Security Policy and Subresource Integrity
- **Plans that are unsafe to deploy**, handled by refusing any VPC range that is not entirely private (RFC 1918), and by keeping nodes, control plane, pods and services in separate ranges that are checked never to overlap
- **Supply-chain compromise**, handled by a small dependency set, a committed lockfile and `npm audit` in CI

## Built-in Security Features

[PASS] **Input Validation**
- Every API request is validated with Zod schemas (`shared/kubernetes-schema.ts`)
- CIDRs are parsed strictly: digits only, no leading zeros (some tools read `010` as octal 8), octets 0-255, prefix 0-32; a blank CIDR field is rejected, not read as "generate one"
- The whole VPC range must fall inside one RFC 1918 block (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`); public ranges and ranges that spill out of private space are refused
- `region` and `availabilityZones` must be lowercase letters, digits and hyphens (max 64), because they are written into zone names; `deploymentName` max 128 characters
- `podsCidr` and `servicesCidr` must be private (pods: RFC 1918 or 100.64.0.0/10; services: RFC 1918), within provider size limits, and must not overlap the VPC, each other, or 172.17.0.0/16 (Docker's default bridge)
- Request bodies are capped at 16 KB

[PASS] **Security Headers** (Helmet, on every response; checked by `tests/integration/swagger-ui-csp-middleware.test.ts` and, on the production bundle, by `npm run smoke`)
- `Content-Security-Policy` (see below)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (honored by browsers over HTTPS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'self'`
- `X-XSS-Protection: 0` (header is deprecated; explicit `0` disables the legacy auditor that itself introduced XSS holes)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`
- No `X-Powered-By` header

[PASS] **Content Security Policy** (`server/csp-config.ts`)
- Production: `script-src 'self'`, `script-src-attr 'none'`, `object-src 'none'`, `connect-src 'self'`, `form-action 'self'`; no third-party script origins
- No `upgrade-insecure-requests`: the server speaks plain HTTP (TLS is terminated in front of it), and over plain HTTP that directive would make browsers fetch the app's own assets over https and show a blank page
- Only the Swagger UI page (`/api/docs/ui`) adds `cdn.jsdelivr.net` and inline scripts, and it renders nothing but the server's own OpenAPI document; it keeps every other directive of the global policy
- Swagger UI assets are pinned to an exact version and loaded with sha384 Subresource Integrity, so a modified CDN file is refused
- Development adds only what Vite HMR needs, plus a rate-limited CSP violation report endpoint

[PASS] **Rate Limiting** (`express-rate-limit`, per client IP)
- `/api` routes: 100 requests per minute (API paths are lowercased first, so `/API/...` shares the same quota), counting requests with malformed or oversized bodies (the limiter runs before body parsing); `429` with `{"code": "RATE_LIMITED"}` and standard `RateLimit-*` headers
- Health probes are exempt so they never fail: only a `GET` or `HEAD` of `/api/v1/health`, `/api/v1/health/ready` or `/api/v1/health/live` (`server/health.ts`). API and health paths are lowercased first, so `/API/V1/HEALTH` is the same probe. Other methods and lookalike paths such as `/api/v1/healthz` count; the unprefixed `/health*` routes are outside `/api`
- SPA fallback for unknown routes: 30 requests per 15 minutes (production)
- Client IPs come from the socket unless `TRUST_PROXY` is set, so `X-Forwarded-For` cannot be spoofed by default

[PASS] **Error Handling**
- Consistent `{"error", "code"}` responses (`INVALID_REQUEST`, `NETWORK_GENERATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`); API paths work in any letter case; unknown `/api` paths get a JSON 404, never the web app
- Validation and planning errors from the plan and tiers routes follow `?format=` (JSON or YAML); malformed, oversized or wrongly encoded bodies (`400`/`413`/`415`), unknown API paths (`404`) and rate limiting (`429`) are always JSON
- 5xx responses never include internal error messages or stack traces
- A rejected body (`400`/`413`/`415`) gets fixed text for its error type ("Request body is not valid JSON"), never the JSON parser's message, which can quote part of the body
- Validation errors name the offending field without echoing internals

[PASS] **Server Hardening**
- `requestTimeout` 30 s and `headersTimeout` 20 s against slow clients (Node checks them every 30 s)
- `keepAliveTimeout` 65 s, longer than common load-balancer idle timeouts (AWS ALB: 60 s), so the load balancer closes idle connections first
- Graceful shutdown on `SIGTERM`/`SIGINT`, with a 10 s forced exit
- Production serves only the compiled assets in `dist/public`; source files never fall through to `index.html`
- Development binds `127.0.0.1` only, and the Vite dev server keeps its DNS-rebinding (Host header) protection

[PASS] **Logging**
- Structured single-line JSON in production
- API requests are logged with method, path (no query string, lowercased), status, duration, client IP and user agent, plus the path as sent when its letter case differed; health probes are not logged
- API request and response bodies are never logged (the development-only CSP report endpoint logs the violation reports it receives, which is its purpose). When plan generation fails with a 500, the log records an allowlist of the validated fields that determine the plan (`deploymentSize`, `provider`, `region`, the three CIDRs, `availabilityZones`, `networkMode`), enough to reproduce it; unknown fields and the free-text `deploymentName` are left out
- A rejected body (`400`/`413`/`415`) is logged with body-parser's error type (`entity.parse.failed`, `entity.too.large`, ...), not its message, which can quote part of the body

[PASS] **Supply Chain**
- Small dependency set; unused packages are removed
- `package-lock.json` is committed and CI installs with `npm ci`
- CI runs `npm audit` on every push to `main` and every pull request, and the job fails on any known vulnerability
- CI also starts the production bundle and checks its security headers (CSP and every header listed above), its validation of bad input, and that the API docs page's Subresource Integrity hashes match the files the CDN serves (`npm run smoke`)
- The production server is a single self-contained bundle (`dist/index.cjs`); `node_modules` is not needed at runtime
- The package is `private`, so it cannot be published to npm by accident

## Recommendations for Production

#### 1. TLS/HTTPS
The server speaks plain HTTP. Terminate TLS in front of it (load balancer, ingress controller or reverse proxy) and redirect HTTP to HTTPS there. The `Strict-Transport-Security` header only takes effect over HTTPS.

#### 2. Proxies and Client IPs
Behind a load balancer, set `TRUST_PROXY` so rate limits see real client IPs instead of the proxy's:
```bash
TRUST_PROXY=1                 # one trusted hop (typical load balancer)
TRUST_PROXY=10.0.0.0/8        # or the proxy addresses/CIDRs you control
# TRUST_PROXY=true trusts any X-Forwarded-For (logged as a warning); avoid it.
# An invalid value stops startup instead of running with the wrong trust setting.
```
Only trust proxies you control. Trusting an unknown proxy lets clients spoof `X-Forwarded-For` and bypass per-IP limits.

#### 3. Rate Limits Across Replicas
Limits are kept in memory per process. With N replicas, a client can make up to N x 100 API requests per minute. For a hard global limit, also rate limit at the load balancer, WAF or API gateway.

#### 4. Network Binding
Production binds `0.0.0.0` (needed inside containers). Outside a container, set `HOST=127.0.0.1` when a local reverse proxy is the only intended client.

#### 5. Dependency Management
```bash
npm ci          # install exactly what the lockfile pins
npm audit       # must report 0 vulnerabilities
npm outdated    # review available updates
```

#### 6. Container Security
- Run as a non-root user; the server needs only `dist/` and a Node.js runtime
- Mount the filesystem read-only; the server writes nothing to disk
- Scan images for vulnerabilities before deploying

## Security Checklist

Before deploying to production:

- [ ] TLS/HTTPS terminated in front of the server, with HTTP redirected
- [ ] `TRUST_PROXY` set to match the proxies in front of the server (or left `false` with none)
- [ ] Edge rate limiting configured if running more than one replica
- [ ] `npm audit` reports 0 vulnerabilities
- [ ] Built with `npm run build` and started with `npm start` (production CSP, no Vite dev server)
- [ ] Container runs as non-root with a read-only filesystem
- [ ] Health probes point at `/health/ready` and `/health/live`
- [ ] Logs are shipped somewhere you can search
- [ ] Container images scanned for vulnerabilities
- [ ] Regular dependency updates scheduled

## Known Security Considerations

- WARNING **No authentication.** The API is public by design: it computes plans from request data and holds no secrets or user data. Put it behind your own gateway if access must be restricted.
- WARNING **The Swagger UI page allows inline scripts** (`'unsafe-inline'`), which SwaggerUIBundle requires. The exception applies to `/api/docs/ui` only, and that page renders only the server's own OpenAPI document.
- WARNING **`style-src` allows `'unsafe-inline'`** for runtime-injected styles. Style injection is far lower risk than script injection; scripts remain `'self'` only.
- WARNING **Fonts load from Google Fonts**, which sees each visitor's IP address. Self-host the fonts if that matters for your deployment.
- WARNING **Rate limits are per process** (see Recommendations, item 3).

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [Node.js Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Last Updated**: October 2026
