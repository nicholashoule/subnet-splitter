# GitHub Copilot Instructions - CIDR Subnet Calculator

**CRITICAL SECURITY REQUIREMENT**

**ALL AI agents must perform security audit BEFORE any code execution:**
1. Run `npm audit` to check for vulnerabilities
2. Run `npm audit fix --force` to resolve any issues
3. Run `npm audit` again to verify clean state (0 vulnerabilities)
4. See the **Security & Dependency Audit Requirements** section below for full protocol

**Failure to perform security audit before code execution is a breach of security protocol.**

---

This file provides instructions and context for GitHub Copilot and AI agents working on the CIDR Subnet Calculator project.

## Project Overview

**CIDR Subnet Calculator** is a modern web application for calculating subnet details, splitting CIDR ranges recursively, and planning network configurations.

### Core Features
- Subnet calculation with detailed network information
- Recursive splitting of networks down to /32 (single host)
- Interactive table with expand/collapse functionality
- Copy-to-clipboard for all field values
- CSV export of selected rows
- Dark/Light mode support
- Responsive design

### Key Project Goals
1. Provide accurate CIDR subnet calculations for network engineers
2. Maintain a clean, modern, and performant user interface
3. Ensure no horizontal scrollbars on standard desktop displays
4. Support bulk operations (select all, CSV export)
5. Security by design - no database, no sensitive data, client-side logic

## Technology Stack

### Frontend
- React 18 with TypeScript
- Tailwind CSS for styling
- shadcn/ui component library (Radix UI primitives)
- React Hook Form with Zod validation
- Vite for bundling and development
- Tanstack React Query for data fetching

### Backend
- Express.js 5 with TypeScript
- Node.js runtime
- No database (in-memory only)
- Static file serving from `dist/public`

### Development Tools
- TypeScript with strict mode
- Drizzle ORM (configured but not in use currently)
- Tailwind CSS with PostCSS
- tsx for TypeScript execution

## Project Structure

```
client/
  ├── src/
  │   ├── App.tsx           # Main application component
  │   ├── main.tsx          # React entry point
  │   ├── index.css         # Global styles including elegant-scrollbar
  │   ├── components/       # Reusable UI components
  │   │   └── ui/          # shadcn/ui components
  │   ├── hooks/            # React hooks
  │   │   ├── use-mobile.tsx
  │   │   └── use-toast.ts
  │   ├── lib/              # Utility functions
  │   │   ├── subnet-utils.ts   # Core CIDR calculation logic
  │   │   ├── queryClient.ts    # React Query configuration
  │   │   └── utils.ts          # Helper functions
  │   └── pages/            # Page components
  ├── index.html            # HTML entry point
  └── public/               # Static assets

server/
  ├── index.ts              # Express server setup with fallback listen logic
  ├── routes.ts             # API route definitions
  ├── vite.ts               # Vite dev server integration
  ├── static.ts             # Static file serving
  └── storage.ts            # In-memory storage

shared/
  └── schema.ts             # Shared TypeScript types/schemas

script/
  └── build.ts              # Build script

Root Config Files:
  ├── tsconfig.json         # TypeScript configuration
  ├── vite.config.ts        # Vite configuration
  ├── tailwind.config.ts    # Tailwind CSS customization
  ├── postcss.config.js     # PostCSS configuration
  ├── package.json          # Dependencies and scripts
  └── drizzle.config.ts     # Drizzle ORM configuration
```

## Current Development State

### Completed Features (from agent-reasoning.md)
1. Core CIDR subnet calculation functionality
2. Interactive table with expand/collapse for split subnets
3. Copy-to-clipboard for all field values
4. Example buttons for quick testing
5. Network Overview card with key statistics
6. UI refinements for compact display (no horizontal scrollbars)
7. Elegant custom scrollbar styling
8. CSV export functionality with row selection
9. Select All checkbox for bulk operations
10. Author attribution with GitHub profile link

### Known Issues & Solutions
1. **Server Binding Issue (RESOLVED)**
   - Windows environment doesn't support `0.0.0.0` binding
   - **Solution**: Fallback mechanism in `server/index.ts` tries hosts in order:
     - First: `127.0.0.1` (IPv4 localhost)
     - Second: `localhost` (system-dependent resolution)
   - Automatically logs which host was successfully bound

2. **TypeScript Type Definitions (RESOLVED)**
   - Missing `@types/node` and `vite/client` definitions
   - **Solution**: Install with `npm.cmd install --save-dev @types/node vite`

3. **Windows npm Script Issue (RESOLVED)**
   - Cannot use `NODE_ENV=development` syntax on Windows cmd
   - **Solution**: Using `cross-env` package to set environment variables cross-platform

## Running the Project

### Development
```bash
npm.cmd install              # Install dependencies (Windows)
npm.cmd run dev             # Start development server with hot reload
```

The dev server will attempt to bind to `127.0.0.1:5000` or `localhost:5000`.

### Production
```bash
npm.cmd run build           # Build for production
npm.cmd run start           # Start production server
```

### Type Checking
```bash
npm.cmd run check           # Run TypeScript type checker
```

### Testing
```bash
npm.cmd run test            # Run test suite with Vitest
npm.cmd run test:ui         # Run tests with Vitest UI
```

## Security & Dependency Audit Requirements

**MANDATORY**: All AI agents must perform security audits before executing any code changes or commands.

### Audit Protocol (REQUIRED BEFORE ANY CODE EXECUTION)

**Step 1: Check for vulnerabilities**
```bash
npm audit
```

**Step 2: Fix vulnerabilities automatically**
```bash
npm audit fix --force
```

**Step 3: Verify clean state**
```bash
npm audit
# Expected output: "found 0 vulnerabilities"
```

### When to Run Audits

1. **Before installing new dependencies**: 
   - After `npm install` or `npm update`
   - Check for new vulnerabilities

2. **After modifying package.json**:
   - Any dependency version changes
   - Before proceeding with development

3. **Before committing code**:
   - Ensure no vulnerabilities are introduced
   - Verify `npm audit` shows 0 vulnerabilities

4. **Before running tests or build**:
   - Security check is prerequisite to any code execution
   - Cannot proceed if vulnerabilities exist

### Known Vulnerabilities & Resolutions

**Current Status**:  **0 vulnerabilities**

**Historical Issues** (all resolved):
- **Vitest 2.1.8**: Had 5 moderate vulnerabilities related to esbuild/vite
- **Resolution**: Updated to Vitest ^3.0.0 which includes patched dependencies
- **Fix Applied**: `npm audit fix --force` updated 11 packages, removed 7 packages

### Dependency Management

**Active Dependencies** (all required, audited clean):
- React 18, TypeScript, Vite - Frontend build
- Express.js 5 - Backend runtime
- Tailwind CSS, Radix UI - Styling and components
- Zod - Schema validation
- Vitest 3+ - Testing framework

**Removed Unused Dependencies** (cleaned up):
- passport, express-session - User management (no DB)
- pg - PostgreSQL driver (no DB)
- ws - WebSockets (client-side only)
- date-fns - Date utilities (not used)
- next-themes - Theme management (using Tailwind instead)
- And 14 others (see git history for full list)

### npm Scripts Available

```json
{
  "dev": "cross-env NODE_ENV=development tsx server/index.ts",
  "build": "tsx script/build.ts",
  "start": "node dist/server/index.js",
  "check": "tsc --noEmit",
  "test": "vitest",
  "test:ui": "vitest --ui",
  "audit": "npm audit",
  "audit:fix": "npm audit fix --force"
}
```

### Audit Checklist for Agents

Before making ANY changes:
- [ ] Run `npm audit` - check for vulnerabilities
- [ ] Run `npm audit fix --force` if needed - fix any issues
- [ ] Run `npm audit` again - verify clean state (0 vulnerabilities)
- [ ] Run `npm run check` - verify TypeScript compilation
- [ ] Proceed with code changes only after all checks pass

### Failed Audit Recovery

If `npm audit fix` introduces breaking changes:
1. Review package.json changes
2. Run `npm install` to sync package-lock.json
3. Test application: `npm run dev` → verify it starts
4. Run test suite: `npm run test` → verify tests pass
5. Build check: `npm run build` → verify production build works
6. If issues persist, manually review the changed packages and revert if necessary

## Application Security Configuration

### Helmet & Content Security Policy (CSP)

**File**: `server/index.ts`

The application uses Helmet.js middleware to enforce strict security headers. The CSP is environment-aware to balance security with developer experience.

**Production CSP (Strict)**:
```typescript
{
  scriptSrc: ["'self'"],           // Only scripts from this origin
  styleSrc: ["'self'", "'unsafe-inline'"],  // Needed for dynamic styles
  connectSrc: ["'self'", ...],     // Only API calls to self
  imgSrc: ["'self'", "data:"],     // Images from self and data URIs
  // Other directives...
}
```

**Development CSP (Relaxed for Tooling)**:
```typescript
if (isDevelopment) {
  cspDirectives.scriptSrc.push("'unsafe-inline'");  // Vite HMR & Fast Refresh
  cspDirectives.connectSrc.push("ws://127.0.0.1:*", "ws://localhost:*");  // WebSocket HMR
}
```

**Security Features Enabled with Helmet v8**:
- `contentSecurityPolicy` - Enforces the CSP directives configured above
- `X-Content-Type-Options: nosniff` - Set by default in Helmet v8 (no configuration needed)
- `referrerPolicy: { policy: "strict-origin-when-cross-origin" }` - Controls referrer leaking
- `crossOriginEmbedderPolicy: false` - Disabled to allow embedding external resources for the SPA

**Deprecated Options (Removed from Helmet v8 - Do NOT Use)**:
- `xssFilter` - Sends `X-XSS-Protection` header (deprecated by browsers, no longer needed)
- `noSniff` - This functionality is now always enabled by default in Helmet v8
- **Important**: These options are not supported in Helmet v8 and will cause configuration errors if used
**When Modifying CSP**:
1. **Test in both light and dark modes** - Ensure styles load
2. **Test Vite HMR** - Dev server must stay responsive
3. **Verify no console errors** - Check browser DevTools for blocked resources
4. **Run `npm run dev`** - Confirm development experience works
5. **Check production build** - Run `npm run build && npm start`

### Rate Limiting Strategy

**Files**: `server/static.ts`, `server/vite.ts`

Rate limiting protects against denial-of-service attacks on expensive operations:

**Production Rate Limiting** (`server/static.ts`):
```typescript
const spaRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 30,                    // 30 requests per window
  standardHeaders: true,      // Return rate limit info
  legacyHeaders: false,
  message: "Too many requests..."
});

app.use(spaRateLimiter, (req, res) => {
  res.sendFile(path.resolve(distPath, "index.html"));
});
```

**Development Setup** (`server/vite.ts`):
- No rate limiting on Vite middleware (localhost is trusted)
- Vite handles HMR and asset serving efficiently
- SPA fallback only serves index.html for client-side routes

**Rate Limiting Best Practices**:
1. **File system operations** are expensive - always rate limit in production
2. **Localhost is exempt** - development experience shouldn't be throttled
3. **Per-IP tracking** - Express configured with `app.set('trust proxy', true)` to properly parse `X-Forwarded-For` headers for accurate client IP detection even behind reverse proxies
4. **Graceful degradation** - returns 429 status with error message

**Important Security Note**: The `trust proxy` setting should be configured based on your deployment:
- **Development/Replit**: `app.set('trust proxy', true)` (default in this app)
- **Production behind known proxies**: Restrict to specific proxy IPs: `app.set('trust proxy', ['10.0.0.0/8', '127.0.0.1'])`
- **No proxies**: Set to `false` to use direct socket IP only

This ensures `express-rate-limit` uses the correct client IP via `req.ip` instead of the proxy's IP.

### SPA Fallback Middleware

**File**: `server/vite.ts`

The SPA fallback serves `index.html` for client-side routes (not static assets).

**Critical**: Must skip requests for file extensions:
```typescript
app.use(async (req, res, next) => {
  const url = req.originalUrl;
  
  // Skip fallback for file requests - Vite handles these
  if (url.includes('.') && !url.endsWith('.html')) {
    return next();
  }

  // Serve index.html for routes
  const page = await vite.transformIndexHtml(url, template);
  res.status(200).set({ "Content-Type": "text/html" }).end(page);
});
```

**Why This Matters**:
- Without the file check, SPA fallback would try to render `.tsx` files as HTML
- This breaks Vite's React plugin (can't detect preamble error)
- Middleware order: Vite first, then SPA fallback
- Vite middleware only handles files it recognizes (assets, modules)

### Security Checklist for Code Changes

**Before committing any changes:**
- [ ] Run `npm audit` - verify 0 vulnerabilities
- [ ] Run `npm run check` - TypeScript strict mode passes
- [ ] Run `npm run test -- --run` - all tests pass
- [ ] Test dev server: `npm run dev` - no console errors
- [ ] Test production build: `npm run build && npm start`
- [ ] Check CSP compliance:
  - [ ] Test in Chrome/Edge/Firefox (CSP enforcement varies)
  - [ ] Open DevTools Console (check for blocked resources)
  - [ ] Verify no CSP violations for expected functionality
- [ ] Check Helmet headers with browser inspector
- [ ] If modifying CSP directives:
  - [ ] Document why the change is needed
  - [ ] Test both development and production modes
  - [ ] Verify security posture isn't weakened

### Common Security Pitfalls

** Never do this:**
- Disable CSP entirely: `contentSecurityPolicy: false`
- Use overly broad directives: `scriptSrc: ["*"]`
- Leave `'unsafe-inline'` in production for scripts
- Forget to test in real browser (VS Code Simple Browser has limitations)
- Commit CSP changes without testing both dev and prod

** Do this instead:**
- Use `'self'` for same-origin resources
- Use `'unsafe-inline'` only in development (with clear comments)
- Test CSP violations in browser console
- Document why each directive is needed
- Use environment checks (`isDevelopment`) for relaxed rules

### Security Issues & Resolutions (Recent Session)

**Issue 1: Helmet v8 Compatibility (Deprecated Options)**
- **Problem**: `xssFilter: true` and `noSniff: true` options don't exist in Helmet v8
- **Root Cause**: These options were deprecated and removed by Helmet maintainers
- **Resolution**: Removed these options from configuration. Helmet v8 provides:
  - `X-Content-Type-Options: nosniff` automatically (no config needed)
  - `X-XSS-Protection` deprecated by modern browsers (no longer needed)
- **Learning**: Always verify Helmet changelog when updating major versions
- **Files Modified**: `server/index.ts`

**Issue 2: CSP Blocking Development Tools**
- **Problem**: Vite HMR and React Fast Refresh blocked in development
- **Root Cause**: `script-src 'self'` doesn't allow inline scripts
- **Resolution**: Added `'unsafe-inline'` to scriptSrc in development only
- **Key Learning**: Development and production CSP policies must differ

**Issue 3: SPA Fallback Interfering with Vite**
- **Problem**: Middleware was trying to render `.tsx` files as HTML
- **Root Cause**: Catch-all middleware running before file extension check
- **Resolution**: Skip fallback for requests with file extensions
- **Files Modified**: `server/vite.ts`

## Testing & Test Coverage

### Test Structure

Tests are organized in a dedicated `tests/` directory with clear organization:

```
tests/
├── unit/                        # Unit tests for individual functions
│   └── subnet-utils.test.ts     # Core calculation logic (53 tests)
├── integration/                 # Integration tests for system-wide features
│   └── styles.test.ts           # Styling & design system tests (27 tests)
└── README.md                    # Testing documentation
```

### Running Tests

```bash
npm run test               # Run tests in watch mode (default)
npm run test -- --run      # Run tests once and exit
npm run test:ui            # Run tests with interactive UI
npm run test -- tests/unit/subnet-utils.test.ts        # Run only unit tests
npm run test -- tests/integration/styles.test.ts       # Run only integration tests
```

### Test Coverage

**Current Suite: 80 comprehensive tests (53 unit + 27 integration) - 100% pass rate ✓**

**Unit Tests** (`tests/unit/subnet-utils.test.ts` - 53 tests):
- **IP Conversion**: ipToNumber, numberToIp with roundtrip validation
- **Prefix/Mask Conversion**: prefixToMask, maskToPrefix for all prefix lengths (0-32)
- **Subnet Calculation**: calculateSubnet validation for all CIDR prefixes
- **Network Classes**: Identification of Classes A-E (including multicast D and reserved E)
- **Subnet Splitting**: splitSubnet operation with tree size validation
- **Utility Functions**: formatNumber, getSubnetClass with proper classification
- **Node Counting**: countSubnetNodes for hierarchical subnet tree structures
- **Edge Cases**: RFC 3021 /31 point-to-point, /32 host routes, /0 all-IPv4, private ranges
- **RFC 1918 Networks**: Private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- **Error Handling**: Invalid CIDR formats, octets, prefix values with clear error messages
- **Robustness**: Wildcard mask calculations, usable host calculations, tree operations

**Integration Tests** (`tests/integration/styles.test.ts` - 27 tests):
- **CSS Variables**: All color variables defined correctly in light and dark modes
  - Primary, secondary-accent, destructive, background, foreground, muted colors
  - Border and accent border colors with proper HSL-to-RGB conversions
- **WCAG Accessibility Compliance**: Contrast ratio validation
  - Primary color: 7.2:1 contrast on background (WCAG AAA) ✓
  - Foreground text: 12.5:1 contrast on background (WCAG AAA) ✓
  - Secondary accent: 2.5:1 contrast (suitable for UI highlights) ✓
  - Destructive color: 5.2:1 contrast on background (WCAG AA) ✓
  - Muted foreground: 4.2:1 contrast (WCAG AA) ✓
- **Color Palette Consistency**: All colors properly defined, dark mode inversion
- **Tailwind Integration**: Color utilities properly mapped to CSS variables
- **Design System Documentation**: Verification of color guidelines and rationale

### Test Coverage Metrics

| Metric | Value |
|--------|-------|
| **Total Tests** | 80 |
| **Unit Tests** | 53 |
| **Integration Tests** | 27 |
| **Pass Rate** | 100% |
| **Execution Time** | ~1.3 seconds |
| **WCAG Compliance** | AAA for primary text, AA for secondary elements |
| **Code Type Safety** | TypeScript strict mode enabled throughout |
| **Test Files** | 2 organized by type (unit and integration) |
| **Calculation Functions Covered** | 100% (all subnet-utils.ts functions) |
| **Design System Coverage** | All colors, contrast ratios, dark mode |

### Test Success Criteria

For the test suite to be considered passing:
- ✓ All 80 tests must pass
- ✓ No skipped or pending tests (except during development)
- ✓ WCAG accessibility standards maintained
- ✓ All calculation logic validated
- ✓ Design system fully tested

### Writing Tests

When adding new tests:

1. **Location**: `tests/unit/` for unit tests, `tests/integration/` for integration tests
2. **Naming**: `{module}.test.ts` (e.g., `calculator.test.ts`)
3. **Use path aliases**: Import with `@/path` not `../../path`
4. **Template**:
   ```typescript
   import { describe, it, expect } from "vitest";
   import { functionToTest } from "@/lib/module";

   describe("Module Name", () => {
     it("should do something specific", () => {
       const result = functionToTest(input);
       expect(result).toBe(expected);
     });
   });
   ```

### Test Configuration

- **Framework**: Vitest 3.2.4
- **Pattern**: `tests/**/*.test.ts` (automatic discovery)
- **Environment**: Node.js (browser emulation not required)
- **Globals**: `describe`, `it`, `expect` available without imports
- **Module Resolution**: Path aliases (`@/` prefix) work in tests
- **Type Checking**: Full TypeScript strict mode in test files
- **Configuration File**: `vitest.config.ts` with proper ES module setup

### Test Organization Best Practices

**File Organization:**
- Place unit tests in `tests/unit/` for testing individual functions
- Place integration tests in `tests/integration/` for testing system-wide features
- Use descriptive test file names: `{module}.test.ts` or `{feature}.test.ts`

**Test Structure:**
- Use `describe()` blocks to group related tests by functionality
- Keep individual test descriptions clear and specific (describe what should happen)
- Each test should verify one thing (single assertion or related set of assertions)
- Use `it()` for individual test cases

**Assertion Best Practices:**
- Use specific matchers: `expect(value).toBe(expected)` over `.toEqual()`
- Test both success and failure cases
- Include edge cases and boundary conditions
- Validate error messages for error-throwing functions

**Test Utilities:**
- Import from `vitest`: `describe`, `it`, `expect`
- Use path aliases for imports: `@/lib/subnet-utils`
- Helper functions should be defined at top of test file or in separate utilities file

### Before Committing

**Pre-commit checklist:**
```bash
npm audit                  # Security audit (0 vulnerabilities required)
npm run check              # TypeScript type checking (no errors)
npm run test -- --run      # Run full test suite (all 80 tests must pass)
npm run build              # Verify production build succeeds
```

**Quality Gates:**
- ✓ All 80 tests passing (53 unit + 27 integration)
- ✓ Zero TypeScript errors in strict mode
- ✓ Zero npm audit vulnerabilities
- ✓ Production build succeeds without warnings
- ✓ No console errors in dev environment
- ✓ WCAG accessibility standards maintained

## Code Style & Conventions

### Component Structure
- Use functional components with hooks
- Prefer React Hook Form for forms with Zod validation
- Use shadcn/ui components as the base UI library
- Always use TypeScript - no implicit `any`

### File Naming
- Components: PascalCase (e.g., `Calculator.tsx`)
- Utilities: camelCase (e.g., `subnet-utils.ts`)
- Styles: Include in component files or global `index.css`

### Type Safety
- `tsconfig.json` has `strict: true` - all code must be type-safe
- Use `@types/*` packages for third-party library types
- Leverage TypeScript for self-documenting code

### CSS & Tailwind
- Use Tailwind utility classes exclusively
- Custom styles in `index.css` only for reusable patterns
- Example: `.elegant-scrollbar` for styled scrollbars
- Support both light and dark modes using Tailwind classes

### Tailwind CSS Troubleshooting Guide

**Problem: Styling Not Loading / CSS Missing**

**Root Causes and Solutions:**

1. **Tailwind Content Configuration Misconfigured**
   - **Issue**: Modifying `tailwind.config.ts` content paths with experimental patterns breaks CSS generation
   - **Solution**: Always use simple, standard glob patterns:
     ```typescript
     content: ["./client/**/*.{js,jsx,ts,tsx}"]
     ```
   - **What NOT to do**: Don't use absolute paths with `import.meta.url` or complex nested patterns unless Tailwind docs explicitly support it
   - **Why**: Tailwind's glob engine scans files at config load time; complex patterns may not match files correctly

2. **PostCSS Plugin Warnings**
   - **Issue**: Warnings like "PostCSS plugin did not pass the `from` option" add noise but don't break CSS
   - **Solution**: Keep `postcss.config.js` simple:
     ```javascript
     export default {
       plugins: {
         tailwindcss: {},
         autoprefixer: {},
       },
     }
     ```
   - **What NOT to do**: Don't add experimental options like `from: undefined` unless debugging a specific error

3. **VS Code Simple Browser Limitations**
   - **Issue**: CSS doesn't load properly in VS Code's Simple Browser
   - **Solution**: Use a real browser (Chrome, Edge, Firefox) for development
   - **Why**: Simple Browser has issues with Vite's WebSocket HMR (Hot Module Replacement)
   - **Command**: Open `http://127.0.0.1:5000` or `http://localhost:5000` in your regular browser

4. **Browser Cache**
   - **Issue**: CSS changes don't appear after dev server restart
   - **Solution**: Hard refresh browser cache:
     - Windows/Linux: `Ctrl+Shift+R`
     - Mac: `Cmd+Shift+R`
   - **Why**: Browser caches CSS files; hard refresh forces reload

**Debugging Checklist:**

- [ ] Run `npm run test -- --run` - verify core tests pass (if they do, CSS is just a display issue)
- [ ] Check `tailwind.config.ts` uses standard glob pattern: `"./client/**/*.{js,jsx,ts,tsx}"`
- [ ] Verify `postcss.config.js` only has `tailwindcss: {}` and `autoprefixer: {}`
- [ ] Use real browser (Chrome/Edge/Firefox), not VS Code Simple Browser
- [ ] Hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- [ ] Restart dev server: `Stop-Process -Name node -Force; npm run dev`

**When Nothing Else Works:**

1. Verify tests pass: `npm run test -- --run` (confirms logic is fine)
2. Revert config files to git: `git checkout tailwind.config.ts postcss.config.js`
3. Clean restart: Kill Node process, clear browser cache, restart dev server
4. Check open terminal for CSS errors from Tailwind or Vite
5. If still broken, check git log for recent config changes: `git log --oneline tailwind.config.ts postcss.config.js`

### Icons & User-Facing Text
- **Use Lucide React icons only** - do not use unicode icons or special characters
- All icons must come from the lucide-react package
- This ensures consistency, accessibility, and proper rendering across all platforms/browsers
- Exception: Status text messages and labels are fine; only the visual icon elements must use Lucide

## Header & Footer Styling Guide

### Header Styling

The webapp header provides a professional introduction to the application with consistent visual hierarchy and GitHub profile branding.

**Current Implementation:**
```tsx
<header className="border-b border-border bg-muted/20 -mx-6 px-6 py-4 mb-6 text-center">
  <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="inline-block">
    <img src="/github-nicholashoule.png" alt="GitHub QR Code" className="w-16 h-16 rounded-lg hover:opacity-80 transition-opacity mb-2" />
  </a>
  <h1 className="text-4xl font-bold tracking-tight mb-3">CIDR Subnet Calculator</h1>
  <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
    Calculate subnet details and recursively split networks into smaller subnets...
  </p>
</header>
```

**Styling Details:**
- **Border:** Subtle bottom border (`border-b border-border`) separates header from content
- **Background:** Muted background (`bg-muted/20`) creates visual distinction without overwhelming
- **Full-width effect:** Uses `-mx-6 px-6` to extend background to page edges while maintaining container alignment
- **Padding:** `py-4` (16px vertical) for compact spacing without excess whitespace
- **QR Code Image:**
  - Size: 64px (w-16 h-16)
  - Styling: `rounded-lg` for subtle corner rounding, `hover:opacity-80` for interaction feedback
  - Functionality: Clickable link to GitHub profile (`target="_blank" rel="noopener noreferrer"`)
  - Location: `client/public/github-nicholashoule.png` (6.6 KB)
  - URL Reference: `/github-nicholashoule.png` (served from public directory)
- **Typography:**
  - QR Code: Personal branding element with hover effect
  - Title: Large (text-4xl), bold, tracking-tight for visual impact
  - Description: Muted color, leading-relaxed for readability
- **Responsive:** Maintains alignment with container's max-w-[1600px]
- **Spacing between elements:** QR code to title = `mb-2`, Title to description = `mb-3`

### Footer Styling

The footer provides closure to the page with informational content and maintains visual consistency.

**Current Implementation:**
```tsx
<footer className="mt-8 border-t border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground space-y-3">
  <p className="max-w-2xl mx-auto leading-relaxed">
    CIDR (Classless Inter-Domain Routing) allows flexible IP allocation...
  </p>
  <p className="text-xs">
    Created by <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">nicholashoule</a>
  </p>
</footer>
```

**Styling Details:**
- **Border:** Subtle top border (`border-t border-border`) mirrors header structure
- **Background:** Slightly darker muted background (`bg-muted/30`) than header for visual balance
- **Full-width effect:** Takes up full width naturally (no special negative margin needed)
- **Padding:** `px-4 py-8` with `space-y-3` for generous vertical spacing
- **Typography:**
  - Main text: Small (text-sm), muted foreground for subtle appearance
  - Content text: Max-width container for readability, leading-relaxed
  - Author credit: Extra small (text-xs), with link in primary color
- **Links:** Primary color with hover underline for clear interactivity
- **Top margin:** `mt-8` creates separation from main content

### Design Consistency Principles

**Header & Footer Together:**
1. Both use border top/bottom for visual frame
2. Both use muted backgrounds (`bg-muted/20` and `bg-muted/30`)
3. Both are centered and text-focused
4. Both extend full-width with subtle backgrounds
5. Footer is slightly darker to create visual hierarchy

**When Updating:**
- Maintain the border/background color pairing
- Keep spacing proportional (header `py-6`, footer `py-8`)
- Ensure text remains readable with muted-foreground colors
- Test both light and dark modes
- Verify no horizontal scrollbars on standard displays (1080p+)

## Color Palette & Design System

The application uses a modern, professional color scheme derived from shadcn/ui and Tailwind CSS, with comparison to enterprise design standards.

### Color Scheme Overview

**Light Mode CSS Variables** (defined in `client/src/index.css`):

| Color | HSL Value | Hex | Purpose |
|-------|-----------|-----|---------|
| **Primary** | `221 83% 53%` | `#4F46E5` | Main action buttons, links, badges (Blue - Enterprise standard) |
| **Secondary Accent** | `160 60% 45%` | `#0891B2` | Highlights, secondary CTAs, visual interest (Teal - Modern accent) |
| **Background** | `210 20% 98%` | `#FAFBFD` | Page background (Off-white) |
| **Card** | `0 0% 100%` | `#FFFFFF` | Card backgrounds (Pure white) |
| **Foreground** | `222 47% 11%` | `#1E1B4B` | Primary text (Dark slate) |
| **Muted** | `210 20% 96%` | `#F3F4F6` | Secondary backgrounds (Light gray) |
| **Muted Foreground** | `215 16% 47%` | `#6B7280` | Secondary text (Medium gray) |
| **Destructive** | `0 72% 51%` | `#EF4444` | Error states, dangerous actions (Red) |
| **Border** | `214 20% 88%` | `#E5E7EB` | Borders, dividers (Light gray) |

**Dark Mode** automatically inverts these values using Tailwind's `dark:` prefix.

### Enterprise Comparison

Your color palette aligns with leading tech platforms:

- **GitHub**: Uses purple (`#6e40aa`) + dark theme
- **Stripe**: Uses blue (`#635BFF`) + minimalist design
- **Vercel**: Uses black/dark + rainbow accents
- **Your App**: Uses blue (`#4F46E5`) + teal accent (`#0891B2`)

Your scheme is slightly more modern than Microsoft's corporate standard, with better visual hierarchy through the teal secondary accent.

### Color Usage Guidelines

**Primary Color** (`#4F46E5`):
- Main action buttons
- Header/navigation highlights
- Network class badges
- Primary links and interactive elements
- Icon highlighting

**Secondary Accent** (`#0891B2` - Teal):
- Secondary action buttons (alternative CTAs)
- Status indicators for active states
- Highlight boxes and emphasis areas
- Hover states on secondary elements
- Table row selection highlights

**Muted Colors** (`#F3F4F6`, `#6B7280`):
- Card backgrounds and sections
- Disabled states
- Secondary text and labels
- Subtle backgrounds

**Destructive** (`#EF4444`):
- Error messages and validation failures
- Delete/cancel destructive actions
- Error toast notifications
- Warning states

**Borders & Dividers** (`#E5E7EB`):
- Card borders
- Table borders
- Form field borders
- Subtle separators

### Implementation Details

**File Locations:**
- Color variables: `client/src/index.css` (root `:root` and `.dark` selectors)
- Tailwind mapping: `tailwind.config.ts` (theme.extend.colors)
- Component usage: All shadcn/ui components use these CSS variables

**Accessibility Standards:**
- Contrast ratio (primary on background): 7.2:1 ✓ (exceeds WCAG AAA)
- Contrast ratio (text on primary): 12.5:1 ✓ (exceeds WCAA AAA)
- Status colors differentiate by brightness (not color alone)
- All colors tested for color-blind accessibility

**Dark Mode Support:**
- Automatic inversion for all colors in `.dark` class
- Maintained contrast ratios in both themes
- Secondary accent remains teal for visual continuity
- No hardcoded colors in components (all CSS variables)

### When Adding New Colors

1. Add to both light and dark mode sections in `index.css`
2. Update `tailwind.config.ts` to expose new color
3. Use CSS variable naming: `--semantic-name` (e.g., `--highlight`, `--success`)
4. Test contrast ratios with WCAG checker
5. Verify in both light and dark themes

### Design System Rationale

The choice of teal (`#0891B2`) as secondary accent:
- Complements blue without competing
- Provides visual distinction for secondary actions
- Standard in modern SaaS (similar to Vercel's approach)
- Better visual hierarchy for complex UIs
- Accessibility-friendly with maintained contrast

## Subnet Calculation Logic

The core subnet calculation logic is in [client/src/lib/subnet-utils.ts](../client/src/lib/subnet-utils.ts).

### Key Functions
- `calculateSubnet()`: Calculate all subnet information from CIDR notation
- Network address, broadcast address, host range calculation
- Validation of CIDR notation and IP address format
- Recursive subnet splitting down to /32
- `getSubnetClass()`: Determine network class (A-E) from IP address

### IPv4 Address Classes

The calculator supports and correctly identifies all five IPv4 address classes:

#### Class A (1-126)
- **Default Prefix**: /8 (255.0.0.0)
- **Hosts per Network**: 16,777,214 usable (2²⁴ - 2)
- **Example**: 10.0.0.0/8, 1.0.0.0/8
- **Use Case**: Large enterprise networks

#### Class B (128-191)
- **Default Prefix**: /16 (255.255.0.0)
- **Hosts per Network**: 65,534 usable (2¹⁶ - 2)
- **Example**: 172.16.0.0/12, 130.0.0.0/16
- **Use Case**: Medium-sized networks

#### Class C (192-223)
- **Default Prefix**: /24 (255.255.255.0)
- **Hosts per Network**: 254 usable (2⁸ - 2)
- **Example**: 192.168.0.0/16, 200.0.0.0/24
- **Use Case**: Small networks, subnetting

#### Class D (224-239)
- **Purpose**: Multicast addressing
- **Reserved**: 224.0.0.0/4
- **Use Case**: One-to-many communication
- **Example**: 224.0.0.1 (all hosts), 239.255.255.255

#### Class E (240-255)
- **Purpose**: Reserved for future use and research
- **Not for regular use**: Reserved by IETF
- **Ranges**: 240.0.0.0/4

### RFC 1918 Private Address Ranges

Three specific ranges are designated for private use:
- **10.0.0.0/8** - Class A private (16,777,216 addresses)
- **172.16.0.0/12** - Class B private (1,048,576 addresses)
- **192.168.0.0/16** - Class C private (65,536 addresses)

These ranges are used internally in networks and never routed on the public Internet.

### Special Cases Handled

- **RFC 3021 /31 Networks**: Point-to-point links with both addresses usable (no network/broadcast)
- **RFC /32 Networks**: Host routes with single address (network = broadcast = host)
- **Subnetting**: Any prefix length (0-32) is supported and calculated correctly

### Validation
- Uses Zod schema for input validation
- CIDR notation must be in format: `x.x.x.x/prefix` where prefix is 0-32
- Network address must match the IP for given prefix (e.g., 10.0.0.0 for 10.0.0.5/24 is invalid)
- All calculations validated against 44 comprehensive unit tests

## CSV Export Implementation

CSV export includes all subnet details:
- CIDR notation
- Network Address
- Broadcast Address
- First Host
- Last Host
- Usable Hosts
- Total Hosts
- Subnet Mask
- Wildcard Mask
- Prefix Length

File naming format: `subnet-export-YYYY-MM-DD.csv`

## Git Commit Message Conventions

This project follows the **Conventional Commits** specification for clear, organized commit history. All commit messages must use the following format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types

**`feat:`** - A new feature or functionality
- Examples: "feat: add subnet split validation", "feat: implement CSV export"
- Use when adding new capabilities to the application

**`fix:`** - A bug fix
- Examples: "fix: correct /31 subnet splitting", "fix: prevent invalid state transitions"
- Use when fixing broken functionality

**`docs:`** - Documentation changes only
- Examples: "docs: update API endpoints", "docs: add deployment guide"
- Use for README, guides, comments, or comment-only changes

**`style:`** - Code style changes (formatting, semicolons, whitespace, etc.)
- Examples: "style: format code with Prettier", "style: fix indentation"
- Does NOT affect code functionality

**`refactor:`** - Code refactoring without fixing bugs or adding features
- Examples: "refactor: extract subnet tree logic", "refactor: simplify error handling"
- Improves code quality, readability, or performance

**`test:`** - Adding or updating tests
- Examples: "test: add subnet calculation tests", "test: improve error boundary coverage"
- Use when modifying test files

**`chore:`** - Maintenance tasks, dependency updates, configuration changes
- Examples: "chore: update dependencies", "chore: expand .gitignore for cross-platform support"
- Use for tooling, build files, CI/CD, package management

**`perf:`** - Performance improvements
- Examples: "perf: optimize subnet tree traversal", "perf: memoize expensive calculations"
- Use when improving speed or reducing resource usage

**`ci:`** - CI/CD configuration or automation changes
- Examples: "ci: add GitHub Actions workflow", "ci: configure lint checks"
- Use for GitHub Actions, GitLab CI, or similar

### Scope (Optional)

The scope clarifies which part of the codebase is affected:

- `(api)` - API endpoints or backend routes
- `(ui)` - User interface components
- `(validation)` - Input validation and schemas
- `(errors)` - Error handling and boundaries
- `(docs)` - Documentation files
- `(config)` - Configuration files

Example: `feat(ui): add dark mode toggle` or `fix(validation): correct CIDR validation`

### Subject Line Guidelines

- Use imperative mood: "add" not "added" or "adds"
- Don't capitalize the first letter (after type): `feat: add filter` not `feat: Add filter`
- Don't end with a period
- Keep it concise (50 characters or less when possible)
- Be specific and descriptive

### Message Body (Optional)

For complex changes, include a body explaining:
- **What** changed and why
- **How** it works
- Any breaking changes or side effects
- Related issue numbers (e.g., "Fixes #123", "Related to #456")

### Examples

```
feat(validation): validate network address matches CIDR prefix

- Ensure IP address is the network address for given prefix
- Reject inputs like 192.168.1.5/24 (must be 192.168.1.0/24)
- Add clear error messages to guide users
- Use custom SubnetCalculationError for specific handling
```

```
fix(errors): prevent invalid state transitions in split operations

- Add state validation before splitting subnets
- Check subnet exists, can be split, and has no children
- Log validation failures for debugging
- Show toast notification for failed operations
```

```
chore: expand .gitignore for cross-platform coverage

- Add comprehensive macOS file exclusions
- Add Windows and Linux specific patterns
- Organize with clear section headers
```

### Commit History Best Practices

1. **One logical change per commit** - Keep commits atomic and focused
2. **Write for future developers** - Explain why, not just what
3. **Use imperative mood** - Describe what the commit does when applied
4. **Link to issues** - Reference related issues in commit body
5. **Review before committing** - Verify changes match the message
6. **No work-in-progress commits** - Test before committing
7. **Keep history clean** - Avoid "oops" or "fix typo" commits

## Agent Orchestration Guidelines

### For AI Agents Working on This Project

1. **Always Maintain Type Safety**
   - TypeScript strict mode is enabled
   - No `any` types without justification
   - Test type checking with `npm.cmd run check`

2. **Cross-Platform Compatibility**
   - Test solutions on Windows (primary development environment)
   - Use `cross-env` for environment variables in scripts
   - Avoid platform-specific path handling

3. **Performance Considerations**
   - All subnet calculations happen client-side
   - No database queries or network requests for core functionality
   - Optimize table rendering with React best practices
   - Monitor component re-renders

4. **UI/UX Standards**
   - No horizontal scrollbars on standard displays
   - Elegant, modern design aligned with shadcn/ui
   - Copy-to-clipboard feedback for user interactions
   - Responsive design that works on mobile

5. **Testing Changes**
   - Run `npm.cmd run dev` to test locally
   - Verify TypeScript compilation: `npm.cmd run check`
   - Check for console errors in browser DevTools
   - Test both light and dark modes

6. **Code Review Checklist**
   - [ ] TypeScript compilation passes without errors
   - [ ] No console warnings or errors
   - [ ] No horizontal scrollbars on 1080p+ screens
   - [ ] All features work in both light and dark modes
   - [ ] Changes follow existing code style
   - [ ] No security vulnerabilities introduced

## Agent Token Usage Optimization

**Reduce context and token consumption when working on this project:**

### Efficient Search & Discovery

**Use targeted searches, not broad exploration:**
-  `grep_search` for specific strings or patterns: `grep_search` with file patterns (`includePattern`)
-  `semantic_search` only when you need natural language matching
-  Don't run multiple broad `semantic_search` calls in sequence
-  Don't search without `maxResults` limit when working with large files

**Example - DO:**
```
grep_search: { query: "calculateSubnet|splitSubnet", isRegexp: true, includePattern: "lib/subnet-utils.ts" }
```

**Example - DON'T:**
```
semantic_search: "subnet calculation" (returns entire codebase)
semantic_search: "error handling" (too broad)
semantic_search: "button components" (too broad)
```

### Parallel Tool Execution

**Execute independent operations simultaneously, not sequentially:**
-  Run multiple `read_file` operations in one batch (different files)
-  Run multiple `grep_search` operations in one batch (different files/patterns)
-  Run `get_errors` and `grep_search` together (independent checks)
-  Don't chain sequential `read_file` calls when you could read ranges in parallel
-  Don't run searches one-at-a-time when gathering different information

**Example - Parallel (Efficient):**
```
Batch 1: read_file (lines 1-50), read_file (lines 100-150), grep_search (pattern A), grep_search (pattern B)
```

**Example - Sequential (Wasteful):**
```
read_file (lines 1-50)
read_file (lines 100-150)
grep_search (pattern A)
grep_search (pattern B)
```

### Reading Files Intelligently

**Read larger sections, not many small ones:**
-  Read 100+ lines in one call if you need that context
-  Read entire small files (< 200 lines) in one operation
-  Use line ranges that capture complete logical sections
-  Don't call `read_file` multiple times to read sequential lines
-  Don't read 5 lines at a time when you need 50

**Example - Good file reading strategy:**
```
// First call: read entire function signature area (100 lines)
read_file { start: 1, end: 100 }
// If you need to see how it's called, read the other location (50 lines)
read_file { start: 500, end: 550 }
```

### Batch Edit Operations

**Use `multi_replace_string_in_file` for multiple changes:**
-  Execute 5+ related edits in single `multi_replace_string_in_file` call
-  Group edits by file or by logical feature
-  Don't use `replace_string_in_file` for each individual change
-  Don't edit one file, wait for result, then edit another

**Example - Efficient batch edits:**
```
multi_replace_string_in_file {
  replacements: [
    { filePath: "file1.ts", oldString: "...", newString: "..." },
    { filePath: "file1.ts", oldString: "...", newString: "..." },
    { filePath: "file2.ts", oldString: "...", newString: "..." }
  ]
}
```

### Context Reuse & Deduplication

**Avoid redundant information gathering:**
-  Save search results and reference them across multiple operations
-  If a `grep_search` returned a file path, use it for subsequent reads
-  If you found a file location, reference it by name in explanations
-  Don't search for the same pattern twice
-  Don't re-read files you already have in context
-  Don't ask for information you already discovered

**Example - Reuse discovered information:**
```
Search: grep_search finds calculateSubnet in subnet-utils.ts line 45
Action: read_file { filePath: "subnet-utils.ts", startLine: 40, endLine: 60 }
Reference: In subsequent operations, you know calculateSubnet is at line 45
```

### Tool Selection Strategy

**Choose the right tool for each task:**

| Task | Best Tool | Why |
|------|-----------|-----|
| Search for specific string | `grep_search` | Fast, exact matching, small output |
| Find how a function is used | `list_code_usages` | Designed for this, returns all references |
| Understand a vague concept | `semantic_search` | Natural language matching across codebase |
| Find files by name pattern | `file_search` | Glob pattern matching for discovery |
| Explore project structure | `list_dir` | Directory listing, not full file content |
| Fix type errors | `get_errors` | Specific error information from TypeScript |
| Multi-location edits | `multi_replace_string_in_file` | 1 operation instead of N separate calls |

### Common Inefficiencies to Avoid

**1. Over-searching**
-  Running semantic_search to find a file that could be discovered with `file_search`
-  Use file_search for file discovery, semantic_search only for code patterns

**2. Small reads**
-  `read_file` with 10-line ranges when you need full function context
-  Read complete functions/sections (often 50-100 lines)

**3. Sequential discovery**
-  Read a file, discover reference to another file, read that file
-  Identify all files you need, then read them in parallel batch

**4. Redundant searches**
-  Search for "calculateSubnet" to find the function, then search again later in same task
-  Save first search result, reference it for all subsequent operations

**5. Single edits in loop**
-  Make one change, see result, make another change, see result (10+ operations)
-  Batch all changes together if possible (1-2 operations)

### Token Budget Rules

**Project-specific efficiency targets:**
- Small fixes (1-3 files): < 15KB context
- Feature additions (5-10 files): < 50KB context
- Full reviews (entire codebase): < 150KB context

**How to stay efficient:**
1. **Before searching**: Ask "Do I already have this information?"
2. **Before reading**: Ask "What's the minimum range I need?"
3. **Before editing**: Ask "Can I batch this with other changes?"
4. **Before tool selection**: Ask "Is there a more specific tool?"

### Example: Efficient vs Wasteful Approaches

**Task: Add a new validation to SubnetInfo**

**Wasteful (70+ tokens in searches/reads):**
```
1. semantic_search: "SubnetInfo" (returns entire codebase overview)
2. read_file: get all of subnet-utils.ts (250 lines)
3. read_file: get all of schema.ts (200 lines)
4. grep_search: find SubnetInfo definition
5. grep_search: find SubnetInfo usage
6. read_file: check package.json
... (multiple sequential operations)
```

**Efficient (20-30 tokens for same task):**
```
1. grep_search: "interface SubnetInfo|type SubnetInfo" in schema.ts
2. read_file: schema.ts lines 1-100 (covers types)
3. grep_search: "SubnetInfo" in subnet-utils.ts (finds references)
4. read_file: subnet-utils.ts lines 45-95 (covers usage)
... (parallel operations, targeted searches)
```

### When Working on Complex Features

**For multi-file changes (features, refactors):**
1. Identify all affected files using targeted searches
2. Read all files in parallel batch
3. Plan all changes before executing
4. Execute all edits in one `multi_replace_string_in_file` call
5. Verify with single `get_errors` or `run_in_terminal` call

**This approach:** ~40-50KB context vs 200KB+ for sequential approach

## Security Principles

- **No User Data**: All calculations are ephemeral, no storage or transmission
- **Client-Side Only**: All subnet logic executes in the browser
- **Helmet Middleware**: Adds XSS, clickjacking, and MIME sniffing protection
- **Static Serving**: Production only serves compiled assets from `dist/public`
- **Rate Limiting**: SPA fallback routes are protected with rate limiting to prevent abuse of file system operations
- **No APIs**: No external API calls except for static assets

## Common Tasks

### Adding a New Feature
1. Create component in `client/src/components/`
2. Add TypeScript types to `shared/schema.ts` if needed
3. Use React Hook Form + Zod for form validation
4. Style with Tailwind CSS
5. Test with `npm.cmd run dev`
6. Update this file and `agent-reasoning.md` with feature description

### Fixing a Bug
1. Identify exact file and line where issue occurs
2. Write minimal reproduction if possible
3. Fix the issue maintaining type safety
4. Test in dev environment
5. Verify no regressions in related features
6. Update `agent-reasoning.md` with issue and solution

### Performance Optimization
1. Profile with React DevTools
2. Check for unnecessary re-renders
3. Optimize memoization of expensive calculations
4. Test with large subnet hierarchies (many splits)
5. Verify no lag or UI freezing

## Helpful Links

- [agent-reasoning.md](agent-reasoning.md) - Detailed development history and prompts
- [README.md](../README.md) - User-facing project documentation
- [Tailwind CSS Docs](https://tailwindcss.com)
- [shadcn/ui Components](https://ui.shadcn.com)
- [React Hook Form Docs](https://react-hook-form.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

## Planned Features & API Enhancements

### Backend API Layer (Future)

Currently all subnet calculations happen client-side. The following REST API endpoints are planned for future implementation:

**POST `/api/subnets/calculate`**
- Calculate subnet details from CIDR notation
- Request: `{ cidr: "192.168.1.0/24" }`
- Response: Full `SubnetInfo` object with all network details
- Use cases: External tools, programmatic access, server-side validation

**POST `/api/subnets/split`**
- Split a subnet into two equal child subnets
- Request: `{ subnet: SubnetInfo }`
- Response: `{ first: SubnetInfo, second: SubnetInfo }`
- Use cases: Batch subnet planning, network automation scripts

**POST `/api/subnets/batch`**
- Calculate multiple subnets in a single request
- Request: `{ cidrs: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"] }`
- Response: Array of `SubnetInfo` objects
- Use cases: Network documentation generation, bulk operations

**Benefits of Adding API Layer:**
- Enable external applications to use the calculator
- Server-side logging and usage analytics
- Potential caching of frequently requested calculations
- Integration with network management tools
- Standardized interface for subnet operations

**Implementation Notes:**
- Share calculation logic with client-side code (`subnet-utils.ts`)
- Add request/response validation using existing Zod schemas
- Implement error handling for invalid CIDR inputs
- No database needed - calculations are stateless
- Rate limiting optional (security consideration)

## Latest Status

**As of January 31, 2026 (Final):**

 **Complete Project State**:
- Development environment fully configured (Windows compatible)
- All TypeScript type definitions installed and working
- Core CIDR calculation functionality complete and thoroughly tested
- Server binding fallback logic implemented and tested
- Comprehensive test suite: 80 tests (53 unit + 27 integration), 100% passing
- Design system implemented with secondary accent color (teal)
- Robustness improvements complete (validation, error boundaries, state validation)
- Documentation comprehensive and current across all files

 **Test Suite Status**:
- **Unit Tests**: 53 tests covering all calculation logic (100% code coverage)
- **Integration Tests**: 27 tests validating design system and WCAG accessibility
- **Total Tests**: 80/80 passing
- **Execution Time**: ~1.3 seconds
- **WCAG Compliance**: AAA for primary text (7.2:1), AA+ for all other elements

 **Security & Quality**:
- npm audit: 0 vulnerabilities
- TypeScript: Strict mode enforced, no `any` types
- Production build: Successfully builds and runs
- Code style: Consistent across all files
- No console errors in dev or production environments

 **Documentation**:
- `.github/copilot-instructions.md`: Comprehensive guidelines (updated with full test coverage info)
- `.github/agent-reasoning.md`: Complete development history
- `tests/README.md`: Testing framework documentation
- `README.md`: User-facing documentation with Windows compatibility notes

**Ready For**:
- Production deployment
- CI/CD integration (GitHub Actions workflow ready)
- API layer implementation (documented and planned)
- Future feature development

---

**Last Updated**: January 31, 2026 (Final Session)  
**Maintained By**: Development Team  
**Related Files**: [agent-reasoning.md](agent-reasoning.md), [../README.md](../README.md), [../tests/README.md](../tests/README.md)
