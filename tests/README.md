# Tests Directory

This directory contains all test suites for the CIDR Subnet Calculator project.

## Test Suite Overview

**Total Tests**: 406 tests across 13 test files  
**Pass Rate**: 100% (406/406 passing)  
**Execution Time**: ~4.0 seconds  
**Test Distribution**: 218 unit tests (54%), 188 integration tests (46%)  
**Overall Grade**: A (Comprehensive tier configuration testing with proper test organization)

## Test Categories

The project uses three types of tests:

1. **Unit Tests** (`tests/unit/`) - Pure function tests, no I/O, no servers
2. **Integration Tests** (`tests/integration/`) - Self-contained tests with their own test servers
3. **E2E Tests** (marked with server checks) - Require full webapp running on port 5000

**Note**: Most integration tests spin up their own test servers on random ports, so they don't require the webapp to be running. Only tests explicitly marked with server availability checks need `npm run dev` running.

## Structure

```
tests/
├── unit/                          # Unit tests (218 total) - Pure functions, no I/O
│   ├── subnet-utils.test.ts      # Subnet calculation utilities (67 tests)
│   ├── kubernetes-network-generator.test.ts  # K8s network generation (57 tests)
│   ├── ip-calculation-compliance.test.ts  # IP allocation compliance (56 tests)
│   ├── ui-styles.test.ts         # WCAG accessibility (19 tests)
│   ├── emoji-detection.test.ts   # Emoji validation (11 tests)
│   └── config.test.ts            # Configuration validation (8 tests)
├── integration/                   # Integration tests (188 total) - Self-contained with test servers
│   ├── api-endpoints.test.ts     # API infrastructure (38 tests) - Starts own server
│   ├── calculator-ui.test.ts     # React components (52 tests) - No server
│   ├── kubernetes-network-api.test.ts  # K8s API (33 tests) - Starts own server
│   ├── rate-limiting.test.ts     # Rate limiting (23 tests) - Starts own server
│   ├── swagger-ui-csp-middleware.test.ts  # CSP middleware (18 tests) - Starts own server
│   ├── swagger-ui-theming.test.ts  # Swagger themes (12 tests) - WARNING REQUIRES WEBAPP
│   └── csp-violation-endpoint.test.ts  # CSP violations (12 tests) - Starts own server
├── manual/                        # Manual testing scripts
│   ├── test-api-endpoints.ps1    # PowerShell API validation (5 test cases)
│   ├── test-api.ps1              # PowerShell private IP validation (4 test cases)
│   ├── test-network-comparison.ts  # TypeScript network comparison utility
│   └── test-network-validation.ts  # TypeScript network validation utility
└── README.md                      # This file
```

### Server Requirements

**Self-Contained Tests (Most tests)**:
- Start their own Express servers on random ports
- Do NOT require webapp to be running
- Can run in parallel
- Includes: `api-endpoints.test.ts`, `kubernetes-network-api.test.ts`, `rate-limiting.test.ts`, `csp-violation-endpoint.test.ts`, `swagger-ui-csp-middleware.test.ts`

**Webapp-Dependent Tests** (marked with WARNING):
- Require full webapp running: `npm run dev`
- Check for server availability and skip gracefully if not running
- Currently only `swagger-ui-theming.test.ts`
- These tests will show `[SKIP]` message if server unavailable

## Running Tests

```bash
# Run all tests (most don't need webapp)
npm run test

# Run tests once and exit
npm run test -- --run

# Run tests with interactive UI
npm run test:ui

# Run specific test file
npm run test -- tests/unit/subnet-utils.test.ts --run
npm run test -- tests/unit/ui-styles.test.ts --run

# Run emoji detection tests only
npm run test:emoji

# Check for emoji in codebase (detection only)
npm run emoji:check

# Auto-fix emoji in codebase
npm run emoji:fix
```

### Testing With Webapp Running

For tests that require the full webapp (currently only `swagger-ui-theming.test.ts`):

```bash
# Terminal 1: Start webapp
npm run dev

# Terminal 2: Run all tests (webapp-dependent tests will pass)
npm run test -- --run
```

If webapp is not running, these tests automatically skip with informative messages.

## Test Organization

### Unit Tests (`tests/unit/`)

Unit tests verify individual functions and utilities in isolation.

**subnet-utils.test.ts (67 tests):**
- IP conversion (ipToNumber, numberToIp)
- Prefix/mask conversion (prefixToMask, maskToPrefix)
- Subnet calculations (calculateSubnet, splitSubnet)
- Network class identification (Class A-E)
- Utility functions (formatNumber, getSubnetClass, collectAllSubnets, collectVisibleSubnets)
- Tree collection functions with hideParents logic
- Error handling and validation
- Edge cases (RFC 3021 /31, /32 networks)

**kubernetes-network-generator.test.ts (57 tests):**
- Network plan generation for all deployment tiers
- RFC 1918 private IP enforcement
- Subnet allocation algorithms
- Provider support (EKS, GKE, AKS, Kubernetes)

**ip-calculation-compliance.test.ts (56 tests):**
- IP allocation formulas for pod and node capacity
- Deployment tier compliance testing
- Network sizing validation

**ui-styles.test.ts (19 tests):**
- WCAG accessibility compliance (contrast ratios)
- Color palette consistency across light/dark modes
- Design system validation
- Pure math functions (HSL→RGB conversion, luminance calculations)

**emoji-detection.test.ts (11 tests):**
- Scans all markdown (.md) files for emoji
- Scans all source files (.ts, .tsx, .js, .jsx) for emoji
- Validates clean text-based documentation
- Excludes meta-files (this test file and fix-emoji.ts)
- Reports exact file location and line number of violations

**config.test.ts (8 tests):**
- Tailwind CSS configuration validation
- PostCSS configuration validation
- Vite configuration verification
- Build tool setup testing

### Integration Tests (`tests/integration/`)

Integration tests verify system-wide features and API behavior.

**Self-Contained Integration Tests (Start Own Servers)**:

**api-endpoints.test.ts (38 tests)**:
- Health check endpoints (/health, /health/ready, /health/live)
- API version endpoint
- OpenAPI specification (JSON/YAML)
- Swagger UI presentation
- Error handling consistency

**kubernetes-network-api.test.ts (33 tests)**:
- API endpoint integration
- JSON/YAML output format validation
- RFC 1918 private IP enforcement
- Public IP rejection
- All deployment tiers (micro -> hyperscale)
- Provider support (EKS, GKE, AKS, Kubernetes)

**rate-limiting.test.ts (23 tests)**:
- Rate limiter configuration
- Request throttling behavior
- Header verification (X-RateLimit-*)
- Multiple endpoints protected

**csp-violation-endpoint.test.ts (12 tests)**:
- CSP violation report handling
- W3C spec compliance
- Rate limiting for log flooding prevention
- Schema validation

**swagger-ui-csp-middleware.test.ts (18 tests)**:
- Route-specific CSP headers
- Development vs production mode
- CDN source permissions
- Middleware isolation

**Webapp-Dependent Tests (Require `npm run dev`)**:

**swagger-ui-theming.test.ts (12 tests)** WARNING:
- HTML structure and theme scripts
- Light/dark mode CSS loading
- Theme persistence in localStorage
- Color scheme validation
- **Note**: Skips gracefully if server not running on port 5000

**Component Tests (No Server)**:

**calculator-ui.test.ts (52 tests)**:
- React component behavior
- Form submission and validation
- Subnet splitting operations
- CSV export functionality
- Hide parents feature
- Depth indicator visual hierarchy (15 tests)

### Manual Testing Scripts (`tests/manual/`)

Scripts for manual API validation and testing.

**test-api-endpoints.ps1 (5 test cases):**
- Comprehensive API endpoint validation
- Tests all deployment tiers (micro, standard, professional, enterprise, hyperscale)
- Validates JSON and YAML output formats
- Tests all providers (eks, gke, aks, kubernetes, k8s)
- Colored PowerShell output with error handling

**test-api.ps1 (4 test cases):**
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
   - Integration tests: `tests/integration/` (if needed in future)

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

The project enforces text-only documentation (no emoji) for consistency and portability.

### Check for Emoji

```bash
# Run automated test (part of test suite)
npm run test:emoji

# Check manually with CLI tool
npm run emoji:check
```

### Auto-Fix Emoji

The `scripts/fix-emoji.ts` tool can automatically replace emoji with text alternatives:

```bash
# Fix all emoji automatically
npm run emoji:fix

# Or use directly with options
npx tsx scripts/fix-emoji.ts --fix --verbose
```

### Common Replacements

| Emoji | Text Alternative |
|-------|------------------|
| Checkmark | [PASS] |
| Cross mark | [FAIL] |
| Warning | WARNING |
| Light bulb | [TIP] |
| Pin | [PINNED] |
| Key | [KEY] |
| Star | [FEATURED] |

See [.github/EMOJI_PREVENTION.md](../.github/EMOJI_PREVENTION.md) for complete documentation.

## Test Configuration

Tests are configured in `vitest.config.ts` at the project root:
- **Test pattern**: `tests/**/*.test.ts`
- **Environment**: Node.js
- **Globals enabled**: `describe`, `it`, `expect` available without imports (optional)

## Test Quality & Audit

**For detailed analysis of test suite health, see [TEST_AUDIT.md](../docs/TEST_AUDIT.md)**

**Current Assessment** (February 14, 2026):
- **Grade**: A (Comprehensive coverage with proper organization)
- **Total Tests**: 406 (218 unit + 188 integration)
- **Pass Rate**: 100% (406/406)
- **Execution Time**: ~3.5 seconds
- **Test Files**: 13 (6 unit, 7 integration)

**Key Strengths**:
- [PASS] Comprehensive core logic coverage (218 unit tests)
- [PASS] Security-first testing (72+ security-related tests)
- [PASS] Production-ready infrastructure (71 API tests)
- [PASS] Fast execution (~3.5 seconds total)
- [PASS] Proper unit/integration separation
- [PASS] WCAG accessibility compliance validated

See [TEST_AUDIT.md](../docs/TEST_AUDIT.md) for complete analysis and recommendations.

### Strengths

1. **Comprehensive Core Logic Coverage** (218 unit tests)
   - Subnet calculations: 100% of functions tested with edge cases
   - Kubernetes generator: All tiers, providers, and security rules covered
   - IP calculation compliance: All deployment tier formulas validated
   - Mathematical correctness: Bitwise operations validated

2. **Security-First Testing** (72+ security-related tests)
   - RFC 1918 enforcement prevents production security incidents
   - Rate limiting protects against DoS attacks (23 tests)
   - CSP middleware validation (18 tests)
   - CSP violation endpoint compliance (12 tests)
   - Public IP rejection with security guidance

3. **Production-Ready Infrastructure** (71 API tests)
   - Health checks work for Kubernetes probes
   - API versioning supports backward compatibility
   - OpenAPI documentation is functional
   - K8s network planning API fully tested

4. **Frontend Component Tests** (52 tests)
   - Calculator UI behavior (form submission, validation)
   - Subnet splitting operations and tree expansion
   - CSV export functionality
   - Hide parents feature
   - Depth indicator visual hierarchy

5. **Fast Execution** (~3.5 seconds total)
   - Developers will actually run tests
   - CI/CD integration is practical

## CI/CD Integration

Tests should pass before:
- Committing code
- Creating pull requests
- Deploying to production

Include test verification in development workflow:
```bash
npm audit                  # Security audit (0 vulnerabilities required)
npm run check              # Type checking
npm run test -- --run      # Full test suite (406 tests)
npm run build              # Production build
```

---

**Last Updated**: February 14, 2026
