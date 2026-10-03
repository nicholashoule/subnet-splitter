# Tests Directory

This directory contains all test suites for the CIDR Subnet Calculator project.

## Test Suite Overview

**What each file covers**: see the [test inventory](../docs/test-suite-analysis.md#test-inventory); `npm test -- --run` prints the current counts  
**Pass Rate**: 100% passing  
**Overall Grade**: A+ (from the February 8, 2026 audit; see [Test Quality & Audit](#test-quality--audit))

## Test Categories

The project uses two types of tests:

1. **Unit Tests** (`tests/unit/`) - Functions tested in isolation, no servers. Most are pure; `ui-styles.test.ts` and `config.test.ts` read project files, and `config.test.ts` also runs git and runs the pre-commit hook in temporary repositories
2. **Integration Tests** (`tests/integration/`) - Self-contained tests with their own test servers

**Note**: Integration tests that need HTTP start their own in-process servers, so no test requires the webapp to be running.

## Structure

```
tests/
├── unit/                          # Unit tests - No servers
│   ├── subnet-utils.test.ts      # Subnet calculation utilities
│   ├── kubernetes-network-generator.test.ts  # K8s network generation
│   ├── network-separation.test.ts  # Address space separation invariants (every tier x provider)
│   ├── ip-calculation-compliance.test.ts  # IP allocation compliance
│   ├── ui-styles.test.ts         # WCAG accessibility
│   └── config.test.ts            # Configuration validation
├── integration/                   # Integration tests - Self-contained with test servers
│   ├── api-endpoints.test.ts     # API infrastructure - Starts own server
│   ├── calculator-ui.test.ts     # Calculator logic via subnet-utils - No server
│   ├── kubernetes-network-api.test.ts  # K8s API flow - Calls the generator, no server
│   ├── rate-limiting.test.ts     # Rate limiting - Starts own server
│   ├── swagger-ui-csp-middleware.test.ts  # CSP middleware - Starts own server
│   ├── swagger-ui-theming.test.ts  # Swagger themes - Starts own server
│   ├── csp-violation-endpoint.test.ts  # CSP violations - Starts own server
│   └── static-serving.test.ts    # Production static serving (caching, gzip)
├── helpers/                       # Shared test utilities
│   └── test-server.ts            # HTTP server lifecycle for integration tests
├── manual/                        # Manual testing scripts
│   ├── test-api-endpoints.ps1    # PowerShell: 3 private VPCs planned, 2 public rejected
│   ├── test-api.ps1              # PowerShell: 1 private VPC planned, 1 public rejected
│   ├── test-network-comparison.ts  # Prints EKS hyperscale ranges for three VPC blocks
│   └── test-network-validation.ts  # Prints one EKS hyperscale plan and checks its pod/service blocks
└── README.md                      # This file
```

### Server Requirements

**Self-Contained Tests (Most tests)**:
- Start their own Express servers on random ports
- Do NOT require webapp to be running
- Can run in parallel
- Includes: `api-endpoints.test.ts`, `rate-limiting.test.ts`, `csp-violation-endpoint.test.ts`, `swagger-ui-csp-middleware.test.ts`, `swagger-ui-theming.test.ts`, `static-serving.test.ts` (`kubernetes-network-api.test.ts` and `calculator-ui.test.ts` need no server at all)

## Running Tests

```bash
# Run all tests in watch mode (none need the webapp running)
npm run test

# Run tests once and exit (what CI runs)
npm run test -- --run

# Run specific test file
npm run test -- tests/unit/subnet-utils.test.ts --run
npm run test -- tests/unit/ui-styles.test.ts --run

# Check for emoji (demojify CLI, needs Go 1.24+; not part of Vitest)
npm run emoji:check

# Replace emoji with text tokens
npm run emoji:fix
```

## Test Organization

### Unit Tests (`tests/unit/`)

Unit tests verify individual functions and utilities in isolation.

**subnet-utils.test.ts:**
- IP conversion (ipToNumber, numberToIp)
- Prefix/mask conversion (prefixToMask, maskToPrefix)
- Subnet calculations (calculateSubnet, splitSubnet)
- Network class identification (Class A-E)
- Utility functions (formatNumber, getSubnetClass, collectAllSubnets, collectVisibleSubnets)
- Tree collection functions with hideParents logic
- Error handling and validation
- Edge cases (RFC 3021 /31, /32 networks)

**kubernetes-network-generator.test.ts:**
- Network plan generation for all deployment tiers
- RFC 1918 private IP enforcement
- Subnet allocation algorithms
- Provider support: EKS, GKE, generic Kubernetes, and the default provider (no AKS plans here; AKS is covered in `network-separation.test.ts` and `ip-calculation-compliance.test.ts`)

**network-separation.test.ts:**
- Property tests for every tier, provider, and `networkMode` (`public`, `private`): nodes, control-plane, and public or load-balancer subnets inside the VPC; pods and services outside it, each in a block of its own (RFC 1918, or `100.64.0.0/10` for pods when no RFC 1918 block has room); no two ranges overlap; every CIDR canonical; subnet counts match the published tier layout
- Control plane is one network: GKE, AKS, and generic Kubernetes get a single `/28`; EKS gets exactly two `/28`s in two AZs, starting on a `/27` boundary and contiguous
- Private network mode: no public subnets for any provider or tier; `subnets.loadBalancer` holds `load-balancer` subnets (GKE: one regional proxy-only-sized subnet, `/26` to `/23`; AKS: one regional subnet; EKS: at least two AZs); `subnets.loadBalancer` is empty in public mode; private tier layouts; an unknown `networkMode` is rejected
- Generated pod and service ranges avoid `172.17.0.0/16`; a VPC overlapping it yields a `warnings` entry (omitted otherwise)
- Provider address rules: AKS rejects a VNet, `podsCidr`, or `servicesCidr` in `172.30.0.0/16` or `172.31.0.0/16`, and AKS hyperscale on a `10.x` VNet gets pods `100.64.0.0/13`; GKE `servicesCidr` is capped at `/16`; a VPC larger than `/16` is rejected; generated pods stay out of a caller `servicesCidr`'s block
- EKS puts every subnet type in at least two AZs; GKE and AKS subnets carry no zone
- `podsCidr`, `servicesCidr`, and `availabilityZones` overrides and their rejections
- Provider-specific tier layouts and `minVpcPrefix` ("VPC too small" errors name the minimum)

**ip-calculation-compliance.test.ts:**
- IP allocation formulas for pod and node capacity
- Deployment tier compliance testing
- Network sizing validation
- Hyperscale capacity as it is: the `/13` pod range holds 2,048 nodes at a `/24` per node; 5,000 nodes need a `/11` `podsCidr` (the override is accepted)

**ui-styles.test.ts:**
- WCAG contrast for every text pair the app renders, light and dark, with colors read from `client/src/index.css` (including tooltips on `popover` and the 404 page link on `card`)
- Non-text contrast (3:1): focus ring, toast close icon
- Fails on Tailwind palette colors (`text-green-600`, `bg-gray-50`, `--color-<palette>` variables) in client code; only `getDepthIndicatorClasses()` in `subnet-utils.ts` is exempt
- Design system consistency (primary hue, ring, destructive)
- Focus indicators: Button, Input and Checkbox draw a 2px focus ring outside a 2px gap (no 1px ring)
- Page semantics from `calculator.tsx` (alt text, `h1` followed by `h2`, aria-labels, labelled input and error)
- Announcements: validation errors are alerts and `onSubmit` does not move focus; table status sits in a live region
- Theme before first paint: `theme-init.js` loads as a blocking script in `<head>`, applies dark only for a saved `dark`, and keeps light when storage throws
- Calculator wiring: memoized rows with a stable split callback, table and export built from the visible rows, a minus for the partial select-all state, header icons sized through their buttons, example loads confirmed through the announced toast

**config.test.ts:**
- Tailwind CSS v4 setup (Vite plugin, no PostCSS or legacy config, replaced packages removed)
- Theme tokens defined for both light and dark mode
- Vite configuration verification
- Emoji check: `emoji:check` and `emoji:fix` pin demojify once, and CI and the pre-commit hook both call `npm run emoji:check`
- Pre-commit hook: the `prepare` script (`node scripts/install-hooks.mjs || exit 0`) points `core.hooksPath` at `.githooks`; `.githooks/pre-commit` has a `#!/bin/sh` shebang, LF line endings, and the executable bit in git. The hook itself runs in temporary repositories with stub `go` and `npm`: it skips (exit 0) without Go 1.24+ or when demojify cannot run, fails (exit 1) only on findings in staged files, and removes its temporary export
- Frontend instructions recommend a real browser over VS Code Simple Browser

### Integration Tests (`tests/integration/`)

Integration tests verify system-wide features and API behavior.

**Self-Contained Integration Tests (Start Own Servers)**:

**api-endpoints.test.ts**:
- Health check endpoints (/health, /health/ready, /health/live), with ISO 8601 UTC timestamps
- API version endpoint
- OpenAPI specification (JSON/YAML)
- Swagger UI presentation
- Endpoint aliases return the same full plan (only the generation timestamp may differ)
- Error handling consistency: unknown `/api` paths and methods get a JSON 404 (not the web app), a repeated `?format=` falls back to JSON, unknown fields are ignored and not echoed
- Response formats: JSON and YAML for tiers and plans; YAML quotes strings such as `yes` and `no` that YAML 1.1 readers would load as booleans
- Provider-specific and private-mode tier layouts (`?provider=`, `?networkMode=private`; an unknown `networkMode` returns 400)

**kubernetes-network-api.test.ts** (calls `generateKubernetesNetworkPlan` and `getDeploymentTierInfo` directly; no HTTP server):
- Plan workflow (tier info, then a plan) and real-world scenarios
- Plans are plain data that survive a JSON round trip unchanged (JSON and YAML over HTTP are tested in `api-endpoints.test.ts`, "Response Format Support")
- RFC 1918 private IP enforcement
- Public IP rejection
- All deployment tiers (micro -> hyperscale); for each, an EKS plan in each RFC 1918 block has canonical, non-overlapping subnets inside the VPC
- Provider support: EKS, GKE, and generic Kubernetes plans; AKS appears only in the JSON round-trip test

**rate-limiting.test.ts**:
- Rate limiter configuration (SPA fallback: 30 requests per 15 minutes; API: 100 per minute)
- Request throttling behavior
- Header verification (`RateLimit-*` headers from the IETF draft, with `RateLimit-Reset` in seconds and `RateLimit-Policy: 30;w=900`; legacy `X-RateLimit-*` headers are not sent)
- Multiple endpoints protected
- Health probe exemption: only `GET` and `HEAD` of the real health paths; other methods and lookalike paths count
- The API limiter runs before the JSON parser, so malformed and oversized bodies count toward the limit
- Rate-limited (429) and malformed-body (400) requests are logged, and `/api` is logged in any letter case
- `server/index.ts` builds on `createApp()` and registers `errorHandler` after the routes and static serving

**csp-violation-endpoint.test.ts**:
- Registers the production handler and limiter from `server/csp-report.ts`
- CSP violation report handling
- W3C spec compliance
- Rate limiting for log flooding prevention (`RateLimit-Policy: 100;w=900`): reports past the limit get 204 and are not logged; the limiter runs before the JSON parser, so malformed reports count
- Schema validation, including a complete Chrome-shaped report

**swagger-ui-csp-middleware.test.ts**:
- Serves the real routes behind the production global headers (`createSecurityHeaders()` from `server/csp-config.ts`)
- `/api/docs/ui` sends one policy (`buildSwaggerUICSP()`) in place of the global one; jsDelivr only in `script-src`, `style-src`, and `connect-src`
- Every other route keeps the strict global CSP
- Global headers in production vs development (`'unsafe-inline'`, HMR websockets, and `report-uri` only in development)
- Headers parsed into directives and compared source token by source token

**swagger-ui-theming.test.ts**:
- Runs the docs page's inline scripts in a `node:vm` sandbox with stand-ins for `document`, `localStorage`, `window`, and `SwaggerUIBundle`
- Saved theme applied before any stylesheet loads (anything but a saved `dark` is light)
- Theme toggle: switches, saves to localStorage, and re-mounts Swagger UI with the matching code highlighting; still works when localStorage throws
- Follows theme changes made in another tab
- Version badge colored with the theme's primary tokens
- **Note**: Starts its own in-process server, so it always runs (no `npm run dev` needed, no skips)

**Calculator Logic Tests (No Server)**:

**calculator-ui.test.ts** (calls the real functions in `client/src/lib/subnet-utils.ts` in the order `calculator.tsx` calls them; no React is rendered, so markup, focus, clipboard, toasts, and the file download itself are not covered):
- Form validation before calculation (`validateCidrInput`, then `calculateSubnet`)
- Split and remove-split tree updates, and the tree size limit
- Table rows: expansion, Hide Parents, depth, and parent CIDR
- CSV export: the CSV text for selected rows that are visible
- Network class badge
- Depth indicator visual hierarchy

### Manual Testing Scripts (`tests/manual/`)

Scripts for manual checks against a running dev server (the PowerShell scripts) or the generator itself (the TypeScript scripts). They print results; they are not part of `npm test`.

**test-api-endpoints.ps1:**
- Sends 5 JSON requests to `POST /api/k8s/plan` with no `provider` (so generic Kubernetes): `professional` VPCs `10.0.0.0/16` and `172.16.0.0/16` and a `standard` VPC `192.168.0.0/16`, which should return 200, and `professional` VPCs `8.8.8.0/16` and `200.0.0.0/16`, which should return 400
- Checks private versus public VPC handling only: no other tiers or providers, and no YAML. Exits 1 if any check fails

**test-api.ps1:**
- A quicker version of the same check: 2 requests, `10.0.0.0/16` (200) and `8.8.8.0/16` (400). Exits 1 if either check fails

Both take `-BaseUrl` (default `http://127.0.0.1:5000`).

**test-network-comparison.ts:**
- Generates an EKS hyperscale plan for each of three VPCs (`10.42.192.0/18`, `172.20.0.0/18`, `192.168.0.0/18`) and prints the VPC, pod, and service ranges
- Reports whether the three ranges sit in three different RFC 1918 blocks and whether pods landed in `10.0.0.0/8`

**test-network-validation.ts:**
- Generates one EKS hyperscale plan (VPC `10.42.192.0/18`) and prints it
- Checks that the pod and service ranges are not inside the VPC and are in a different RFC 1918 block from it; it does not check subnets against each other (the unit tests do)

**Running Manual Tests:**
```powershell
# The PowerShell scripts call the dev server at 127.0.0.1:5000; start it first
npm run dev

# Then, from the project root in another terminal
.\tests\manual\test-api-endpoints.ps1
.\tests\manual\test-api.ps1

# The TypeScript scripts call the generator directly (no server)
npx tsx tests/manual/test-network-comparison.ts
npx tsx tests/manual/test-network-validation.ts
```

## Writing New Tests

When adding new tests:

1. **Create test file** in appropriate subdirectory:
   - Unit tests: `tests/unit/`
   - Integration tests: `tests/integration/` (shared server helpers in `tests/helpers/test-server.ts`)

2. **Name convention**: `{module}.test.ts`

3. **Test template**:
   ```typescript
   import { describe, it, expect } from "vitest";
   import { functionToTest } from "@/path/to/module";

   describe("Module Name", () => {
     describe("functionToTest", () => {
       it("should do something specific", () => {
         const result = functionToTest(input);
         expect(result).toBe(expected);
       });
     });
   });
   ```

4. **Use path aliases** for imports:
   - `@` - points to `client/src/`
   - `@shared` - points to `shared/`

## Emoji Checking and Fixing

The repository is emoji-free. The check is not a Vitest test: CI runs [demojify](https://github.com/nicholashoule/demojify-sanitize) (pinned to v1.1.0) as its own job, and the npm scripts run the same command locally (Go 1.24+ required). The pre-commit hook `.githooks/pre-commit`, installed by `npm install` (the `prepare` script), runs `npm run emoji:check` on the staged files before each commit, and skips with a message when Go 1.24+ is missing or demojify cannot be downloaded or built. `config.test.ts` checks that the scripts, CI, and the hook stay wired together.

```bash
# Audit every text file; exits 1 and reports file, line, and column for each emoji
npm run emoji:check

# Replace emoji with text tokens such as [PASS], [FAIL], [WARNING]; review with git diff
npm run emoji:fix
```

A test that needs emoji should build them from code points (`String.fromCodePoint(0x2705)`) so the file stays emoji-free. See [.github/emoji-prevention.md](../.github/emoji-prevention.md).

## Test Configuration

Tests are configured in `vitest.config.ts` at the project root:
- **Test pattern**: `tests/**/*.test.ts`
- **Environment**: Node.js
- **Globals enabled**: `describe`, `it`, `expect` available without imports (optional)

## Test Quality & Audit

**For detailed analysis of test suite health, see [test-suite-analysis.md](../docs/test-suite-analysis.md)**

**Assessment** (grade from the February 8, 2026 audit in [test-suite-analysis.md](../docs/test-suite-analysis.md), whose inventory is kept current):
- **Grade**: A+ (comprehensive coverage with proper organization)
- **Pass Rate**: 100%
- **Test Files**: unit + integration

**Key Strengths**:
- [PASS] Comprehensive core logic coverage
- [PASS] Security-first testing
- [PASS] Production-ready infrastructure
- [PASS] Fast execution
- [PASS] Proper unit/integration separation
- [PASS] WCAG accessibility compliance validated

See [test-suite-analysis.md](../docs/test-suite-analysis.md) for complete analysis and recommendations.

### Strengths

1. **Comprehensive Core Logic Coverage**
   - Subnet calculations: 100% of functions tested with edge cases
   - Kubernetes generator: All tiers, providers, and security rules covered
   - IP calculation compliance: All deployment tier formulas validated
   - Mathematical correctness: Bitwise operations validated

2. **Security-First Testing**
   - RFC 1918 enforcement prevents production security incidents
   - Rate limiting protects against DoS attacks
   - CSP middleware validation
   - CSP violation endpoint compliance
   - Public IP rejection with security guidance

3. **Production-Ready Infrastructure**
   - Health checks work for Kubernetes probes
   - API versioning supports backward compatibility
   - OpenAPI documentation is functional
   - K8s network planning API fully tested

4. **Calculator Logic Tests**
   - Form validation before calculation, through the real `subnet-utils.ts` functions
   - Subnet splitting, tree expansion, and the tree size limit
   - Which rows are selected and exported
   - Hide parents feature
   - Depth indicator visual hierarchy

5. **Fast Execution**
   - Developers will actually run tests
   - CI/CD integration is practical

## CI/CD Integration

Tests should pass before:
- Committing code
- Creating pull requests
- Deploying to production

Include test verification in development workflow (the same steps CI runs):
```bash
npm ci                     # Install exact dependencies
npm audit                  # Security audit (0 vulnerabilities required)
npm run check              # Type checking
npm run test -- --run      # Full test suite
npm run build              # Production build
npm run smoke              # Start dist/index.cjs on port 5099 and check it over HTTP
```

`.github/workflows/ci.yml` runs these steps on every push to `main` and every pull request, on Node.js 24 and 26, then validates the OpenAPI document the smoke test saved: `npx --yes @apidevtools/swagger-cli@4.0.4 validate dist/openapi.json`. Unit and integration tests import the source; `npm run smoke` (`scripts/smoke-test.ts`, port `SMOKE_PORT`, default 5099) is what exercises the built bundle: health, app and CSP headers, SPA fallback, the plan and tiers APIs (including private mode and validation errors), and the API docs page's SRI-pinned assets. `swagger-ui-theming.test.ts` starts its own in-process server, so it runs in CI like every other test. A separate `emoji` job runs `npm run emoji:check` (demojify, Go).

---

**Last Updated**: October 2, 2026
