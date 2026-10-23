# Emoji Prevention

The repository is emoji-free: code, docs, configuration, and test data use plain text. CI enforces it with [demojify-sanitize](https://github.com/nicholashoule/demojify-sanitize), a Go CLI pinned to `v1.2.0`.

## Commands

Both need Go 1.24 or newer on your `PATH`; `go run` downloads the pinned version on first use.

```bash
# Audit every text file; reports file, line, and column, exits 1 if any emoji is found
npm run emoji:check

# Rewrite affected files: replace emoji with text tokens such as [PASS] and [FAIL]
npm run emoji:fix
```

Both run `go run github.com/nicholashoule/demojify-sanitize/cmd/demojify@v1.2.0 -root . -skip dist`; `emoji:fix` adds `-sub`. The tool skips dependency folders such as `node_modules` and binary and media files on its own; `-skip dist` adds the build output. Review the result of `emoji:fix` with `git diff` before committing: emoji without a text token are removed, not replaced.

## Pre-commit hook

`npm install` (the `prepare` script, `scripts/install-hooks.mjs`) points git at `.githooks/`, whose `pre-commit` hook runs two checks before every commit, in this order, and stops the commit at the first that finds problems:

1. `npm run governance:check`: [repogov](https://github.com/nicholashoule/repogov) (pinned to `v0.9.0`) checks its config (`.github/repogov-config.json`), the `.github/` layout (`applyTo` front matter on `.github/instructions/*.instructions.md`) and every Markdown file's line limit
2. `npm run emoji:check`: demojify

The hook is POSIX `sh`, which Git for Windows ships, so it behaves the same on Windows, macOS and Linux.

The hook checks exactly what the commit records: it exports the index (`git checkout-index`) to a temporary directory, runs `npm run governance:check -- -root <that directory>` and `npm run emoji:check -- -root <that directory>` there (both tools keep the last `-root`, so the versions stay pinned in `package.json` only), and removes the directory afterwards. Unstaged edits and untracked or ignored files never block a commit; previously committed files are part of the index, so they are checked too.

It fails the commit (exit 1) only when a check reports findings; when repogov fails, demojify does not run. A check that cannot run is skipped with the reason, and CI still runs it:

- Go is not installed, or is older than 1.24 (both checks are skipped; it prints where to get Go)
- repogov or demojify cannot be downloaded or built, for example offline (each is built first, with `npm run governance:check -- version` and `npm run emoji:check -- -version`, so such a failure is never reported as findings; the other tool still runs)
- the index cannot be exported

The `prepare` script is `node scripts/install-hooks.mjs || exit 0`, so it never fails an install. It does nothing outside a git checkout, and a container build that copies `package*.json` before `scripts/` can run `npm ci` before the file exists. `tests/unit/config.test.ts` runs the hook with stub `go` and `npm` commands in scratch repositories: no Go, Go older than 1.24, either tool or both unable to run, repogov findings (demojify then does not run), emoji in staged files, findings only in unstaged or untracked files, and removal of the temporary export. The install script's no-checkout and missing-file cases are covered by its `|| exit 0` and existence checks, not by tests.

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

The `repo-checks` job in `.github/workflows/ci.yml` sets up Go and runs `npm run governance:check`, then `npm run emoji:check`: the hook's checks, in the hook's order, on every push to `main` and every pull request. Any emoji fails the build. It runs once, separately from the Node.js test matrix.

The version is pinned in one place: `@v1.2.0` in the `emoji:check` and `emoji:fix` scripts in `package.json`. CI and the hook both call those scripts.

## Writing tests that need emoji

Build the characters from code points, for example `String.fromCodePoint(0x2705)`, so the source file itself stays emoji-free.

## Why

- **Tokens:** an emoji costs several tokens for AI assistants that read the code and docs; text costs one or two.
- **Search:** `[PASS]` is easy to grep for.
- **Portability:** no rendering or encoding surprises in terminals, editors, diffs, or log processors.
