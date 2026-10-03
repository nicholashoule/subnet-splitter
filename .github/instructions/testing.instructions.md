---
applyTo: "tests/**"
---

# Testing Instructions

## Framework

- **Vitest 5** (^5.0.0) with TypeScript
- Pattern: `tests/**/*.test.ts` (automatic discovery)
- Environment: Node.js
- Path aliases: `@/` prefix works in tests
- TypeScript strict mode enforced

## Test Structure

```
tests/
  unit/              # Individual function tests, no servers
  integration/       # System-wide feature tests
  manual/            # Manual testing scripts
  README.md          # Testing documentation
```

## Running Tests

```bash
npm run test               # Watch mode (default)
npm run test -- --run      # Run once and exit
npm run test -- tests/unit/subnet-utils.test.ts   # Single file
npm run test -- -t "pattern"                      # Filter by name
npm run emoji:check        # Emoji audit (demojify, needs Go; also a CI job)
```

Every test is self-contained: integration tests start their own in-process servers, so nothing needs `npm run dev`.

## Writing Tests

**Location:** `tests/unit/` for unit tests, `tests/integration/` for integration tests.

**Naming:** `{module}.test.ts` or `{feature}.test.ts`

**Imports:** Use the path aliases for client and shared code; server code, test helpers, and `package.json` have no alias, so import them relatively:

```typescript
import { describe, it, expect } from "vitest";
import { functionToTest } from "@/lib/module";            // client/src
import { KubernetesNetworkPlanRequestSchema } from "@shared/kubernetes-schema"; // shared
import { registerRoutes } from "../../server/routes";      // server
```

See [docs/test-templates.md](../../docs/test-templates.md) for full templates and patterns.

### Structure Rules

- Use `describe()` to group related tests
- Use `it()` for individual cases with clear descriptions
- Each test verifies one thing (single assertion or related set)
- Test both success and failure cases
- Include edge cases and boundary conditions
- Validate error messages for error-throwing functions

### Assertion Preferences

- `expect(value).toBe(expected)` for primitives
- `expect(value).toEqual(expected)` for objects/arrays
- `expect(() => fn()).toThrow("message")` for errors
- Avoid `.toBeTruthy()` when a specific value is expected

## Current Coverage

| Category | Files |
|----------|-------|
| **Unit** | subnet-utils, k8s-generator, network-separation, ip-compliance, ui-styles, config |
| **Integration** | API, calculator-ui, k8s-api, rate-limiting, CSP middleware, CSP violation endpoint, Swagger theming, static-serving |
| **Pass Rate** | 100% |

Docs keep no test counts: `npm test -- --run` prints them. The [test inventory](../../docs/test-suite-analysis.md#test-inventory) says what each file covers.

## Quality Gates

All must pass before committing:

- [ ] All tests pass (`npm run test -- --run`)
- [ ] No skipped or pending tests (except during development)
- [ ] WCAG accessibility standards maintained (ui-styles tests)
- [ ] Security endpoints fully tested (CSP, rate limiting)
- [ ] API infrastructure validated (JSON and YAML output)
- [ ] `npm run build` then `npm run smoke` pass (the bundle, not just the source)

## Continuous Integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, on Node.js 24 and 26 (15-minute timeout):

1. `npm ci`, `npm audit`, `npm run check`
2. `npm run test -- --run`
3. `npm run build`, then `npm run smoke`: `scripts/smoke-test.ts` starts `dist/index.cjs` on `SMOKE_PORT` (default 5099), checks health, app and CSP headers, SPA fallback, the plan and tiers APIs (private mode, validation errors), JSON 404s for unknown API paths, API docs SRI, and startup rejection of a bad `PORT` or `TRUST_PROXY`, and writes `dist/openapi.json` (after checking it matches `server/openapi.ts`)
4. `npx --yes @apidevtools/swagger-cli@4.0.4 validate dist/openapi.json`
5. A separate `emoji` job: `npm run emoji:check` (demojify, Go). The same check runs as a pre-commit hook (`.githooks/pre-commit`) on the staged files only; it skips with a message when Go 1.24+ is missing or demojify cannot run

`.github/workflows/validate-instructions.yml` runs when instruction files change: each `.github/instructions/*.instructions.md` needs `applyTo` front matter, `---` on line 1, and at most 200 lines; `.github/copilot-instructions.md` stays at 10 lines or fewer.

## API Testing Workflow

1. Run API tests: `npm run test -- tests/integration/kubernetes-network-api.test.ts --run` (no server needed; HTTP routes are covered by `api-endpoints.test.ts` and `npm run smoke`)
2. For manual requests, start the dev server: `npm run dev` (wait for the `Server started` log line with host `127.0.0.1`, port `5000`)

See [docs/test-templates.md](../../docs/test-templates.md) for manual API testing examples.

## Test File Summary

### Unit Tests
- `subnet-utils.test.ts` -- IP conversion, prefix/mask, subnet calculation, splitting, edge cases
- `kubernetes-network-generator.test.ts` -- network generation, tier configs, CIDR normalization
- `network-separation.test.ts` -- every tier x provider x `networkMode` keeps nodes, control plane, pods, and services separated; one-network control plane (GKE/AKS/generic: one `/28`; EKS: two `/28`s in two AZs on a `/27` boundary); private mode (no public subnets; `subnets.loadBalancer`: GKE one `/26`-`/23` regional subnet, AKS one, EKS two or more AZs; empty in public mode; private tier layouts; unknown mode rejected); EKS two-AZ rule; GKE/AKS regional subnets; `podsCidr`/`servicesCidr`/`availabilityZones` overrides; `172.17.0.0/16` warnings; provider-specific `minVpcPrefix`; provider address rules (AKS-reserved `172.30.0.0/16` and `172.31.0.0/16`, the `100.64.0.0/10` pod fallback, GKE `servicesCidr` `/16` cap, `/16` VPC cap)
- `ip-calculation-compliance.test.ts` -- provider-specific IP allocation formulas
- `ui-styles.test.ts` -- WCAG contrast for every text pair the app renders (light and dark, tokens read from `index.css`), a guard against Tailwind palette colors, page semantics
- `config.test.ts` -- configuration validation (reads project files; runs git and the pre-commit hook in temporary repositories)

### Integration Tests
- `api-endpoints.test.ts` -- API infrastructure, JSON 404s, formats, docs page
- `calculator-ui.test.ts` -- calculator logic through the real subnet-utils functions (no React rendered)
- `kubernetes-network-api.test.ts` -- K8s plan generation called directly
- `rate-limiting.test.ts` -- rate limiters and logging of rejected requests
- `swagger-ui-csp-middleware.test.ts` -- production and docs-page CSP headers
- `swagger-ui-theming.test.ts` -- docs page theme scripts, run in a node:vm sandbox
- `csp-violation-endpoint.test.ts` -- the real CSP violation endpoint
- `static-serving.test.ts` -- production static file serving
