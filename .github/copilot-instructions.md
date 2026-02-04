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
  ├── schema.ts             # Shared TypeScript types/schemas
  └── kubernetes-schema.ts  # Kubernetes API schemas

scripts/
  ├── build.ts              # Production build orchestration
  └── fix-emoji.ts          # Emoji detection and auto-fix CLI tool

tests/
  ├── unit/                 # Unit tests (subnet-utils, kubernetes-network-generator, emoji-detection)
  ├── integration/          # Integration tests (styles, API, config, security)
  ├── manual/               # PowerShell manual testing scripts
  └── README.md             # Testing documentation

docs/
  ├── API.md                # Kubernetes Network Planning API reference
  └── compliance/           # Platform-specific compliance audits
      ├── AKS_COMPLIANCE_AUDIT.md   # Azure Kubernetes Service
      ├── EKS_COMPLIANCE_AUDIT.md   # AWS Elastic Kubernetes Service
      └── GKE_COMPLIANCE_AUDIT.md   # Google Kubernetes Engine

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

**Current Status**: **0 vulnerabilities**

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
3. Test application: `npm run dev` -> verify it starts
4. Run test suite: `npm run test` -> verify tests pass
5. Build check: `npm run build` -> verify production build works
6. If issues persist, manually review the changed packages and revert if necessary

## Application Security Configuration

### Helmet & Content Security Policy (CSP)

**Files**: `server/index.ts`, `server/csp-config.ts`, `server/routes.ts`

The application uses Helmet.js middleware to enforce strict security headers. The CSP is environment-aware to balance security with developer experience.

#### Base CSP Configuration (`server/csp-config.ts`)

**Centralized Configuration Design:**
- All CSP directives defined in `server/csp-config.ts` to prevent configuration drift
- `baseCSPDirectives` applies globally to all endpoints
- Route-specific overrides (Swagger UI) built programmatically from base directives
- Single source of truth eliminates manual synchronization

**Production CSP (Strict)**:
```typescript
{
  scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],  // Self + Swagger UI CDN
  styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],  // Dynamic styles + Swagger CSS
  connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],  // API + fonts
  imgSrc: ["'self'", "data:"],     // Images from self and data URIs
  // Note: cdn.jsdelivr.net NOT in base connectSrc (route-specific permission)
}
```

**Development CSP (Relaxed for Tooling)**:
```typescript
if (isDevelopment) {
  cspDirectives.scriptSrc.push("'unsafe-inline'");  // Vite HMR & Fast Refresh
  cspDirectives.connectSrc.push("ws://127.0.0.1:*", "ws://localhost:*");  // WebSocket HMR
  cspDirectives.reportUri = ["/__csp-violation"];  // CSP violation reporting endpoint
}
```

#### Route-Specific CSP (Swagger UI)

**Security Architecture - Principle of Least Privilege:**
- Only `/api/docs/ui` gets `cdn.jsdelivr.net` in `connectSrc` (NOT in base policy)
- Other endpoints cannot connect to external CDNs (defense in depth)
- Prevents data exfiltration if another route is compromised

**Why Different Directives?**
- `scriptSrc` / `styleSrc`: Loads Swagger UI assets (global policy has `cdn.jsdelivr.net`)
- `connectSrc`: Fetch/XHR for source maps (Swagger UI route only gets `cdn.jsdelivr.net`)

**Programmatic CSP Builder** (`buildSwaggerUICSP()` in `server/csp-config.ts`):
```typescript
export function buildSwaggerUICSP(isDevelopment: boolean = false): string {
  // Start with copy of baseCSPDirectives (automatic synchronization)
  const swaggerDirectives = { ...baseCSPDirectives };
  
  // Development-only: Add 'unsafe-inline' for SwaggerUIBundle
  if (isDevelopment) {
    swaggerDirectives.scriptSrc.push("'unsafe-inline'");
  }
  
  // Always add CDN for source maps (route-specific permission)
  swaggerDirectives.connectSrc.push("https://cdn.jsdelivr.net");
  
  return convertToCSPString(swaggerDirectives);
}
```

**Benefits:**
- [PASS] Automatic synchronization with `baseCSPDirectives`
- [PASS] No manual maintenance required
- [PASS] Configuration drift eliminated
- [PASS] Environment-aware (development vs production)
- [PASS] Single source of truth

#### CSP Violation Reporting Endpoint (Development Only)

**Files**: `server/index.ts`, `shared/schema.ts`

The application includes a CSP violation reporting endpoint for development debugging.

**Endpoint**: `POST /__csp-violation` (development only)

**CRITICAL**: Browsers send CSP violation reports wrapped in a `"csp-report"` key per W3C spec:
```json
{
  "csp-report": {
    "blocked-uri": "https://malicious.com/script.js",
    "violated-directive": "script-src",
    "original-policy": "script-src 'self'",
    "document-uri": "http://localhost:5000",
    "disposition": "enforce"
  }
}
```

**Schema Validation** (`shared/schema.ts`):
```typescript
// Internal violation fields
const cspViolationFields = z.object({
  'blocked-uri': z.string().optional(),
  'violated-directive': z.string().optional(),
  'original-policy': z.string().optional(),
  'source-file': z.string().optional(),
  'line-number': z.number().optional(),
  'column-number': z.number().optional(),
  'document-uri': z.string().optional(),
  disposition: z.enum(['enforce', 'report']).optional(),
  status: z.number().optional(),
}).strict().optional();

// Wrapper schema for browser payload
export const cspViolationReportSchema = z.object({
  'csp-report': cspViolationFields,
}).strict();
```

**Processing** (`server/index.ts`):
```typescript
app.post('/__csp-violation', (req: Request, res: Response) => {
  // Validate wrapper structure
  const validationResult = cspViolationReportSchema.safeParse(req.body);
  
  if (!validationResult.success) {
    logger.warn('Invalid CSP violation report received');
    res.status(204).end();  // W3C spec requires 204 No Content
    return;
  }
  
  // Extract actual violation data from wrapper
  const violation = validationResult.data['csp-report'];
  
  if (violation && (violation['blocked-uri'] || violation['violated-directive'])) {
    logger.warn('CSP Violation Detected', {
      blockedUri: violation['blocked-uri'],
      violatedDirective: violation['violated-directive'],
      // ... log other fields
    });
  }
  
  res.status(204).end();
});
```

**Key Points:**
- [PASS] Validates W3C CSP violation report format
- [PASS] Extracts nested `"csp-report"` wrapper
- [PASS] Always returns 204 No Content (per W3C spec)
- [PASS] Never exposes schema details in responses
- [PASS] Development-only (not available in production)
- [PASS] Helps catch CSP issues before deployment

**Reference**: [W3C CSP Violation Reports](https://w3c.github.io/webappsec-csp/#violation-reports)

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
1. **Update base directives in `server/csp-config.ts`** - All CSP changes should start with `baseCSPDirectives`
2. **Route-specific overrides use programmatic builder** - Use `buildSwaggerUICSP()` pattern for route-specific needs
3. **Never edit CSP strings directly** - Always use the centralized configuration to prevent drift
4. **Test in both light and dark modes** - Ensure styles load correctly
5. **Test Vite HMR** - Dev server must stay responsive with inline scripts
6. **Verify no console errors** - Check browser DevTools for blocked resources
7. **Test CSP violation endpoint** - Verify violations are logged correctly in development
8. **Run `npm run dev`** - Confirm development experience works
9. **Check production build** - Run `npm run build && npm start`
10. **Test in multiple browsers** - Chrome/Edge/Firefox have different CSP enforcement

### Rate Limiting Strategy

**Files**: `server/static.ts`, `server/vite.ts`, `server/index.ts`

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

**CSP Violation Report Rate Limiting** (`server/index.ts`):
```typescript
const cspViolationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 reports per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: "Too many CSP violation reports. Please try again later.",
});

app.post('/__csp-violation', cspViolationLimiter, (req, res) => {
  // ... endpoint logic
});
```

**Development Setup** (`server/vite.ts`):
- Vite middleware is used for HMR and asset serving during development
- SPA fallback is also protected by a `spaRateLimiter` in dev, but with a higher limit (e.g., `max: 100`) tuned for local usage
- The dev `spaRateLimiter` applies to GET/HEAD SPA fallback requests even on localhost

**Rate Limiting Best Practices**:
1. **File system operations** are expensive - always rate limit SPA fallback in production
2. **Development should also use rate limiting**, but with more permissive limits (higher `max`) to avoid impacting normal local workflows
3. **Logging endpoints** need rate limiting to prevent log flooding DoS attacks
4. **CSP violation endpoint** uses higher limit (100 vs 30) because browsers batch legitimate reports
5. **Per-IP tracking** - Express trust proxy configured via environment variable for accurate client IP detection
6. **Graceful degradation** - returns 429 status with error message

**Trust Proxy Security**: Configured via `TRUST_PROXY` environment variable (secure-by-default):

| Setting | Use Case | Security |
|---------|----------|----------|
| `TRUST_PROXY=false` (default production) | Direct internet or unknown proxies |  Safe - uses direct socket IP, prevents spoofing |
| `TRUST_PROXY=loopback` (default development) | Local development only |  Safe - trusts only localhost (127.0.0.1, ::1) |
| `TRUST_PROXY=1` | Single reverse proxy (e.g., Nginx) |  Safe - trusts 1 hop |
| `TRUST_PROXY="10.0.0.0/8,127.0.0.1"` | Specific proxy IPs/CIDRs |  Safe - allowlist specific proxies |

**WARNING -  CRITICAL SECURITY WARNING**: Never set `trust proxy = true` in production without understanding the risks. This allows attackers to spoof client IPs via `X-Forwarded-For` header, breaking per-IP rate limiting and enabling:
- Bypassing rate limits completely
- Causing collateral damage (blocking legitimate users)
- Exhausting server resources

Always configure `TRUST_PROXY` explicitly based on your deployment architecture.

### SPA Fallback Middleware

**File**: `server/vite.ts`

The SPA fallback is responsible for serving `index.html` for client-side routes (not static assets).

**Critical Control Point**: Requests for file extensions (e.g. `.js`, `.css`, `.tsx`) must be excluded from the SPA fallback so they can be handled by Vite's own middleware or static file serving.

To achieve this safely, the **file-extension guard must live in the SPA fallback middleware itself** (before rendering `index.html`). The `express-rate-limit` middleware's `skip` function only controls whether rate limiting is applied; when `skip` returns `true`, the limiter simply calls `next`, which still invokes the SPA fallback. It does **not** by itself prevent the SPA fallback from running.

This means:
- The SPA fallback in `server/vite.ts` should internally check for asset-like URLs (contain a file extension and do not end in `.html`) and immediately `next()` for those, allowing them to be handled by Vite or static middleware instead of being treated as SPA routes.
- The rate limiter can still use `skip` to avoid counting obvious asset requests, but this only affects rate limiting behavior, not routing or fallback behavior.

**Why This Matters**:
- Without a file-extension check inside the SPA fallback, the fallback could try to render `.tsx` (or other source) files as HTML.
- That behavior can break Vite's React plugin and obscure preamble/runtime errors, making debugging significantly harder.
- Recommended middleware order: Vite middleware and static serving first, then the rate limiter (optionally with `skip` for assets), and finally the SPA fallback in `server/vite.ts` which performs its own file-extension guard before serving `index.html`.

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

### URL Validation vs CSP Directive Building

**Important Distinction**: There's a critical difference between URL validation (security-sensitive) and CSP directive construction (configuration).

**GOOD - URL Validation (User Input)**:
When validating user-provided URLs, always extract and validate the host:

```javascript
app.get('/some/path', function(req, res) {
    let url = req.param('url'),
        host = urlLib.parse(url).host;
    // GOOD: the host of `url` can not be controlled by an attacker
    let allowedHosts = [
        'example.com',
        'beta.example.com',
        'www.example.com'
    ];
    if (allowedHosts.includes(host)) {
        res.redirect(url);
    }
});
```

**Why this works**: Extracting `.host` ensures exact domain matching. An attacker cannot use `https://evil.com?redirect=example.com` to bypass the check.

**Security References**:
- **OWASP**: Server-Side Request Forgery (SSRF)
- **OWASP**: [Unvalidated Redirects and Forwards Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)
- **CWE-20**: Improper Input Validation
- **CWE-601**: URL Redirection to Untrusted Site ('Open Redirect')

**NOT A VULNERABILITY - CSP Directive Building (Server Configuration)**:
Our CSP configuration in `server/csp-config.ts` is **not** URL validation:

```typescript
// This is CSP directive construction (safe - not user input)
const cdnSource = "https://cdn.jsdelivr.net";
if (!swaggerDirectives.connectSrc.includes(cdnSource)) {
    swaggerDirectives.connectSrc.push(cdnSource);
}
```

**Why this is safe**:
- We're building Content-Security-Policy headers (server configuration)
- The URL is a hardcoded constant, not user input
- `Array.includes()` checks for exact element match (not substring search)
- CSP requires exact host matching - no substring wildcards
- CodeQL warning suppressed with `lgtm[js/incomplete-url-substring-sanitization]`

**Key Takeaway**: Use URL parsing for user input validation. Use exact string matching for configuration constants.

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

**Issue 4: CSP Violation Report Wrapper Not Handled (CRITICAL FIX - February 2026)**
- **Problem**: CSP violation endpoint was validating `req.body` directly instead of extracting the W3C-mandated `"csp-report"` wrapper
- **Impact**: All real browser CSP violation reports were being silently rejected with "Invalid CSP violation report received"
- **Root Cause**: Browsers send CSP violations wrapped as `{"csp-report": {...}}` per W3C spec, but code validated inner fields directly
- **Resolution**: 
  - Updated `cspViolationReportSchema` in `shared/schema.ts` to expect wrapper structure
  - Modified endpoint in `server/index.ts` to extract `req.body['csp-report']` after wrapper validation
  - Updated all 12 test cases to use correct W3C format
- **Key Learning**: Always follow W3C specifications exactly when implementing browser standards
- **Files Modified**: `shared/schema.ts`, `server/index.ts`, `tests/integration/csp-violation-endpoint.test.ts`
- **Commit**: e6f0f11
- **Reference**: [W3C CSP Violation Reports](https://w3c.github.io/webappsec-csp/#violation-reports)

**Issue 5: CSP Violation Endpoint Not Rate Limited (SECURITY FIX - February 2026)**
- **Problem**: CSP violation endpoint had no rate limiting, allowing attackers to flood logs
- **Impact**: Potential log flooding, disk space exhaustion, log rotation issues, DoS via excessive logging
- **Root Cause**: Endpoint was focused on functionality without considering abuse scenarios
- **Resolution**:
  - Added rate limiting middleware to `/__csp-violation` endpoint
  - Limit: 100 reports per 15 minutes per IP
  - Rationale: Legitimate CSP violations are rare and browsers batch them
  - Added test coverage for rate limiting configuration
- **Key Learning**: All endpoints accepting external input need rate limiting, even development-only endpoints
- **Files Modified**: `server/index.ts`, `tests/integration/csp-violation-endpoint.test.ts`
- **Security Impact**: Prevents log-based DoS attacks in development environments

## Testing & Test Coverage

### Test Structure

Tests are organized in a dedicated `tests/` directory with clear organization:

```
tests/
├── unit/                        # Unit tests for individual functions (3 files, 121 tests)
│   ├── subnet-utils.test.ts     # Core calculation logic (53 tests)
│   ├── kubernetes-network-generator.test.ts  # K8s network logic (57 tests)
│   └── emoji-detection.test.ts  # Emoji validation (11 tests)
├── integration/                 # Integration tests for system-wide features (9 files, 194 tests)
│   ├── api-endpoints.test.ts    # API infrastructure (38 tests)
│   ├── kubernetes-network-api.test.ts  # K8s API (33 tests)
│   ├── calculator-ui.test.ts    # React components (31 tests)
│   ├── rate-limiting.test.ts    # Security middleware (23 tests)
│   ├── ui-styles.test.ts        # WCAG accessibility (19 tests)
│   ├── swagger-ui-csp-middleware.test.ts  # CSP middleware (18 tests)
│   ├── swagger-ui-theming.test.ts  # Swagger UI themes (12 tests)
│   ├── csp-violation-endpoint.test.ts  # CSP violations (12 tests)
│   └── config.test.ts           # Configuration (8 tests)
├── manual/                      # PowerShell testing scripts (2 files)
└── README.md                    # Testing documentation

See [docs/TEST_AUDIT.md](../docs/TEST_AUDIT.md) for comprehensive test suite analysis.
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

**Current Suite: 371 comprehensive tests (121 unit + 250 integration) - 100% pass rate [PASS]**

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
  - Primary color: 7.2:1 contrast on background (WCAG AAA) [PASS]
  - Foreground text: 12.5:1 contrast on background (WCAG AAA) [PASS]
  - Secondary accent: 2.5:1 contrast (suitable for UI highlights) [OK]
  - Destructive color: 5.2:1 contrast on background (WCAG AA) [OK]
  - Muted foreground: 4.2:1 contrast (WCAG AA) [OK]
- **Color Palette Consistency**: All colors properly defined, dark mode inversion
- **Tailwind Integration**: Color utilities properly mapped to CSS variables
- **Design System Documentation**: Verification of color guidelines and rationale

### Test Coverage Metrics

| Metric | Value |
|--------|-------|
| **Total Tests** | 371 |
| **Unit Tests** | 121 |
| **Integration Tests** | 250 |
| **Pass Rate** | 100% |
| **Execution Time** | ~3.2 seconds |
| **Test Files** | 12 (3 unit, 9 integration) |
| **Lines of Test Code** | 4,225 lines |
| **Average Lines/Test** | 13.4 (efficient) |
| **Bloat Reduction** | -7% (consolidated from 338 tests) |
| **Overall Grade** | A- |
| **WCAG Compliance** | AAA for primary text, AA for secondary elements |
| **Code Type Safety** | TypeScript strict mode enabled throughout |
| **Core Logic Coverage** | 100% (subnet-utils, kubernetes-network-generator) |
| **Security Testing** | Comprehensive (CSP, rate limiting, RFC 1918 enforcement) |

### Test Success Criteria

For the test suite to be considered passing:
- [PASS] All 371 tests must pass
- [PASS] No skipped or pending tests (except during development)
- [PASS] WCAG accessibility standards maintained
- [PASS] All calculation logic validated
- [PASS] Security endpoints fully tested
- [PASS] API infrastructure validated

For detailed test suite health analysis, see [docs/TEST_AUDIT.md](../docs/TEST_AUDIT.md).

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

### API Testing Workflow

**For AI Agents: Testing JSON and YAML Output**

1. **Start the development server** (Terminal 1):
   ```bash
   npm run dev
   # Wait for: "serving on 127.0.0.1:5000"
   ```

2. **Run API integration tests** (Terminal 2):
   ```bash
   # All API tests (33 tests)
   npm run test -- tests/integration/kubernetes-network-api.test.ts --run
   
   # Only JSON/YAML format validation tests (5 tests)
   npm run test -- tests/integration/kubernetes-network-api.test.ts -t "Output Format" --run
   ```

3. **Manual API testing** (verify output formats):
   ```bash
   # Test JSON output (default)
   curl -X POST http://127.0.0.1:5000/api/kubernetes/network-plan \
     -H "Content-Type: application/json" \
     -d '{"deploymentSize":"professional","provider":"eks"}'
   
   # Test YAML output (query parameter)
   curl -X POST "http://127.0.0.1:5000/api/kubernetes/network-plan?format=yaml" \
     -H "Content-Type: application/json" \
     -d '{"deploymentSize":"enterprise","provider":"gke","vpcCidr":"10.0.0.0/16"}'
   
   # Test tier info endpoint
   curl http://127.0.0.1:5000/api/kubernetes/tiers
   curl "http://127.0.0.1:5000/api/kubernetes/tiers?format=yaml"
   ```

4. **Validate output**:
   - JSON: Should parse correctly with `JSON.parse()`
   - YAML: Should contain valid YAML structure (keys with colons, proper indentation)
   - Both formats should have identical data structure

**Expected Test Results:**
- `tests/integration/kubernetes-network-api.test.ts`: 33/33 passing
- Includes tests for:
  - JSON serialization (default format)
  - YAML serialization (with `?format=yaml`)
  - Data integrity between formats
  - All subnet details present in output
  - Error responses in requested format

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
npm run test -- --run      # Run full test suite (all 371 tests must pass)
npm run build              # Verify production build succeeds
```

**Quality Gates:**
- [PASS] All 371 tests passing (121 unit + 250 integration)
- [PASS] Zero TypeScript errors in strict mode
- [PASS] Zero npm audit vulnerabilities
- [PASS] Production build succeeds without warnings
- [PASS] No console errors in dev environment
- [PASS] WCAG accessibility standards maintained
- [PASS] API endpoints return valid JSON and YAML formats
- [PASS] Test suite efficiency: 13.4 lines/test average

For test suite analysis and optimization recommendations, see [docs/TEST_AUDIT.md](../docs/TEST_AUDIT.md).

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
- Contrast ratio (primary on background): 7.2:1 [PASS] (exceeds WCAG AAA)
- Contrast ratio (text on primary): 12.5:1 [PASS] (exceeds WCAG AAA)
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

## Kubernetes Network Planning API

### Overview

The Kubernetes Network Planning API generates enterprise-grade network configurations for EKS (AWS), GKE (Google Cloud), AKS (Azure), and generic Kubernetes deployments. It supports multiple deployment sizes with battle-tested network topologies.

### Deployment Tiers

| Tier | Nodes | Public Subnets | Private Subnets | Public Size | Private Size | Pod Space | Services | Use Case |
|------|-------|---|---|---|---|---|---|---|
| **Micro** | 1 | 1 | 1 | /26 | /25 | /18 | /16 | POC/Development |
| **Standard** | 1-3 | 1 | 1 | /25 | /24 | /16 | /16 | Development/Testing |
| **Professional** | 3-10 | 2 | 2 | /25 | /23 | /16 | /16 | Small Production |
| **Enterprise** | 10-50 | 3 | 3 | /24 | /21 | /16 | /16 | Large Production |
| **Hyperscale** | 50-5000 | 3 | 3 | /23 | /20 | /13 | /16 | Global Scale/High Pod Density |

### API Endpoints

#### GKE Compliance & IP Calculation Formulas

This API implements Google Kubernetes Engine (GKE) best practices and uses battle-tested algorithms for IP allocation:

**GKE Pod CIDR Formula:**

The Pod IP allocation follows GKE's mathematical model where each node receives a `/24` alias IP range:

```
Given:
  Q = Maximum pods per node (110 for Standard, 32 for Autopilot)
  DS = Pod subnet prefix size (e.g., /13 for hyperscale)

Calculation:
  M = 31 - ⌈log₂(Q)⌉  (netmask size for node's pod range)
  HM = 32 - M         (host bits for node pod range)
  HD = 32 - DS        (host bits for pod subnet)
  MN = 2^(HD - HM)    (maximum nodes)
  MP = MN × Q         (maximum pods)

Example (Hyperscale, GKE Standard with 110 pods/node):
  M = 31 - ⌈log₂(110)⌉ = 24
  HM = 8
  HD = 19
  MN = 2^(19-8) = 2,048 nodes 
  MP = 2,048 × 110 = 225,280 pods  (exceeds GKE 200K pod limit)
```

**Node Primary Subnet Formula:**

The primary VPC subnet supports nodes using:

```
N = 2^(32-S) - 4
Where S = primary subnet prefix

For 5,000 nodes:
  S = 32 - ⌈log₂(5004)⌉ = /20 (4,092 nodes per subnet, 3 subnets = 12,276 total capacity)
  N = 2^(32-20) - 4 = 4,092 nodes per subnet 
```

**GKE Compliance:**

| Aspect | Requirement | Implementation | Status |
|--------|------------|-----------------|--------|
| **Cluster mode** | VPC-native | Yes, uses secondary ranges |  |
| **IP addressing** | RFC 1918 compliant | Yes, all tiers |  |
| **Max cluster size** | 5,000 nodes (Autopilot) | Hyperscale tier |  |
| **Pod limits** | 200,000 max | Supported per tier |  |
| **Service range** | /20 recommended | /16 provided (over-provisioned) |  |
| **Pod density** | Standard: 110 max, Autopilot: 32 default | Formula uses 110 assumption | WARNING -  |
| **Multi-AZ** | Multiple subnets per tier | Yes, 1-3 subnets per type |  |

**Pod Density Variation:**

- **GKE Standard:** Supports up to 110-256 pods per node
- **GKE Autopilot:** Default 32 pods per node (configurable 8-256)

Our formulas assume 110 pods/node (Standard). For Autopilot, actual pod space will be more generous than needed, which is safe but may over-provision.

**Usage Examples:**

```bash
# Enterprise tier (GKE Standard, 50 nodes, 10-50 node range)
# Pod range: /16 -> supports 256 nodes at 110 pods/node = 28K pods 

# Hyperscale tier (EKS/GKE, 5,000 nodes max, high pod density)
# Pod range: /13 -> supports 524K pods
# Primary: /18 -> supports 16,380 nodes per subnet 
```

**Best Practices:**

1. Use GKE Dataplane V2 for better performance and built-in policy enforcement
2. For 5,000+ node clusters, enable Private Service Connect
3. Monitor pod density to avoid hitting GKE's 200K pod limit
4. Use multi-AZ deployments in production (Professional+)
5. Plan for IP exhaustion - expanding ranges requires cluster recreation

### EKS Compliance & IP Calculation Formulas

AWS EKS uses a different IP allocation model than GKE, based on EC2 ENI (Elastic Network Interface) and secondary IP addresses. Our implementation supports both platforms with identical tier configurations.

**EKS Network Model:**
- Nodes get IP addresses from primary VPC subnet
- Pods get IPs from secondary ranges using AWS VPC CNI plugin
- IP prefix delegation (Nitro-based instances): `/28` CIDR blocks per pod batch
- Traditional method: Individual secondary IPs per pod (limited to ~50/node)

**Pod CIDR Calculation Formula:**
```
With IP prefix delegation (Nitro instances):
Pod_Capacity_Per_Node = (ENIs_Per_Instance × Prefixes_Per_ENI × 16_IPs_Per_Prefix)
Maximum pods per node: 250 (enforced by EKS)

Without prefix delegation:
Pod_Capacity_Per_Node = Secondary_IPs_Available
Maximum pods per node: 50-110 (instance type dependent)
```

**Node Primary Subnet Formula:**
```
Node_Capacity = 2^(32 - subnet_prefix) - 4
Example: /18 subnet = 2^14 - 4 = 16,380 nodes capacity
```

**EKS Scalability Thresholds:**

| Scale Level | Nodes | Pods | Recommendation |
|---|---|---|---|
| **Small** | <300 | <10K | Standard operations |
| **Medium** | 300-1000 | 10K-50K | Monitor control plane |
| **Large** | 1000-5000 | 50K-200K | Contact AWS support |
| **Extreme** | 5000-100K | 200K+ | AWS onboarding required |

Our Hyperscale tier supports up to 5,000 nodes in standard configuration (3 × /20 private subnets with 4,092 IPs each).

**EKS Tier Compliance Matrix:**

| Tier | Private | Pod CIDR | Node Capacity | Actual Nodes | Status |
|---|---|---|---|---|---|
| Micro | /25 | /18 | 124 | 1 |  |
| Standard | /24 | /16 | 252 | 1-3 |  |
| Professional | /23 | /16 | 508 | 3-10 |  |
| Enterprise | /21 | /16 | 2,044 | 10-50 |  |
| **Hyperscale** | **/20** | **/13** | **4,092** | **50-5000** |  |

**IP Prefix Delegation Requirements:**
- Requires AWS Nitro-based instance types (c5+, m5+, r5+, t3+, etc.)
- Enable via: `kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true`
- Subnets must have contiguous `/28` blocks available
- Use AWS subnet CIDR reservations to prevent fragmentation

**Fragmentation Risk & Mitigation:**
```
Problem: When subnets have scattered secondary IPs, prefix allocation fails
Error: "InsufficientCidrBlocks: The specified subnet does not have enough free cidr blocks"

Solutions:
1. Use new subnets (no fragmentation)
2. Create AWS subnet CIDR reservations
3. Enable WARM_PREFIX_TARGET for proactive scaling:
   kubectl set env ds aws-node -n kube-system WARM_PREFIX_TARGET=1
```

**EKS Best Practices:**
1. Use Nitro instance types for prefix delegation (better pod density)
2. Reserve subnet CIDR space for prefixes in large clusters (1000+ nodes)
3. Monitor API latency at 1000+ nodes (control plane scaling indicator)
4. Scale cluster services (coredns, kube-proxy) with node count
5. Use namespace quotas to prevent pod exhaustion
6. Enable multi-AZ for production (Professional tier minimum)
7. Plan for IP exhaustion - don't wait until subnets are full

**Comparison: EKS vs GKE Pod Allocation**

| Aspect | EKS | GKE |
|---|---|---|
| **Model** | EC2 ENI + secondary IPs | Alias IP ranges (automatic) |
| **Configuration** | Manual prefix delegation | Auto-managed by Google |
| **Pod Density** | 250 max (with prefix) | 110 default (Standard), 32 (Autopilot) |
| **Fragmentation Risk** | Yes (prefix allocation) | No (Google handles) |
| **Optimization** | WARM_PREFIX_TARGET tuning | None needed |
| **Max Nodes** | 100,000 (with support) | 5,000 (Autopilot) |
| **Support Threshold** | 1,000+ nodes | 5,000 node limit |

**Our Implementation:**
-  Supports both EKS and GKE with single tier configuration
-  Default settings work for both (safe defaults)
-  Over-provisioned service CIDR works for both
-  Pod CIDR `/13` supports both EKS (5000 nodes at 250 pods/node) and GKE (2048 nodes at 110 pods/node)

**For EKS Deployments:**
- Use Nitro-based instances to maximize pod density
- Enable prefix delegation for large clusters (300+ nodes)
- Monitor control plane metrics for scaling decisions
- Use subnet CIDR reservations for 1000+ node clusters
- Engage AWS support for 5000+ node configurations

### AKS Compliance & IP Calculation Formulas

Azure Kubernetes Service (AKS) uses Azure Virtual Network integration with Azure CNI for pod networking. Our implementation supports both managed VNets and custom VNets with identical tier configurations.

**AKS Network Model:**
- Nodes get IP addresses from primary VNet subnet
- Pods get IPs from overlay CIDR (or VNet with direct CNI)
- Azure CNI Overlay: `/28` blocks not needed; full overlay CIDR used
- Token bucket throttling algorithm for API rate limiting
- RFC 1918 private addressing required

**Node Capacity Formula:**
```
Node_Capacity = 2^(32 - subnet_prefix) - 4
Example: /18 subnet = 2^14 - 4 = 16,380 nodes capacity
```

**Pod CIDR Capacity (Overlay Model):**
```
Pod_Addresses = 2^(32 - pod_prefix)
With Azure CNI Overlay:
- /18 = 16,384 addresses
- /16 = 65,536 addresses (safe for all clusters)
- /13 = 524,288 addresses (supports 200K pod limit)
Actual Limit: Minimum of calculated or 200,000 pods per cluster
```

**AKS Scalability Thresholds:**

| Scale Level | Nodes | Pods | Recommendation |
|---|---|---|---|
| **Small** | <300 | <10K | Standard tier sufficient |
| **Medium** | 300-1000 | 10K-50K | Monitor control plane |
| **Large** | 1000-5000 | 50K-200K | Contact Azure support |
| **At Limit** | 5000 | 200K (overlay) | Cannot upgrade (no surge capacity) |

Our Hyperscale tier supports up to 5,000 nodes with 200,000 pods (Azure CNI Overlay, 3 × /20 private subnets).

**AKS Tier Compliance Matrix:**

| Tier | Private | Pod CIDR | Node Cap | Actual Nodes | Node Pools | Status |
|---|---|---|---|---|---|---|
| Micro | /25 | /18 | 124 | 1 | 1 |  |
| Standard | /24 | /16 | 252 | 1-3 | 1 |  |
| Professional | /23 | /16 | 508 | 3-10 | 1 |  |
| Enterprise | /21 | /16 | 2,044 | 10-50 | 1-2 |  |
| **Hyperscale** | **/20** | **/13** | **4,092** | **50-5000** | **5-10** |  |

**Multi-Node Pool Requirements:**
- AKS limit: 1,000 nodes per node pool
- For 5,000 nodes: Need minimum 5 node pools
- Typical distribution: 5 pools × 1,000 nodes each
- Plus 1-2 system pools for kube-system pods

**Token Bucket Throttling (AKS API Rate Limiting):**
```
Algorithm: Fixed-size bucket that refills over time

PUT ManagedCluster: 20 burst requests, 1 request/minute sustained
PUT AgentPool:      20 burst requests, 1 request/minute sustained
LIST ManagedClusters: 60 burst (ResourceGroup scope), 1 request/second
GET ManagedCluster: 60 burst requests, 1 request/second sustained
All Other APIs:     60 burst requests, 1 request/second sustained

Error: HTTP 429 (Too Many Requests)
Header: Retry-After: <delay-seconds>
```

**Scaling Best Practices:**
1. Scale in batches of 500-700 nodes
2. Wait 2-5 minutes between scale operations
3. Prevents Azure API throttling
4. Monitors control plane stability

**Cluster Upgrade Limitation:**
- **Critical**: Cannot upgrade when cluster is at 5,000 nodes
- **Reason**: No surge capacity for rolling updates
- **Solution**: Scale down to <3,000 nodes before upgrade
- **Planning**: Factor upgrade maintenance into cluster planning

**Azure CNI Overlay vs Direct CNI:**

| Aspect | Overlay | Direct |
|---|---|---|
| **Pod CIDR** | Separate overlay range | Uses VNet subnet IPs |
| **Max Pods** | 200,000 per cluster | 50,000 per cluster |
| **VNet IPs** | No consumption | Full consumption |
| **Recommended** | Production/Hyperscale | Legacy/small clusters |

**For AKS Deployments:**
- Use Standard or Premium control plane tier (Free not for production)
- Enable Azure CNI Overlay for clusters >1000 nodes
- Plan multiple node pools for 5000-node clusters
- Use Managed VNet unless specific custom networking needed
- Monitor Azure throttling with API client logging
- Scale in batches to prevent throttling errors
- Use Cilium or segmentation instead of Azure NPM for >250 nodes

---

#### POST `/api/kubernetes/network-plan`

Generate a Kubernetes network plan with optimized subnet allocation.

**Request Schema:**
```typescript
{
  deploymentSize: "standard" | "professional" | "enterprise" | "hyperscale",
  provider?: "eks" | "gke" | "aks" | "kubernetes" | "k8s",  // Defaults to "kubernetes", k8s is alias
  vpcCidr?: "10.0.0.0/16",                  // Optional, generates random RFC 1918 if not provided
  deploymentName?: "my-prod-cluster"        // Optional reference name
}
```

**Response Schema:**
```typescript
{
  deploymentSize: string,
  provider: string,
  deploymentName?: string,
  vpc: {
    cidr: string                            // e.g., "10.0.0.0/16"
  },
  subnets: {
    public: [
      {
        cidr: string,                       // e.g., "10.0.0.0/24"
        name: string,                       // e.g., "public-1"
        type: "public",
        availabilityZone?: string           // For future multi-AZ support
      }
    ],
    private: [
      {
        cidr: string,
        name: string,                       // e.g., "private-1"
        type: "private",
        availabilityZone?: string
      }
    ]
  },
  pods: {
    cidr: string                            // CNI plugin IP range (e.g., "10.1.0.0/16")
  },
  services: {
    cidr: string                            // Service ClusterIP range (e.g., "10.2.0.0/16")
  },
  metadata: {
    generatedAt: string,                    // ISO 8601 timestamp
    version: string                         // API version
  }
}
```

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks",
    "vpcCidr": "10.0.0.0/16",
    "deploymentName": "prod-cluster-us-east-1"
  }'
```

**Example Response:**
```json
{
  "deploymentSize": "professional",
  "provider": "eks",
  "deploymentName": "prod-cluster-us-east-1",
  "vpc": {
    "cidr": "10.0.0.0/16"
  },
  "subnets": {
    "public": [
      {
        "cidr": "10.0.0.0/24",
        "name": "public-1",
        "type": "public"
      },
      {
        "cidr": "10.0.1.0/24",
        "name": "public-2",
        "type": "public"
      }
    ],
    "private": [
      {
        "cidr": "10.0.2.0/23",
        "name": "private-1",
        "type": "private"
      },
      {
        "cidr": "10.0.4.0/23",
        "name": "private-2",
        "type": "private"
      }
    ]
  },
  "pods": {
    "cidr": "10.1.0.0/16"
  },
  "services": {
    "cidr": "10.2.0.0/16"
  },
  "metadata": {
    "generatedAt": "2026-02-01T15:30:45.123Z",
    "version": "1.0"
  }
}
```

#### GET `/api/kubernetes/tiers`

Retrieve information about all deployment tiers.

**Response:**
```json
{
  "micro": {
    "publicSubnets": 1,
    "privateSubnets": 1,
    "publicSubnetSize": 26,
    "privateSubnetSize": 25,
    "minVpcPrefix": 24,
    "podsPrefix": 18,
    "servicesPrefix": 16,
    "description": "Single Node: 1 node, minimal subnet allocation (proof of concept)"
  },
  "standard": {
    "publicSubnets": 1,
    "privateSubnets": 1,
    "publicSubnetSize": 25,
    "privateSubnetSize": 24,
    "minVpcPrefix": 23,
    "podsPrefix": 16,
    "servicesPrefix": 16,
    "description": "Development/Testing: 1-3 nodes, minimal subnet allocation"
  },
  "professional": {
    "publicSubnets": 2,
    "privateSubnets": 2,
    "publicSubnetSize": 25,
    "privateSubnetSize": 23,
    "minVpcPrefix": 21,
    "podsPrefix": 16,
    "servicesPrefix": 16,
    "description": "Small Production: 3-10 nodes, dual AZ ready"
  },
  "enterprise": {
    "publicSubnets": 3,
    "privateSubnets": 3,
    "publicSubnetSize": 24,
    "privateSubnetSize": 21,
    "minVpcPrefix": 18,
    "podsPrefix": 16,
    "servicesPrefix": 16,
    "description": "Large Production: 10-50 nodes, triple AZ ready with HA"
  },
  "hyperscale": {
    "publicSubnets": 3,
    "privateSubnets": 3,
    "publicSubnetSize": 23,
    "privateSubnetSize": 20,
    "minVpcPrefix": 18,
    "podsPrefix": 13,
    "servicesPrefix": 16,
    "description": "Global Scale: 50-5000 nodes, multi-region ready (EKS/GKE max)"
  }
}
```

### Network Architecture

**VPC Structure (Per Tier):**
- **Public Subnets**: For load balancers, NAT gateways, and ingress controllers
- **Private Subnets**: For worker nodes (EC2 instances, node pools)
- **Pod Network**: Separate CIDR for container IPs via CNI plugins (AWS VPC CNI, Calico, etc.)
- **Service Network**: ClusterIP range for Kubernetes service discovery

**IP Addressing Strategy:**
- Uses RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Subnets don't overlap with pod or service ranges
- Public and private subnets use differentiated sizes (public smaller for LBs, private larger for nodes)
- Hyperscale tier uses /23 public (510 IPs) and /20 private (4,092 IPs) subnets

### Implementation Details

**Files:**
- `shared/kubernetes-schema.ts` - Zod schemas and TypeScript types
- `client/src/lib/kubernetes-network-generator.ts` - Generation logic
- `server/routes.ts` - API endpoints
- `tests/unit/kubernetes-network-generator.test.ts` - Unit tests (45+ tests)
- `tests/integration/kubernetes-network-api.test.ts` - Integration tests (40+ tests)

**Key Features:**
- Deterministic generation (same VPC CIDR produces same subnets)
- Random RFC 1918 CIDR generation if not provided
- Automatic CIDR normalization to network address
- Full Zod validation on request and response
- Comprehensive error handling with clear messages
- Provider-agnostic (works with EKS, GKE, AKS, generic Kubernetes)

### Error Handling

**400 Bad Request:**
```json
{
  "error": "Invalid deployment size: unknown",
  "code": "NETWORK_GENERATION_ERROR"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to generate network plan",
  "code": "INTERNAL_ERROR"
}
```

### Usage Examples

**For Terraform/OpenTofu:**
Call the API to get CIDR ranges, then use them in your infrastructure-as-code:
```hcl
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = ["10.0.2.0/23", "10.0.4.0/23"][count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]
}
```

**For Kubernetes CNI Configuration:**
Use the pods CIDR in your CNI plugin settings:
```bash
# AWS VPC CNI
eksctl create cluster \
  --cluster-name my-cluster \
  --version 1.28 \
  --region us-east-1 \
  --pod-cidr 10.1.0.0/16
```

### Testing

The Kubernetes Network Planning API includes comprehensive tests:

**Unit Tests** (45 tests):
- Network generation for all deployment tiers
- VPC CIDR generation and normalization
- Subnet allocation and naming
- Pod/Services CIDR generation
- RFC 1918 support (Class A, B, C)
- Error handling and validation
- Reproducibility with same inputs

**Integration Tests** (40+ tests):
- Full API request/response flow
- All provider support (EKS, GKE, AKS, Kubernetes)
- Custom and auto-generated VPC CIDRs
- Multiple successive calls (randomization)
- Deployment tier information endpoint
- Error responses (400, 500)

**Run Tests:**
```bash
npm run test -- --run
npm run test -- tests/unit/kubernetes-network-generator.test.ts
npm run test -- tests/integration/kubernetes-network-api.test.ts
```

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
