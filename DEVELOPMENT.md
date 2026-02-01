# Development Guide

This guide covers how to develop and maintain the CIDR Subnet Calculator.

## Prerequisites

- Node.js 18+
- npm 10+

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Security Audit (Required Before Running Any Code)

Always audit dependencies before running or building:

```bash
npm audit
```

If vulnerabilities are found, attempt to fix them:

```bash
npm audit fix
```

If issues persist, use `--force` (which may install breaking changes):

```bash
npm audit fix --force
```

**Important**: Never run dev/test/build without addressing security vulnerabilities.

## Development Commands

### Development Server

```bash
npm run dev
```

Starts the development server with hot module replacement at `http://localhost:5000`

### Type Checking

```bash
npm run check
```

Run TypeScript compiler to check for type errors.

### Testing

```bash
npm run test
```

Run all tests with Vitest. Tests are located in `**/*.test.ts` files.

Interactive test UI:

```bash
npm run test:ui
```

### Building

```bash
npm run build
```

Build the application for production. Outputs to `dist/`:
- `dist/public/` - Client bundle (HTML, CSS, JS)
- `dist/index.cjs` - Server bundle

### Production Server

```bash
npm run start
```

Runs the production build. Requires running `npm run build` first.

## Development Workflow

1. **Audit**: `npm audit` (fix any vulnerabilities first)
2. **Type Check**: `npm run check` (ensure no TypeScript errors)
3. **Test**: `npm run test` (run unit tests)
4. **Dev**: `npm run dev` (start development server)
5. **Build**: `npm run build` (test production build)

## Project Structure

```
client/          # React frontend
├── src/
│   ├── pages/   # Route pages
│   ├── components/
│   │   └── ui/  # Radix UI component library
│   ├── lib/     # Utilities (includes tests)
│   └── hooks/   # Custom React hooks

server/          # Express backend
├── index.ts     # Server entry point
├── routes.ts    # API routes
├── static.ts    # Static file serving
├── vite.ts      # Vite dev server integration
└── storage.ts   # Data persistence interface

shared/          # Shared code
└── schema.ts    # Zod schemas & TypeScript types

script/          # Build & automation
└── build.ts     # Production build script
```

## Testing

The project uses **Vitest** for unit testing. Tests should:

1. **Be located next to source files** with `.test.ts` extension
2. **Test pure functions** (utilities, calculations)
3. **Use descriptive test names** with `describe` and `it`
4. **Cover edge cases** and error conditions

Example test structure:

```typescript
import { describe, it, expect } from "vitest";
import { someFunction } from "./some-file";

describe("someFunction", () => {
  it("handles basic case", () => {
    expect(someFunction("input")).toBe("expected");
  });

  it("throws error for invalid input", () => {
    expect(() => someFunction(null)).toThrow();
  });
});
```

Run tests:

```bash
npm run test              # Run all tests once
npm run test -- --watch  # Watch mode
npm run test:ui          # Interactive UI
```

## Code Quality

### Type Safety

TypeScript is configured in strict mode. Run type checking before committing:

```bash
npm run check
```

### Security

Always run security audits before running any code:

```bash
npm audit
npm audit fix
```

Address vulnerabilities immediately. Breaking changes should be reviewed carefully.

## Common Tasks

### Add a new dependency

```bash
npm install <package-name>
npm audit
npm audit fix
```

Then commit updated `package.json` and `package-lock.json`.

### Add a new test

Create a `.test.ts` file next to the code being tested:

```typescript
// lib/utils.test.ts
import { describe, it, expect } from "vitest";
import { myFunction } from "./utils";

describe("myFunction", () => {
  it("does something", () => {
    expect(myFunction()).toBe("result");
  });
});
```

### Debug tests

```bash
npm run test -- --reporter=verbose
npm run test:ui
```

## Troubleshooting

### Port 5000 already in use

The dev server uses port 5000. If it's in use:

```bash
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process (Windows)
taskkill /PID <PID> /F
```

### Module resolution errors

If you see `Cannot find module` errors:

1. Check path aliases in `tsconfig.json` and `vite.config.ts`
2. Clear node_modules: `rm -r node_modules && npm install`
3. Run type check: `npm run check`

### Build fails

1. Clear dist folder: `rm -r dist`
2. Run audit: `npm audit fix`
3. Install fresh: `npm install`
4. Try build again: `npm run build`

## Performance Tips

- **Dev mode**: Changes compile instantly with HMR
- **Tests**: Only run affected tests with `npm run test -- --changed`
- **Build**: Production build is minified and optimized automatically

## Security Checklist

- [ ] Run `npm audit` before any code changes
- [ ] Address all moderate/high/critical vulnerabilities
- [ ] Review breaking changes from `audit fix --force`
- [ ] Run full test suite before committing
- [ ] Type check passes (`npm run check`)
- [ ] Build succeeds (`npm run build`)
