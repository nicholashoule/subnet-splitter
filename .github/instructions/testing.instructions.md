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
  unit/              # Individual function tests (7 files, 310 tests)
  integration/       # System-wide feature tests (8 files, 218 tests)
  manual/            # Manual testing scripts
  README.md          # Testing documentation
```

## Running Tests

```bash
npm run test               # Watch mode (default)
npm run test -- --run      # Run once and exit
npm run test -- tests/unit/subnet-utils.test.ts   # Single file
npm run test -- -t "pattern"                      # Filter by name
npm run test:emoji         # Emoji detection only
```

`tests/integration/swagger-ui-theming.test.ts` needs a dev server (`npm run dev`) on port 5000 and skips itself when none is running; every other test is self-contained.

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

| Category | Tests | Files |
|----------|-------|-------|
| **Unit** | 310 | 7 (subnet-utils, k8s-generator, network-separation, ip-compliance, ui-styles, emoji-detection, config) |
| **Integration** | 218 | 8 (API, calculator-ui, k8s-api, rate-limiting, CSP, Swagger, static-serving) |
| **Total** | 528 | 15 |
| **Pass Rate** | 100% | |

See [docs/test-suite-analysis.md](../../docs/test-suite-analysis.md) for detailed analysis.

## Quality Gates

All must pass before committing:

- [ ] All 528 tests pass
- [ ] No skipped or pending tests (except during development)
- [ ] WCAG accessibility standards maintained (ui-styles tests)
- [ ] Security endpoints fully tested (CSP, rate limiting)
- [ ] API infrastructure validated (JSON and YAML output)
- [ ] `npm run build` then `npm run smoke` pass (the bundle, not just the source)

## Continuous Integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, on Node.js 24 and 26 (15-minute timeout):

1. `npm ci`, `npm audit`, `npm run check`
2. `npm run test -- --run` (no dev server, so `swagger-ui-theming.test.ts` skips itself)
3. `npm run build`, then `npm run smoke`: `scripts/smoke-test.ts` starts `dist/index.cjs` on `SMOKE_PORT` (default 5099), checks health, app and CSP headers, SPA fallback, the plan and tiers APIs (private mode, validation errors), and API docs SRI, and writes `dist/openapi.json`
4. `npx --yes @apidevtools/swagger-cli@4.0.4 validate dist/openapi.json`

`.github/workflows/validate-instructions.yml` runs when instruction files change: each `.github/instructions/*.instructions.md` needs `applyTo` front matter, `---` on line 1, and at most 200 lines; `.github/copilot-instructions.md` stays at 10 lines or fewer.

## API Testing Workflow

1. Run API tests: `npm run test -- tests/integration/kubernetes-network-api.test.ts --run` (no server needed; HTTP routes are covered by `api-endpoints.test.ts` and `npm run smoke`)
2. For manual requests, start the dev server: `npm run dev` (wait for the `Server started` log line with host `127.0.0.1`, port `5000`)

See [docs/test-templates.md](../../docs/test-templates.md) for manual API testing examples.

## Test File Summary

### Unit Tests
- `subnet-utils.test.ts` -- IP conversion, prefix/mask, subnet calculation, splitting, edge cases
- `kubernetes-network-generator.test.ts` -- network generation, tier configs, CIDR normalization
- `network-separation.test.ts` -- every tier x provider x `networkMode` keeps nodes, control plane, pods, and services separated; one-network control plane (GKE/AKS/generic: one `/28`; EKS: two `/28`s in two AZs on a `/27` boundary); private mode (no public subnets; `subnets.loadBalancer`: GKE one `/26`-`/23` regional subnet, AKS one, EKS two or more AZs; empty in public mode; private tier layouts; unknown mode rejected); EKS two-AZ rule; GKE/AKS regional subnets; `podsCidr`/`servicesCidr`/`availabilityZones` overrides; `172.17.0.0/16` warnings; provider-specific `minVpcPrefix`
- `ip-calculation-compliance.test.ts` -- provider-specific IP allocation formulas
- `ui-styles.test.ts` -- WCAG contrast for every text pair the app renders (light and dark, tokens read from `index.css`), page semantics
- `emoji-detection.test.ts` -- emoji validation in source files
- `config.test.ts` -- configuration validation

### Integration Tests
- `api-endpoints.test.ts` -- API infrastructure (44 tests)
- `calculator-ui.test.ts` -- React components (52 tests)
- `kubernetes-network-api.test.ts` -- K8s API endpoint flow (48 tests)
- `rate-limiting.test.ts` -- security middleware (25 tests)
- `swagger-ui-csp-middleware.test.ts` -- CSP middleware (20 tests)
- `swagger-ui-theming.test.ts` -- Swagger UI themes (12 tests)
- `csp-violation-endpoint.test.ts` -- CSP violations (12 tests)
- `static-serving.test.ts` -- production static file serving (5 tests)
