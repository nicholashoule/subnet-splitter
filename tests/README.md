# Tests Directory

This directory contains all test suites for the CIDR Subnet Calculator project.

## Test Suite Overview

**Test Count**: 503 tests in 14 files (unit: 323 in 6 files; integration: 180 in 8 files)  
**Pass Rate**: 100% passing  
**Overall Grade**: A (Comprehensive tier configuration testing with proper test organization)

## Test Categories

The project uses two types of tests:

1. **Unit Tests** (`tests/unit/`) - Pure function tests, no I/O, no servers
2. **Integration Tests** (`tests/integration/`) - Self-contained tests with their own test servers

**Note**: Integration tests that need HTTP start their own in-process servers, so no test requires the webapp to be running.

## Structure

```
tests/
├── unit/                          # Unit tests - Pure functions, no I/O
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
│   ├── test-api-endpoints.ps1    # PowerShell API validation
│   ├── test-api.ps1              # PowerShell private IP validation
│   ├── test-network-comparison.ts  # TypeScript network comparison utility
│   └── test-network-validation.ts  # TypeScript network validation utility
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
- Provider support (EKS, GKE, AKS, Kubernetes)

**network-separation.test.ts:**
- Property tests for every tier, provider, and `networkMode` (`public`, `private`): nodes, control-plane, and public or load-balancer subnets inside the VPC; pods and services outside it, each in its own RFC 1918 block; no two ranges overlap; every CIDR canonical; subnet counts match the published tier layout
- Control plane is one network: GKE, AKS, and generic Kubernetes get a single `/28`; EKS gets exactly two `/28`s in two AZs, starting on a `/27` boundary and contiguous
- Private network mode: no public subnets for any provider or tier; `subnets.loadBalancer` holds `load-balancer` subnets (GKE: one regional proxy-only-sized subnet, `/26` to `/23`; AKS: one regional subnet; EKS: at least two AZs); `subnets.loadBalancer` is empty in public mode; private tier layouts; an unknown `networkMode` is rejected
- Generated pod and service ranges avoid `172.17.0.0/16`; a VPC overlapping it yields a `warnings` entry (omitted otherwise)
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
- Page semantics from `calculator.tsx` (alt text, `h1` followed by `h2`, aria-labels, labelled input and error)

**config.test.ts:**
- Tailwind CSS v4 setup (Vite plugin, no PostCSS or legacy config, replaced packages removed)
- Theme tokens defined for both light and dark mode
- Vite configuration verification
- Emoji check: `emoji:check` and `emoji:fix` pin demojify once, and CI and the pre-commit hook both call `npm run emoji:check`
- Pre-commit hook: the `prepare` script (`scripts/install-hooks.mjs`) points `core.hooksPath` at `.githooks`; `.githooks/pre-commit` has a `#!/bin/sh` shebang, LF line endings, and the executable bit in git, and skips (exit 0) without Go 1.24+
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
- Provider support (EKS, GKE, AKS, Kubernetes)

**rate-limiting.test.ts**:
- Rate limiter configuration (SPA fallback: 30 requests per 15 minutes; API: 100 per minute, health probes exempt)
- Request throttling behavior
- Header verification (`RateLimit-*` headers from the IETF draft, with `RateLimit-Reset` in seconds and `RateLimit-Policy: 30;w=900`; legacy `X-RateLimit-*` headers are not sent)
- Multiple endpoints protected
- Rate-limited (429) and malformed-body (400) requests are logged

**csp-violation-endpoint.test.ts**:
- Registers the production handler and limiter from `server/csp-report.ts`
- CSP violation report handling
- W3C spec compliance
- Rate limiting for log flooding prevention (`RateLimit-Policy: 100;w=900`)
- Schema validation

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

**calculator-ui.test.ts** (calls the real functions in `client/src/lib/subnet-utils.ts`, chained the way `calculator.tsx` uses them; no React is rendered, so markup, clipboard, toasts, and the CSV download itself are not covered):
- Form validation before calculation (required value, format hint, host bits set rejected)
- Subnet splitting and the tree size limit
- Visible rows: expansion, depth-first order, Hide Parents, and selecting and exporting only visible rows
- Network class badge
- Depth indicator visual hierarchy

### Manual Testing Scripts (`tests/manual/`)

Scripts for manual API validation and testing.

**test-api-endpoints.ps1:**
- Comprehensive API endpoint validation
- Tests all deployment tiers (micro, standard, professional, enterprise, hyperscale)
- Validates JSON and YAML output formats
- Tests all providers (eks, gke, aks, kubernetes, k8s)
- Colored PowerShell output with error handling

**test-api.ps1:**
- RFC 1918 private IP enforcement validation
- Tests Class A (10.0.0.0/8), Class B (172.16.0.0/12), Class C (192.168.0.0/16)
- Public IP rejection testing (8.8.8.0/16)
- Security compliance verification

**test-network-comparison.ts:**
- TypeScript utility for comparing network plan outputs
- Cross-provider network configuration analysis

**test-network-validation.ts:**
- TypeScript utility for validating network plan correctness
- Subnet overlap detection and CIDR validation

**Running Manual Tests:**
```powershell
# From project root
.\tests\manual\test-api-endpoints.ps1
.\tests\manual\test-api.ps1

# Requires dev server running
npm run dev
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

The repository is emoji-free. The check is not a Vitest test: CI runs [demojify](https://github.com/nicholashoule/demojify-sanitize) (pinned to v1.1.0) as its own job, and the npm scripts run the same command locally (Go 1.24+ required). The pre-commit hook `.githooks/pre-commit`, installed by `npm install` (the `prepare` script), runs `npm run emoji:check` before each commit and skips with a message when Go 1.24+ is missing. `config.test.ts` checks that the scripts, CI, and the hook stay wired together.

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

**Current Assessment** (February 14, 2026):
- **Grade**: A (Comprehensive coverage with proper organization)
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
