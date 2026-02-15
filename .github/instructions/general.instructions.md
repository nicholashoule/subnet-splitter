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
| **Frontend** | React 18, TypeScript, Tailwind CSS, shadcn/ui, React Hook Form, Zod, Vite, TanStack Query |
| **Backend** | Express.js 5, TypeScript, Node.js, no database |
| **Testing** | Vitest 3+, 406 tests (218 unit + 188 integration) |
| **Dev Tools** | TypeScript strict mode, PostCSS, tsx |

## Project Structure

```
client/src/         # React frontend (components, hooks, lib, pages)
server/             # Express backend (routes, CSP, middleware, OpenAPI)
shared/             # Shared TypeScript types and Zod schemas
tests/unit/         # Unit tests (6 files)
tests/integration/  # Integration tests (7 files)
scripts/            # Build and CLI tools
docs/               # API reference, compliance audits, test audit
```

## Running the Project

```bash
npm.cmd install          # Install dependencies
npm.cmd run dev          # Development server (127.0.0.1:5000)
npm.cmd run build        # Production build
npm.cmd run start        # Production server
npm.cmd run check        # TypeScript type checker
npm.cmd run test         # Vitest test suite
npm.cmd run test:ui      # Vitest interactive UI
```

## Security Audit Protocol (MANDATORY)

**Run before ANY code execution:**

```bash
npm audit               # Step 1: Check vulnerabilities
npm audit fix --force   # Step 2: Fix if needed
npm audit               # Step 3: Verify 0 vulnerabilities
npm run check           # Step 4: TypeScript compilation
```

See [docs/security-reference.md](../../docs/security-reference.md) for detailed security configuration.

## Pre-Commit Checklist

```bash
npm audit              # 0 vulnerabilities required
npm run check          # No TypeScript errors
npm run test -- --run  # All 406 tests pass
npm run build          # Production build succeeds
```

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
2. **Cross-Platform** -- Windows primary dev environment, use `cross-env` for env vars
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
2. Add types to `shared/schema.ts` if needed
3. Use React Hook Form + Zod for validation
4. Style with Tailwind CSS, test with `npm run dev`

### Fixing a Bug
1. Identify file and line, write minimal repro
2. Fix maintaining type safety, test in dev
3. Verify no regressions in related features

## Key References

- [Backend instructions](.github/instructions/backend.instructions.md)
- [Frontend instructions](.github/instructions/frontend.instructions.md)
- [Testing instructions](.github/instructions/testing.instructions.md)
- [Agent reasoning](docs/archive/agent-reasoning.md)
- [Emoji prevention](.github/emoji-prevention.md)
- [Security reference](docs/security-reference.md)
- [Test audit](docs/TEST_AUDIT.md)
- [API reference](docs/api.md)
