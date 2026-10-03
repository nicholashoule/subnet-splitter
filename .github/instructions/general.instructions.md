---
applyTo: "**"
---

# General Project Instructions

## Project Overview

**CIDR Subnet Calculator** -- modern web app for subnet calculation, recursive CIDR splitting, and Kubernetes network planning.

**Key Goals:** accurate CIDR calculations, clean performant UI, no horizontal scrollbars, bulk operations, security by design (no database, client-side logic).

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS 4, shadcn/ui, Vite 8 (forms use plain React state) |
| **Backend** | Express.js 5, TypeScript, Node.js 24 or 26, Zod 3, no database |
| **Testing** | Vitest 5 (unit + integration), supertest |
| **Dev Tools** | TypeScript 5.6 strict mode, Tailwind CSS v4 (Vite plugin), tsx, esbuild (server bundle) |

## Project Structure

```
client/src/         # React frontend (components, hooks, lib, pages)
server/             # Express backend (routes, CSP, middleware, OpenAPI)
shared/             # Shared TypeScript types and Zod schemas
tests/unit/         # Unit tests
tests/integration/  # Integration tests
scripts/            # Build, smoke test, and emoji tools
docs/               # API reference, compliance audits, test audit
```

## Running the Project

Requires Node.js 24 or 26 (`engines`) and npm 11.

```bash
npm.cmd ci               # Install exact dependencies from package-lock.json
npm.cmd run dev          # Dev server, API + client via Vite middleware (127.0.0.1:5000)
npm.cmd run build        # Client to dist/public, server bundle to dist/index.cjs
npm.cmd run start        # Production server (node dist/index.cjs)
npm.cmd run smoke        # Start dist/index.cjs on port 5099 and check it over HTTP
npm.cmd run check        # TypeScript type checker
npm.cmd run test         # Vitest test suite (watch; add -- --run to run once)
```

`npm run dev` hot-reloads React and CSS; restart it after server changes. Environment: `PORT` (default `5000`), `HOST` (default `0.0.0.0` in production, `127.0.0.1` in development), `TRUST_PROXY` (default `false`). Health checks: `/health`, `/health/ready`, `/health/live` (also under `/api/v1`).

## Security Audit Protocol (MANDATORY)

**Run before ANY code execution:**

```bash
npm run audit           # Step 1: Check vulnerabilities (npm audit)
npm run audit:fix       # Step 2: Fix if needed (npm audit fix)
npm run audit           # Step 3: Verify 0 vulnerabilities
npm run check           # Step 4: TypeScript compilation
```

See [docs/compliance/security-reference.md](../../docs/compliance/security-reference.md) for detailed security configuration.

## Pre-Commit Checklist

```bash
npm audit              # 0 vulnerabilities required
npm run check          # No TypeScript errors
npm run test -- --run  # All tests pass
npm run build          # Production build succeeds
npm run smoke          # Built server passes the smoke checks
```

CI (`.github/workflows/ci.yml`) runs the same steps on Node.js 24 and 26; see [testing instructions](testing.instructions.md#continuous-integration).

## Git Commit Conventions

Format: `<type>(<scope>): <subject>`

| Type | Use |
|------|-----|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `style:` | Formatting (no logic change) |
| `refactor:` | Code restructuring |
| `test:` | Adding/updating tests |
| `chore:` | Maintenance, dependencies |
| `perf:` | Performance improvement |
| `ci:` | CI/CD changes |

**Scopes:** `(api)`, `(ui)`, `(validation)`, `(errors)`, `(docs)`, `(config)`

**Rules:** imperative mood, no capitalization after type, no trailing period, 50-char limit.

See [docs/git-conventions.md](../../docs/git-conventions.md) for full examples.

## Agent Guidelines

1. **Type Safety** -- TypeScript strict mode, no `any` without justification
2. **Cross-Platform** -- Windows primary dev environment; npm scripts set no inline env vars (`NODE_ENV=production` is inlined at build time)
3. **Performance** -- subnet calculations client-side, optimize React re-renders
4. **UI/UX** -- no horizontal scrollbars, shadcn/ui components, dark/light mode support
5. **Testing** -- run `npm run dev`, `npm run check`, test both themes
6. **Icons** -- use Lucide React only, no unicode icons
7. **Emoji** -- use text alternatives (`[PASS]`, `[FAIL]`, `WARNING:`) per [emoji-prevention.md](../emoji-prevention.md)

## Agent Token Optimization

- Use `grep_search` with `includePattern` for targeted searches
- Use `semantic_search` only for natural language matching
- Read 100+ lines per `read_file` call to capture full context
- Use `multi_replace_string_in_file` for batched edits
- Parallelize independent `read_file` and `grep_search` calls
- Reuse discovered file paths; don't re-search

| Task | Best Tool |
|------|-----------|
| Exact string search | `grep_search` |
| Function usage | `list_code_usages` |
| Concept search | `semantic_search` |
| File discovery | `file_search` |
| Type errors | `get_errors` |
| Multi-edit | `multi_replace_string_in_file` |

## Common Tasks

### Adding a Feature
1. Create component in `client/src/components/`
2. Add types to `shared/schema.ts` if needed (keep it dependency-free)
3. Validate input with plain React state and a validator function (e.g., `validateCidrInput()` in `client/src/lib/subnet-utils.ts`)
4. Style with Tailwind CSS, test with `npm run dev`

### Fixing a Bug
1. Identify file and line, write minimal repro
2. Fix maintaining type safety, test in dev
3. Verify no regressions in related features

## Key References

- [Backend instructions](backend.instructions.md)
- [Frontend instructions](frontend.instructions.md)
- [Testing instructions](testing.instructions.md)
- [Emoji prevention](../emoji-prevention.md)
- [Security reference](../../docs/compliance/security-reference.md)
- [Test suite analysis](../../docs/test-suite-analysis.md)
- [API reference](../../docs/api.md)
