---
applyTo:
  - "tests/**"
  - "vitest.config.ts"
---

# Testing Instructions

## Framework

- **Vitest 3+** (^3.0.0) with TypeScript
- Pattern: `tests/**/*.test.ts` (automatic discovery)
- Environment: Node.js
- Path aliases: `@/` prefix works in tests
- TypeScript strict mode enforced

## Test Structure

```
tests/
  unit/              # Individual function tests (6 files, 218 tests)
  integration/       # System-wide feature tests (7 files, 188 tests)
  manual/            # Manual testing scripts
  README.md          # Testing documentation
```

## Running Tests

```bash
npm run test               # Watch mode (default)
npm run test -- --run      # Run once and exit
npm run test:ui            # Interactive UI
npm run test -- tests/unit/subnet-utils.test.ts   # Single file
npm run test -- -t "pattern"                      # Filter by name
```

## Writing Tests

**Location:** `tests/unit/` for unit tests, `tests/integration/` for integration tests.

**Naming:** `{module}.test.ts` or `{feature}.test.ts`

**Imports:** Use path aliases, not relative paths:

```typescript
import { describe, it, expect } from "vitest";
import { functionToTest } from "@/lib/module";
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
| **Unit** | 218 | 6 (subnet-utils, k8s-generator, ip-compliance, ui-styles, emoji-detection, config) |
| **Integration** | 188 | 7 (API, calculator-ui, k8s-api, rate-limiting, CSP, Swagger) |
| **Total** | 406 | 13 |
| **Pass Rate** | 100% | |

See [docs/TEST_AUDIT.md](../../docs/TEST_AUDIT.md) for detailed analysis.

## Quality Gates

All must pass before committing:

- [ ] All 406 tests pass
- [ ] No skipped or pending tests (except during development)
- [ ] WCAG accessibility standards maintained (ui-styles tests)
- [ ] Security endpoints fully tested (CSP, rate limiting)
- [ ] API infrastructure validated (JSON and YAML output)

## API Testing Workflow

1. Start dev server: `npm run dev` (wait for "serving on 127.0.0.1:5000")
2. Run API tests: `npm run test -- tests/integration/kubernetes-network-api.test.ts --run`

See [docs/test-templates.md](../../docs/test-templates.md) for manual API testing examples.

## Test File Summary

### Unit Tests
- `subnet-utils.test.ts` -- IP conversion, prefix/mask, subnet calculation, splitting, edge cases
- `kubernetes-network-generator.test.ts` -- network generation, tier configs, CIDR normalization
- `ip-calculation-compliance.test.ts` -- provider-specific IP allocation formulas
- `ui-styles.test.ts` -- CSS variables, WCAG contrast ratios, color palette
- `emoji-detection.test.ts` -- emoji validation in source files
- `config.test.ts` -- configuration validation

### Integration Tests
- `api-endpoints.test.ts` -- API infrastructure (38 tests)
- `calculator-ui.test.ts` -- React components (52 tests)
- `kubernetes-network-api.test.ts` -- K8s API endpoint flow (33 tests)
- `rate-limiting.test.ts` -- security middleware (23 tests)
- `swagger-ui-csp-middleware.test.ts` -- CSP middleware (18 tests)
- `swagger-ui-theming.test.ts` -- Swagger UI themes (12 tests)
- `csp-violation-endpoint.test.ts` -- CSP violations (12 tests)
