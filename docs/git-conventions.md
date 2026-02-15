# Git Commit Convention Examples

Full examples and detailed rules for the Conventional Commits specification used in this project.

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Types

| Type | Use Case | Examples |
|------|----------|---------|
| `feat:` | New feature | `feat: add subnet split validation` |
| `fix:` | Bug fix | `fix: correct /31 subnet splitting` |
| `docs:` | Documentation | `docs: update API endpoints` |
| `style:` | Formatting | `style: format code with Prettier` |
| `refactor:` | Restructuring | `refactor: extract subnet tree logic` |
| `test:` | Tests | `test: add subnet calculation tests` |
| `chore:` | Maintenance | `chore: update dependencies` |
| `perf:` | Performance | `perf: optimize subnet tree traversal` |
| `ci:` | CI/CD | `ci: add GitHub Actions workflow` |

## Scopes

- `(api)` -- API endpoints or backend routes
- `(ui)` -- User interface components
- `(validation)` -- Input validation and schemas
- `(errors)` -- Error handling and boundaries
- `(docs)` -- Documentation files
- `(config)` -- Configuration files

## Subject Line Rules

- Imperative mood: "add" not "added" or "adds"
- No capitalization after type
- No trailing period
- 50 characters or less

## Full Examples

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

## Best Practices

1. **One logical change per commit** -- atomic and focused
2. **Write for future developers** -- explain why, not just what
3. **Use imperative mood** -- describes what the commit does when applied
4. **Link to issues** -- `Fixes #123`, `Related to #456`
5. **Review before committing** -- verify changes match message
6. **No WIP commits** -- test before committing
7. **Clean history** -- avoid "oops" or "fix typo"
