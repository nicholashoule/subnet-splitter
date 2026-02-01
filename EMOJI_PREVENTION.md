# Emoji & Unicode Detection Prevention

This document describes how the project prevents emoji and decorative Unicode characters from being committed.

## Why Prevent Emoji?

Emoji can cause issues with:
- Terminal rendering on different systems and CI/CD pipelines
- Documentation consistency across platforms
- Code portability and reproducibility
- Git diffs becoming cluttered with encoding issues
- Markdown and documentation parsers

## Automated Detection

A test suite automatically detects forbidden emoji in all markdown and source files:

```bash
npm run test -- tests/unit/emoji-detection.test.ts --run
```

**Test Coverage**:
- Scans all `.md`, `.ts`, `.tsx`, `.js`, `.jsx` files
- Excludes: `node_modules`, `dist`, `.git`, `coverage`
- Reports: filename, line number, and content
- Blocks entire Unicode emoji range (U+1F300 to U+1F9FF)

## Forbidden Characters

Blocked emoji categories (Unicode range U+1F300-U+1F9FF):
- General emoji and symbols
- Weather, transport, objects
- Activities and symbols  
- Hands and person indicators
- Communication and tech icons

## Text Replacements

Replace emoji with these text alternatives:

| Unicode Range | Use Case | Replacement |
|---------------|----------|-------------|
| U+1F300-U+1F32F | Weather/objects | Use text description |
| U+1F600-U+1F64F | Faces/emotions | Use text description |
| U+1F680-U+1F6FF | Transport | Use text description |
| U+1F900-U+1F9FF | Symbols/objects | Use text description |

### Common Replacements

| What You Want | Use This Instead |
|---|---|
| Cloud/environment icon | `Cloud` or section header |
| Search/find icon | `Search` or `Find` |
| Security/lock icon | `Security` or `SECURITY` |
| Launch/deploy icon | `Deployment` or `Deploy` |
| Success/checkmark icon | `[PASS]` or `Success` |
| Error/X mark icon | `[FAIL]` or `ERROR` |
| Warning/triangle icon | `WARNING` or `[WARN]` |
| Chart/graph icon | Section heading or `Report` |
| Lightbulb icon | `TIP:` or `Note:` |
| Shield icon | `Security` or `Protected` |
| Star icon | `Featured` or `Important` |
| Book icon | `Documentation` or section header |

## Before Committing

1. **Run emoji detection test**:
   ```bash
   npm run test -- tests/unit/emoji-detection.test.ts --run
   ```

2. **Verify no new emoji**:
   ```bash
   npm run test -- --run
   ```

3. **Commit changes**:
   ```bash
   git add .
   git commit -m "feat: your changes here"
   ```

## If Emoji Are Detected

The test will report violations with file path, line number, and content:

```
Found emoji in markdown files:
  docs/README.md:15 - ### Cloud Architecture section
  server/index.ts:42 - // Deploy to production
```

**Fix immediately**:

### Example Fix

**Before (with emoji)**:
```
### Cloud Architecture heading

Here's how deployment works.
```

**After (emoji removed)**:
```
### Cloud Architecture

Here's how our deployment works.
```

Here's how our deployment works.
```

### Text Emphasis Alternatives

Instead of emoji for visual emphasis:

- ✅ Use: `**Bold**` for headers
- ✅ Use: `> Block quote` for important info
- ✅ Use: `## Heading` for sections
- ✅ Use: `- Bullet points` for lists
- ✅ Use: `WARNING:` prefix for warnings
- ❌ Don't use: emoji for decoration

## Integration with Pre-Commit

To add this as a pre-commit hook (future):

```bash
npm install husky lint-staged --save-dev
npx husky install
```

Add to `.husky/pre-commit`:
```bash
#!/bin/sh
npm run test -- tests/unit/emoji-detection.test.ts --run
```

## File-Specific Rules

### Markdown Files (.md)
- No decorative emoji in headings
- No emoji in code examples
- No emoji in documentation text
- Emoji list files: Use text descriptions only

### Source Code (.ts, .tsx, .js, .jsx)
- No emoji in comments
- No emoji in strings (except test files)
- No emoji in variable names
- String literals must be emoji-free

### Configuration Files
- No emoji in package.json
- No emoji in tsconfig.json
- No emoji in any JSON/YAML config
- No emoji in markdown config files

## Exceptions

None. All emoji are blocked universally.

**Rationale**: Platform consistency is critical. Even if emoji render correctly locally, they may fail in:
- CI/CD pipelines
- Remote terminals
- Different operating systems
- Document parsing tools
- Git hosting platforms

## Enforcement

This is enforced through:

1. **Automated Test**: `tests/unit/emoji-detection.test.ts` runs on every `npm test`
2. **Build Validation**: Test suite must pass before deployment
3. **Code Review**: All PRs checked for emoji before merge
4. **Documentation**: This guide explains the rationale

## Questions?

If you need to document something that traditionally uses emoji:

- **Cloud infrastructure**: Use `Cloud` or section heading
- **Deployment/launch**: Use `Deployment` or `Deploy`
- **Success/pass**: Use `[PASS]` or success indicator text
- **Warning/alert**: Use `WARNING:` prefix
- **Important/featured**: Use `Important:` prefix or bold text

Always prefer clear, descriptive text over visual emoji indicators.

---

**Last Updated**: February 1, 2026  
**Test File**: [tests/unit/emoji-detection.test.ts](../tests/unit/emoji-detection.test.ts)
