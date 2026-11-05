# Development

How to run, build, test, and contribute to subnet-splitter. For the API, see [api.md](api.md); for security settings, [compliance/security-reference.md](compliance/security-reference.md).

## Setup

Requires Node.js 24 or 26, npm 11, and Git. The repository checks (`governance:check`, `emoji:check`) also need Go 1.24 or newer.

```bash
git clone https://github.com/nicholashoule/subnet-splitter.git && cd subnet-splitter
npm ci          # exact versions from package-lock.json; also installs the pre-commit hook
npm audit       # must report 0 vulnerabilities before running anything
npm run dev     # http://127.0.0.1:5000
```

If `npm audit` finds vulnerabilities, run `npm audit fix` and audit again. `--force` may install breaking changes, so review its result.

The development server listens on `127.0.0.1:5000` (loopback only):

- Web app: `http://127.0.0.1:5000`
- API: `POST /api/k8s/plan`, `GET /api/k8s/tiers`
- API docs: `/api/docs/ui` (Swagger UI)

React and CSS changes reload live; restart `npm run dev` after changing `server/`, `shared/`, or `client/src/lib/kubernetes-network-generator.ts`.

### Windows

If PowerShell's execution policy blocks `npm` (the `npm.ps1` shim), call `npm.cmd` instead. npm scripts set no inline environment variables, so each runs unchanged in cmd, PowerShell, and POSIX shells. `.gitattributes` normalizes line endings to LF, so Git may warn about CRLF on Windows; that is expected.

## Production build

```bash
npm run build    # client to dist/public/, server bundle to dist/index.cjs
npm start        # node dist/index.cjs
npm run smoke    # start the build on port 5099 and check it over HTTP
```

`dist/index.cjs` bundles every server dependency and has `NODE_ENV=production` baked in, so `node_modules` is not needed at runtime. To deploy, copy `dist/` to a host with Node.js 24 or 26 and run `node dist/index.cjs`.

`npm run smoke` starts the built server and checks health, the web app and its security headers, the plan and tiers APIs (including private mode and validation errors), JSON 404s for unknown API paths, and the API docs page, whose pinned Swagger UI files it downloads from the CDN to check their integrity hashes. It also checks that a bad `PORT` or `TRUST_PROXY` stops startup, and that the served OpenAPI document matches `server/openapi.ts`, which it writes to `dist/openapi.json`. Set `SMOKE_PORT` for another port, and `SMOKE_SKIP_CDN=1` to skip the CDN download when offline (CI ignores it).

### Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5000` | Port for the API and the web app; an integer from 1 to 65535, or startup stops with an error |
| `HOST` | `0.0.0.0` in production, `127.0.0.1` in development | Interface to bind. Production binds all interfaces so the server is reachable in a container |
| `TRUST_PROXY` | `false` | Trusted proxy hops (e.g. `1`) or a comma-separated list of proxy IPs/CIDRs, so per-IP rate limiting sees real client IPs behind a load balancer. Only trust proxies you control. `true` trusts every proxy and logs a warning, since any client can then choose its own IP; an invalid value stops startup |

Health checks for load balancers and Kubernetes probes, never rate limited: `GET /health`, `/health/ready`, `/health/live` (also under `/api/v1/health`).

## Testing

```bash
npm test -- --run                                     # every unit and integration test, once
npm test                                              # watch mode
npm test -- --run tests/unit/subnet-utils.test.ts     # one file
npm test -- --run -t "Response Format Support"        # tests matching a name
npm run check                                         # TypeScript, no output files
npm run site:check                                    # the GitHub Pages site
npm run governance:check                              # repogov: .github/ layout, Markdown line limits
npm run emoji:check                                   # demojify: fails on any emoji
npm run emoji:fix                                     # replace emoji with tokens such as [PASS]
```

No test needs the dev server: integration tests start their own in-process servers. [tests/README.md](../tests/README.md) says what each test file covers, and has the manual API scripts.

With `npm run dev` running, try the API by hand:

```bash
curl -X POST http://127.0.0.1:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"professional","provider":"eks","vpcCidr":"10.100.0.0/18"}'
curl "http://127.0.0.1:5000/api/k8s/tiers?format=yaml"
```

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/k8s/plan" -Method POST `
  -ContentType "application/json" `
  -Body '{"deploymentSize":"professional","provider":"eks"}' | ConvertTo-Json -Depth 10
```

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to `main` and every pull request, on Node.js 24 and 26: `npm ci`, `npm audit`, `npm run check`, `npm test -- --run`, `npm run build`, `npm run smoke`, then validates `dist/openapi.json` with `@apidevtools/swagger-cli`.

A separate `repo-checks` job runs [repogov](https://github.com/nicholashoule/repogov) (config in `.github/repogov-config.json`), then [demojify](https://github.com/nicholashoule/demojify-sanitize); see [emoji-prevention.md](../.github/emoji-prevention.md). Both versions are pinned in `package.json`. The pre-commit hook (`.githooks/pre-commit`, installed by `npm install`) runs the same two on staged files, and skips a check with a message when Go 1.24+ is missing.

Run everything CI runs before pushing:

```bash
npm audit && npm run check && npm test -- --run && npm run build && npm run smoke && npm run governance:check && npm run emoji:check
```

## Website

`site/index.html` is the project's GitHub Pages site: a hand-written page with no build step or framework. `npm run site:check` (`scripts/site-check.ts`) checks it: bounded size, a title, `lang`, viewport, and description, and every reference either HTTPS or a file inside `site/`, with no plain HTTP, script, `data:`, or absolute links.

[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) runs that check on pull requests that touch the site. On `main` it also deploys `site/` and fetches the live page until it matches the file just deployed. Pages must be enabled once under Settings > Pages with Source "GitHub Actions"; until then the workflow fails and says so.

## Project structure

```
client/src/         React app: components/ui (shadcn/ui), hooks, pages, index.css (design tokens)
client/src/lib/     subnet-utils (calculator math), kubernetes-network-generator (API planner)
server/             Express: app and middleware, routes, OpenAPI, Swagger UI, CSP, static serving
shared/             schema.ts (dependency-free subnet types), kubernetes-schema.ts (Zod schemas, tiers)
tests/              unit/, integration/, helpers/, manual/ (see tests/README.md)
scripts/            build.ts, smoke-test.ts, site-check.ts, install-hooks.mjs
site/               GitHub Pages site
docs/               API reference, compliance audits, conventions
.github/            workflows, instructions for contributors and agents, repogov config
.githooks/          pre-commit: repogov, then demojify on staged files
```

## Contributing

1. Read [.github/instructions/](../.github/instructions/) ([general](../.github/instructions/general.instructions.md), [backend](../.github/instructions/backend.instructions.md), [frontend](../.github/instructions/frontend.instructions.md), [testing](../.github/instructions/testing.instructions.md)) for architecture, conventions, and the security audit protocol.
2. Branch from `main` (`git switch -c feat/your-feature`); `main` takes changes only through pull requests.
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/) as described in [git-conventions.md](git-conventions.md).
4. Run the CI checks above, then try the app in a browser in both themes and at phone width: calculation, splitting, removing splits, CSV export, and invalid input.
5. Open a pull request saying what changed and why.

Code standards: TypeScript strict mode; no `any` without a reason (such as a test passing deliberately invalid input); Lucide React icons only; Tailwind utilities, no inline styles; Zod for API input validation. The [GitHub releases](https://github.com/nicholashoule/subnet-splitter/releases) explain past changes, including to the network allocation rules.
