# Emoji Prevention System

This document describes the automated emoji detection and prevention system that helps maintain clean, text-based documentation and code.

## Overview

The emoji prevention system is designed to:
1. **Automatically detect** emoji in documentation and source code during testing
2. **Prevent accidental use** of emoji that can cause token waste
3. **Provide clear alternatives** for common documentation symbols
4. **Support auto-fix capabilities** for quick remediation

## Emoji Coverage

The system detects emoji in 4 Unicode ranges:
- **U+1F300-U+1F9FF** - Main emoji block (examples: Deployment, Report, Lightbulb, etc.)
- **U+2600-U+27BF** - Symbols (examples: Star, Cloud, Warning, etc.)
- **U+2700-U+27BF** - Dingbats (decorative symbols)
- **U+1F600-U+1F64F** - Emoticons and common symbols (examples: Checkmark, Cross-mark, etc.)

It also blocks individual symbols that render as emoji: U+2139, U+203C, U+2049, U+231A-U+231B, U+23E9-U+23FA, U+25AA-U+25AB, U+25B6, U+25C0, and U+25FB-U+25FE. The pattern and the replacement map live in `tests/helpers/emoji-config.ts`, shared by the test and the auto-fix script.

## Text Alternatives

Instead of emoji, use these text-based alternatives in documentation:

| Symbol | Alternative | Use Case |
|--------|-------------|----------|
| Checkmark | `[PASS]` | Test success, affirmation |
| Cross mark | `[FAIL]` | Test failure, error |
| Warning | `WARNING:` | Alert, caution |
| Info | `[INFO]` | Information, note |
| Lightbulb | `TIP:` | Helpful suggestion |
| Rocket | `Deployment` | Launch, release |
| Cloud | `Cloud` | Cloud provider, storage |
| Magnifying glass | `Search` | Find, locate |
| Lock | `Security` | Secure, encrypted |
| Books | `Documentation` | Reference, guide |
| Chart | `Report` | Data, metrics |
| Star | `[FEATURED]` | Highlight, important |

## Testing

### Run Emoji Detection Tests

```bash
npm run test:emoji
# same as: npm run test -- tests/unit/emoji-detection.test.ts --run
```

This test:
- Scans markdown files (.md) for forbidden emoji (except `docs/compliance/`)
- Scans source files (.ts, .tsx, .js, .jsx) for emoji
- Scans configuration files (package.json, tsconfig.json, etc.) for emoji
- Allows common symbols like apostrophes, brackets, and math operators
- Reports any violations with file path and line number

### Example Output

When emoji is found, the test reports exactly where:

```
Found emoji in markdown files:
  docs/guide.md:42 - Report Performance Report
  docs/api.md:156 - Lock Security Features
```

## Auto-Fix Script

The `scripts/fix-emoji.ts` CLI tool can automatically replace emoji with text alternatives:

### Installation (if needed)

The tool is included in the project and requires no additional dependencies.

### Usage

`npm run emoji:check` and `npm run emoji:fix` wrap the first two commands below.

```bash
# Detect emoji (dry-run, no changes)
npx tsx scripts/fix-emoji.ts

# Automatically fix all emoji
npx tsx scripts/fix-emoji.ts --fix

# Detailed output
npx tsx scripts/fix-emoji.ts --fix --verbose

# Show help
npx tsx scripts/fix-emoji.ts --help
```

### Example Output

```
$ npx tsx scripts/fix-emoji.ts --fix --verbose
Scanning 76 files for emoji...

[PASS] Fixed: client/src/pages/calculator.tsx
   Line 394: <the original line, with the emoji>
[SKIP] Protected file: scripts/fix-emoji.ts
[SKIP] Protected file: tests/helpers/emoji-config.ts
[SKIP] Protected file: tests/unit/emoji-detection.test.ts

============================================================
EMOJI SCAN SUMMARY
============================================================

Files with emoji: 1
Total emoji violations: 1
  [PASS] FIXED: client/src/pages/calculator.tsx (1)

Total emoji replaced: 1
[PASS] All emoji have been fixed!

Next steps:
  1. Review the changes: git diff
  2. Run tests: npm run test -- --run
  3. Commit: git add . && git commit -m "fix: replace emoji with text"
============================================================
```

Without `--fix` the script reports `WARNING  FOUND` for each file and exits with code 1 if it found any emoji; a clean scan prints `[PASS] No emoji found. Your codebase is clean!`.

## Supported File Types

The emoji detection system scans:
- **Markdown files** (.md) - Documentation
- **Source files** (.ts, .tsx, .js, .jsx) - Code
- **Configuration files** - package.json, tsconfig.json, vitest.config.ts, etc.
- **Build files** - vite.config.ts, tsconfig.json, etc.

Excluded files:
- `node_modules/` - Dependencies
- `dist/` - Build output
- `.git/` - Version control
- `coverage/` - Test coverage
- `.next/`, `.nuxt/`, `.cache/` - Framework caches (`EXCLUDE_DIRS` in `tests/helpers/emoji-config.ts`)

## Why This Matters

### Token Efficiency

When working with AI coding assistants, emoji in documentation can cause token waste:
- **Each emoji = multiple tokens** (UTF-8 encoding overhead)
- **Reading emoji-filled docs = wasted context** for model understanding
- **Auto-fixing saves**: ~1-3 tokens per emoji across entire codebase

### Consistency

Text-based alternatives are:
- **More accessible** - Works in all terminals and editors
- **More searchable** - `[PASS]` is easier to grep than Checkmark
- **More maintainable** - No special character issues across platforms
- **More professional** - Maintains code documentation standards

### Reliability

Text alternatives avoid:
- **Rendering issues** - Some terminals don't display emoji correctly
- **Encoding problems** - UTF-8 emoji can cause issues in some systems
- **Documentation tools** - Some tools struggle with non-ASCII characters
- **Git diff noise** - Emoji changes can complicate version control

## CI/CD Integration

The emoji detection test is automatically run with:

```bash
npm run test
```

It will cause test failures if emoji is found in:
- Documentation files (except `docs/compliance/`)
- Source code (outside of test definitions)
- Configuration files

This ensures no accidental emoji slips into the repository.

## Common Questions

### Q: Can I use emoji in test data?

**A:** Yes, but only in `tests/unit/emoji-detection.test.ts`, `tests/helpers/emoji-config.ts`, and `scripts/fix-emoji.ts`. These files are specifically designed to test emoji detection and define the mapping of emoji to text alternatives. They're excluded from the detection checks because they're meta-testing files.

### Q: What if I need emoji for a specific reason?

**A:** Submit an issue or discussion describing your use case. The detection system can be configured to allow specific emoji in specific files if there's a valid reason.

### Q: Does this affect markdown code blocks?

**A:** Currently, the system scans all content including code blocks. If you want emoji in code examples or documentation, use the text alternatives instead. This makes your documentation more universal and tool-compatible.

### Q: Can I run the auto-fix automatically?

**A:** Yes! You can add the auto-fix to your pre-commit hooks or CI/CD pipeline:

```bash
# Pre-commit hook example
npx tsx scripts/fix-emoji.ts --fix
```

## Integration with Your Workflow

### Before Committing

```bash
# Run emoji check
npm run test:emoji

# If failures, auto-fix
npm run emoji:fix

# Commit the auto-fixed files
git add -A
git commit -m "fix: remove emoji from documentation"
```

### In CI/CD

The emoji detection test is part of the normal test suite, which the CI workflow (`.github/workflows/ci.yml`) runs on Node.js 24 and 26 for every push to `main` and every pull request:

```bash
npm run test -- --run
```

If any emoji is detected outside of approved test files, the build will fail.

## Maintenance

### Adding New Emoji Alternatives

If you need to add a new emoji to the replacement map:

1. Edit `tests/helpers/emoji-config.ts`
2. Find the `EMOJI_REPLACEMENTS` object
3. Add the emoji and its text alternative:
   ```typescript
   "Target symbol": "Target",  // New entry
   ```
4. The test and the auto-fix script will immediately support the new mapping

### Updating Detection Patterns

The emoji Unicode ranges are in the `FORBIDDEN_EMOJI_PATTERN`:

```typescript
/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{2139}\u{203C}\u{2049}\u{231A}-\u{231B}\u{23E9}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu
```

If you need to exclude or include additional Unicode ranges, update this pattern in `tests/helpers/emoji-config.ts`.

## Related Files

- [tests/unit/emoji-detection.test.ts](../tests/unit/emoji-detection.test.ts) - Test definitions
- [tests/helpers/emoji-config.ts](../tests/helpers/emoji-config.ts) - Detection pattern, emoji mappings, and excluded files (shared by the test and the script)
- [scripts/fix-emoji.ts](../scripts/fix-emoji.ts) - Auto-fix CLI tool
- [.github/copilot-instructions.md](copilot-instructions.md) - Developer guidelines

## Questions?

If you have questions about the emoji prevention system or run into issues, check:
1. This document for common questions
2. The test file for emoji mapping examples
3. The auto-fix tool's `--help` output for CLI documentation

## Emoji Detection & Auto-Fix Workflow

### Step 1: Detect Emoji (Dry-Run)

First, scan the project to see what emoji are present:

```bash
npx tsx scripts/fix-emoji.ts
```

**Output shows:**
- Number of files with emoji
- Total emoji violations found
- Which files contain emoji

### Step 2: Auto-Fix All Emoji

Once you've reviewed what needs fixing, automatically replace all emoji:

```bash
npx tsx scripts/fix-emoji.ts --fix
```

**Output shows:**
- Which files were fixed
- Total emoji replaced
- Summary of changes

### Protected Files

These files are NEVER auto-fixed (`EXCLUDE_FILES` in `tests/helpers/emoji-config.ts`):
- `tests/unit/emoji-detection.test.ts` - Emoji detection tests
- `tests/helpers/emoji-config.ts` - Emoji pattern and mappings
- `scripts/fix-emoji.ts` - Auto-fix script definitions

