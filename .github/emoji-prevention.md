# Emoji Prevention

The repository is emoji-free: code, docs, configuration, and test data use plain text. CI enforces it with [demojify-sanitize](https://github.com/nicholashoule/demojify-sanitize), a Go CLI pinned to `v1.1.0`.

## Commands

Both need Go 1.24 or newer on your `PATH`; `go run` downloads the pinned version on first use.

```bash
# Audit every text file; reports file, line, and column, exits 1 if any emoji is found
npm run emoji:check

# Rewrite affected files: replace emoji with text tokens such as [PASS] and [FAIL]
npm run emoji:fix
```

Both run `go run github.com/nicholashoule/demojify-sanitize/cmd/demojify@v1.1.0 -root . -skip dist`; `emoji:fix` adds `-sub`. The tool skips dependency folders such as `node_modules` and binary and media files on its own; `-skip dist` adds the build output. Review the result of `emoji:fix` with `git diff` before committing: emoji without a text token are removed, not replaced.

## Pre-commit hook

`npm install` (the `prepare` script, `scripts/install-hooks.mjs`) points git at `.githooks/`, whose `pre-commit` hook runs `npm run emoji:check` before every commit and stops the commit if it finds emoji. The hook is POSIX `sh`, which Git for Windows ships, so it behaves the same on Windows, macOS and Linux.

Without Go, or with Go older than 1.24, the hook prints how to install it and lets the commit through; CI still runs the check. The install step does nothing outside a git checkout (for example in a container build).

## Text alternatives

These are the tokens `emoji:fix` writes; use them when writing by hand too.

| Instead of | Write |
|------------|-------|
| check mark | `[PASS]` |
| cross mark | `[FAIL]` |
| warning sign | `[WARNING]` |
| information sign | `[INFO]` |
| light bulb | `[TIP]` |
| rocket | `[DEPLOY]` |

## CI

The `emoji` job in `.github/workflows/ci.yml` sets up Go and runs `npm run emoji:check`, the same audit as the hook, on every push to `main` and every pull request. Any emoji fails the build. It runs once, separately from the Node.js test matrix.

The version is pinned in one place: `@v1.1.0` in the `emoji:check` and `emoji:fix` scripts in `package.json`. CI and the hook both call those scripts.

## Writing tests that need emoji

Build the characters from code points, for example `String.fromCodePoint(0x2705)`, so the source file itself stays emoji-free.

## Why

- **Tokens:** an emoji costs several tokens for AI assistants that read the code and docs; text costs one or two.
- **Search:** `[PASS]` is easy to grep for.
- **Portability:** no rendering or encoding surprises in terminals, editors, diffs, or log processors.
