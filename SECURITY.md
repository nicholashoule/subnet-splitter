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

- **Input validation**: every API request is validated with Zod; CIDRs are parsed strictly; VPC ranges must be entirely private (RFC 1918); bodies are capped at 16 KB and must be JSON
- **Security headers and CSP**: Helmet on every response; production `script-src 'self'`, with only the Swagger UI page allowed its pinned, Subresource Integrity-checked CDN assets
- **Rate limiting**: 100 API requests per minute per client IP (health probes exempt), 30 per 15 minutes for the SPA fallback
- **Safe errors and logs**: consistent `{"error", "code"}` responses; 5xx responses and logs never include internal messages or request bodies
- **Server hardening**: request and header timeouts, graceful shutdown, and production serves only compiled assets
- **Supply chain**: a small dependency set, a committed lockfile, `npm audit` in CI, and a smoke test of the production bundle's headers and SRI hashes

[docs/security.md](docs/security.md) gives every header, CSP directive, rate limit, and the dependency audit protocol in detail.

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
- WARNING **The pre-commit hook runs the checked-out branch's code.** `npm install` points `core.hooksPath` at `.githooks` (unless it is already set), so `git commit` runs that branch's `.githooks/pre-commit`, which runs its `npm run governance:check` and `npm run emoji:check`. Before committing on a branch you have not reviewed (for example after `gh pr checkout`), read its `.githooks/` and those two scripts in `package.json`.

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [Node.js Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
