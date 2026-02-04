# Tests Directory

This directory contains all test suites for the CIDR Subnet Calculator project.

## Test Suite Overview

**Total Tests**: 371 tests across 13 test files  
**Pass Rate**: 100% (371/371 passing)  
**Execution Time**: ~3.5 seconds  
**Test Distribution**: 121 unit tests (33%), 250 integration tests (67%)  
**Overall Grade**: A (Comprehensive tier configuration testing)

## Test Categories

The project uses three types of tests:

1. **Unit Tests** (`tests/unit/`) - Pure function tests, no I/O, no servers
2. **Integration Tests** (`tests/integration/`) - Self-contained tests with their own test servers
3. **E2E Tests** (marked with server checks) - Require full webapp running on port 5000

**Note**: Most integration tests spin up their own test servers on random ports, so they don't require the webapp to be running. Only tests explicitly marked with server availability checks need `npm run dev` running.

## Structure

```
tests/
├── unit/                          # Unit tests (121 total) - No server required
│   ├── subnet-utils.test.ts      # Subnet calculation utilities (53 tests)
│   ├── kubernetes-network-generator.test.ts  # K8s network generation (57 tests)
│   └── emoji-detection.test.ts   # Emoji validation (11 tests)
├── integration/                   # Integration tests (250 total) - Self-contained with test servers
│   ├── api-endpoints.test.ts     # API infrastructure (38 tests) - Starts own server
│   ├── kubernetes-network-api.test.ts  # K8s API (89 tests) - Starts own server
│   ├── rate-limiting.test.ts     # Rate limiting (23 tests) - Starts own server
│   ├── csp-violation-endpoint.test.ts  # CSP violations (12 tests) - Starts own server
│   ├── swagger-ui-csp-middleware.test.ts  # CSP middleware (18 tests) - Starts own server
│   ├── swagger-ui-theming.test.ts  # Swagger themes (12 tests) - WARNING REQUIRES WEBAPP
│   ├── calculator-ui.test.ts     # React components (31 tests) - No server
│   ├── ui-styles.test.ts         # WCAG accessibility (19 tests) - No server
│   └── config.test.ts            # Configuration (8 tests) - No server
├── manual/                        # Manual testing scripts
│   ├── test-api-endpoints.ps1    # PowerShell API validation (5 test cases)
│   └── test-api.ps1              # PowerShell private IP validation (4 test cases)
├── TEST_AUDIT.md                  # Comprehensive test suite analysis and optimization plan
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
npm run test -- tests/integration/ui-styles.test.ts --run

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

**subnet-utils.test.ts (53 tests):**
- IP conversion (ipToNumber, numberToIp)
- Prefix/mask conversion (prefixToMask, maskToPrefix)
- Subnet calculations (calculateSubnet, splitSubnet)
- Network class identification (Class A-E)
- Utility functions (formatNumber, getSubnetClass)
- Error handling and validation
- Edge cases (RFC 3021 /31, /32 networks)

**emoji-detection.test.ts (11 tests):**
- Scans all markdown (.md) files for emoji
- Scans all source files (.ts, .tsx, .js, .jsx) for emoji
- Validates clean text-based documentation
- Excludes meta-files (this test file and fix-emoji.ts)
- Reports exact file location and line number of violations

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

**swagger-ui-theming.test.ts (35 tests)** WARNING:
- HTML structure and theme scripts
- Light/dark mode CSS loading
- Theme persistence in localStorage
- Color scheme validation
- **Note**: Skips gracefully if server not running on port 5000

**Component Tests (No Server)**:

**calculator-ui.test.ts (31 tests)**:
- React component behavior
- Form submission and validation
- Subnet splitting operations
- CSV export functionality

**ui-styles.test.ts (19 tests)**:
- WCAG contrast ratios
- Color palette consistency
- Design system validation

**config.test.ts (8 tests)**:
- Configuration file validation
- CSS variable definitions (light/dark modes)
- WCAG accessibility compliance
- Color palette consistency
- Tailwind integration

**Other integration tests:**
- header.test.ts, footer.test.ts - UI component tests
- config.test.ts - Configuration validation
- rate-limiting.test.ts - Security middleware tests

### Manual Testing Scripts (`tests/manual/`)

PowerShell scripts for manual API validation and testing.

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

**Current Assessment** (February 2, 2026):
- **Grade**: B+ (Some bloat identified)
- **Total Tests**: 338 tests (4,491 lines)
- **Pass Rate**: 100%
- **Identified Issues**:
  - Moderate bloat in swagger-ui-theming.test.ts (35 tests)
  - Some redundant coverage between styling tests
  - Inconsistent server requirement handling (now fixed)

**Key Strengths**:
- [PASS] Comprehensive core logic coverage (121 unit tests)
- [PASS] Security-first testing (72+ security-related tests)
- [PASS] Production-ready infrastructure (44 tests)
- [PASS] Fast execution (~3.5 seconds total)

**Optimization Opportunities**:
- Reduce swagger-ui-theming.test.ts from 35 to ~12 tests
- Move webapp-dependent tests to separate e2e/ category
- Document test strategy more explicitly

See [TEST_AUDIT.md](TEST_AUDIT.md) for complete analysis and recommendations.

### Strengths

1. **Comprehensive Core Logic Coverage** (102 unit tests)
   - Subnet calculations: 100% of functions tested with edge cases
   - Kubernetes generator: All tiers, providers, and security rules covered
   - Mathematical correctness: Bitwise operations validated

2. **Security-First Testing** (72+ security-related tests)
   - RFC 1918 enforcement prevents production security incidents
   - Rate limiting protects against DoS attacks (23 tests)
   - Public IP rejection with security guidance

3. **Production-Ready Infrastructure** (44 tests)
   - Health checks work for Kubernetes probes
   - API versioning supports backward compatibility
   - OpenAPI documentation is functional

4. **Fast Execution** (~3 seconds total)
   - Developers will actually run tests
   - CI/CD integration is practical

### Weaknesses & Improvement Areas

1. **Redundant UI Tests** (56 header/footer tests)
   - 60% overlap with styles.test.ts
   - Testing implementation details (CSS classes), not behavior
   - High maintenance burden for limited value

2. **Fragile Design Tests** (27 styles tests)
   - Hardcoded HSL values break on design changes
   - Don't catch actual visual regressions
   - Manual verification still required

3. **Missing Coverage Areas**
   - **Frontend UI behavior**: No tests for calculator.tsx interactions
   - **React component logic**: No tests for form submission, error states
   - **CSV export**: Only manual testing
   - **Clipboard functionality**: Not tested
   - **Client-side routing**: No navigation tests

4. **Limited Error Scenario Coverage**
   - API endpoint tests only cover 2 error cases
   - Missing network timeout scenarios
   - Missing malformed request bodies

## Improvement Roadmap

### Phase 1 (High Priority - Implement Soon)

#### 1. Consolidate UI Styling Tests
**Goal**: Reduce redundancy and maintenance burden

**Action Items**:
- Merge header.test.ts + footer.test.ts + styles.test.ts -> ui-styles.test.ts
- Reduce from 110 tests to 30-40 tests
- Focus on WCAG compliance, not CSS properties
- Keep only behavioral and accessibility tests

**Expected Impact**:
- Remove: 70 redundant tests
- Reduce maintenance: ~3 hours/month saved
- Same coverage with better focus

#### 2. Add Frontend Component Tests
**Goal**: Test React UI behavior, not just API logic

**Action Items**:
- Create `tests/integration/calculator-ui.test.ts`
- Test form submission and validation errors
- Test subnet split operations and tree expansion
- Test CSV export functionality with actual file generation
- Test copy-to-clipboard with user interactions
- Test loading states and error boundaries

**Expected Impact**:
- Add: ~25 new tests
- Major new coverage area
- Catch UI regressions before production

**Example Test Cases**:
```typescript
describe("Calculator UI", () => {
  it("should calculate subnet when form is submitted", () => { ... });
  it("should show error for invalid CIDR notation", () => { ... });
  it("should split subnet and expand children", () => { ... });
  it("should export selected rows to CSV", () => { ... });
  it("should copy field values to clipboard", () => { ... });
});
```

#### 3. Expand API Error Testing
**Goal**: Better production resilience

**Action Items**:
- Add 10+ error scenarios to api-endpoints.test.ts
- Test malformed JSON, missing required fields, invalid types
- Test timeout scenarios (if applicable)
- Test concurrent request handling
- Test edge cases in query parameters

**Expected Impact**:
- Add: ~10 new tests
- Better error handling validation
- Catch API bugs before production

### Phase 2 (Medium Priority - Next Sprint)

#### 4. Add End-to-End Smoke Tests
**Goal**: Full workflow validation

**Action Items**:
- Create `tests/e2e/smoke.test.ts` using Playwright or Cypress
- Test complete user workflow:
  - Open app -> calculate subnet -> split -> select rows -> export CSV
- Test health check endpoints -> API calls -> response validation
- Run in CI/CD as final gate before deployment

**Expected Impact**:
- Add: ~5 high-value tests
- High confidence for releases
- Catch integration bugs across layers

#### 5. Performance Regression Tests
**Goal**: Prevent performance degradation

**Action Items**:
- Add timing assertions to large subnet splits
- Test 1000+ node subnet trees
- Validate tree size limits are enforced (10,000 node max)
- Test calculation time for various CIDR prefixes

**Expected Impact**:
- Add: ~8 tests
- Performance safety net
- Prevent memory exhaustion bugs

**Example Test Cases**:
```typescript
describe("Performance", () => {
  it("should calculate /24 subnet in under 10ms", () => { ... });
  it("should handle 1000-node tree without memory issues", () => { ... });
  it("should enforce 10,000 node tree limit", () => { ... });
});
```

#### 6. Structured Logging Tests
**Goal**: Validate logging system reliability

**Action Items**:
- Test logger.ts output format (JSON structure)
- Validate log levels work correctly (debug, info, warn, error)
- Test child logger context inheritance
- Test request logging middleware

**Expected Impact**:
- Add: ~12 tests
- Logging reliability for production debugging
- Catch log format regressions

### Phase 3 (Low Priority - Nice to Have)

#### 7. Visual Regression Testing
**Goal**: Replace fragile CSS tests

**Action Items**:
- Evaluate Percy, Chromatic, or Playwright screenshots
- Take screenshots of calculator in various states
- Automate visual diff detection
- Replace 27 hardcoded CSS tests

**Expected Impact**:
- Replace: 27 fragile tests with automated visual diffs
- Catch real visual bugs
- Lower maintenance cost

#### 8. Load Testing
**Goal**: Production stress testing

**Action Items**:
- Test API under sustained load (100+ requests/second)
- Validate rate limiting holds under attack
- Test memory usage with concurrent large subnet trees
- Identify breaking points

**Expected Impact**:
- Production confidence
- Capacity planning data
- DoS attack resilience validation

## Metrics Summary

| Test Category | Tests | Priority | Maintenance | Status |
|---------------|-------|----------|-------------|--------|
| **Subnet Utils** | 53 | Critical | Low | [PASS] Complete |
| **K8s Generator** | 49 | Critical | Low | [PASS] Complete |
| **K8s Network API** | 33 | Critical | Low | [PASS] Complete |
| **Rate Limiting** | 23 | Critical | Low | [PASS] Complete |
| **API Endpoints** | 29 | High | Low | [PASS] Expanded (Phase 1) |
| **Calculator UI** | 31 | High | Low | [PASS] New (Phase 1) |
| **UI Styles** | 19 | Medium | Low | [PASS] Consolidated (Phase 1) |
| **Emoji Detection** | 11 | High | Low | [PASS] Complete |
| **Config** | 8 | Low | Low | [PASS] Complete |

**Phase 1 Results**:
- Removed: 83 redundant UI tests (header, footer, styles fragile CSS tests)
- Added: 50 new tests (31 calculator UI + 8 API error scenarios + 11 accessibility)
- Net change: 256 tests (from 281) with significantly higher value
- All critical and high-priority tests retained and expanded

## Expected Outcomes

### Current State
- **281 tests total**
- 60% maintenance burden from UI tests
- Missing frontend component coverage
- Limited API error scenarios

### After Phase 1 (Target: Q1 2026)
- **236 tests** (-45 from consolidation, +25 from UI components, +10 from API errors)
- 30% less maintenance effort
- Frontend component coverage added
- Better API error handling validation

### After Phase 2 (Target: Q2 2026)
- **259 tests** (+5 E2E, +8 performance, +12 logging)
- Production-ready confidence
- Performance safety net
- Logging reliability validated

## CI/CD Integration

Tests should pass before:
- Committing code
- Creating pull requests
- Deploying to production

Include test verification in development workflow:
```bash
npm run check  # Type checking
npm run test   # Unit tests
npm run build  # Production build
```

---

**Last Updated**: February 2, 2026
