# Tests Directory

This directory contains all test suites for the CIDR Subnet Calculator project.

## Structure

```
tests/
├── unit/                          # Unit tests
│   └── subnet-utils.test.ts      # Subnet calculation utilities (53 tests)
├── integration/                   # Integration tests
│   └── styles.test.ts            # Styling & design system tests (27 tests)
└── README.md                      # This file
```

## Running Tests

```bash
# Run all tests
npm run test

# Run tests with interactive UI
npm run test:ui

# Run tests in watch mode (default)
npm run test

# Run specific test file
npm run test -- tests/unit/subnet-utils.test.ts
npm run test -- tests/integration/styles.test.ts
```

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

### Integration Tests (`tests/integration/`)

Integration tests verify system-wide features like styling and design system compliance.

**styles.test.ts (25 tests):**
- **CSS Variables**: Verifies all color variables are defined correctly
  - Light mode colors (primary, secondary-accent, destructive, etc.)
  - Dark mode colors (inverted for accessibility)
  
- **Accessibility Compliance**: WCAG contrast ratio validation
  - Primary color on backgrounds meets WCAG AAA (7:1)
  - Foreground text meets WCAG AAA (7:1)
  - Secondary accent meets WCAG AA (4.5:1)
  - Destructive color meets WCAG AA (4.5:1)
  - Muted text meets minimum 3:1 ratio
  - Dark mode maintains accessibility standards

- **Color Palette Consistency**: Verifies enterprise-grade color scheme
  - Primary blue aligns with tech standards
  - Secondary teal properly complements blue
  - Border colors are neutral and subtle
  - Error colors follow standard conventions

- **Tailwind Integration**: Confirms design system is properly exposed
  - Primary color utilities available
  - Secondary accent utilities available
  - Destructive color utilities available
  - Dark mode variants supported

- **Design System Documentation**: Validates design rationale and consistency
  - Color purposes are documented
  - Enterprise-grade characteristics confirmed
  - Header/footer styling consistency verified

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

## Test Configuration

Tests are configured in `vitest.config.ts` at the project root:
- **Test pattern**: `tests/**/*.test.ts`
- **Environment**: Node.js
- **Globals enabled**: `describe`, `it`, `expect` available without imports (optional)

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

**Last Updated**: January 31, 2026
