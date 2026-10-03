/**
 * tests/unit/config.test.ts
 *
 * Configuration validation tests to ensure build configs are properly set up.
 * These tests catch configuration issues that could break styling or compilation.
 *
 * Tests:
 * - Tailwind CSS v4 runs through its Vite plugin (Rust engine), with no leftover
 *   v3 config or PostCSS pipeline
 * - The stylesheet's theme maps only to design tokens defined for both themes
 * - Removed build packages stay removed
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import { execFileSync, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../");
const read = (file: string) => fs.readFileSync(path.join(projectRoot, file), "utf-8");

/** Runs a command, returning its trimmed stdout, or null if it cannot run or fails */
function tryRun(file: string, args: string[], cwd = projectRoot): string | null {
  try {
    return execFileSync(file, args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

// A source archive (no .git) has no index to check
const inGitWorkTree = tryRun("git", ["rev-parse", "--is-inside-work-tree"]) === "true";

/**
 * Absolute path of the sh git runs hooks with: on Windows, Git for Windows' bin/sh.exe
 * (which puts its own tools on PATH); elsewhere sh from PATH. Null when there is none.
 * It must be absolute: the hook tests run sh with a PATH that holds only stubs, and
 * child_process looks a bare command name up on the child's PATH (Linux CI failed so).
 */
function findSh(): string | null {
  const candidates: string[] = [];
  const execPath = tryRun("git", ["--exec-path"]); // e.g. C:/Program Files/Git/mingw64/libexec/git-core
  if (process.platform === "win32" && execPath) {
    const gitRoot = path.resolve(execPath, "..", "..", "..");
    candidates.push(path.join(gitRoot, "bin", "sh.exe"), path.join(gitRoot, "usr", "bin", "sh.exe"));
  }
  const fromPath = tryRun("sh", ["-c", "command -v sh"]); // e.g. /usr/bin/sh
  if (fromPath && path.isAbsolute(fromPath)) candidates.push(fromPath);
  return candidates.find((candidate) => tryRun(candidate, ["-c", "echo ok"]) === "ok") ?? null;
}
const sh = tryRun("git", ["--version"]) ? findSh() : null;

describe("Configuration Validation", () => {
  describe("Tailwind CSS v4", () => {
    it("should run through the Vite plugin", () => {
      const viteConfig = read("vite.config.ts");
      expect(viteConfig).toContain('import tailwindcss from "@tailwindcss/vite"');
      expect(viteConfig).toMatch(/plugins:\s*\[[^\]]*tailwindcss\(\)/);
    });

    it("should not keep a v3 config file or a PostCSS pipeline", () => {
      // Either file would start a second, conflicting CSS pipeline
      for (const legacy of ["tailwind.config.ts", "tailwind.config.js", "postcss.config.js", "postcss.config.cjs"]) {
        expect(fs.existsSync(path.join(projectRoot, legacy)), legacy).toBe(false);
      }
    });

    it("should not depend on packages the v4 engine replaces", () => {
      const pkg = JSON.parse(read("package.json"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      // Prefixing and minification are Lightning CSS's job; animations come from tw-animate-css
      for (const removed of ["postcss", "autoprefixer", "tailwindcss-animate", "@tailwindcss/postcss"]) {
        expect(deps, removed).not.toHaveProperty(removed);
      }
      expect(deps.tailwindcss).toMatch(/^\^?4\./);
      expect(deps).toHaveProperty("@tailwindcss/vite");
      expect(deps).toHaveProperty("tw-animate-css");
    });

    it("should import Tailwind, the animation utilities, and a class-based dark variant", () => {
      const css = read("client/src/index.css");
      expect(css).toContain('@import "tailwindcss";');
      expect(css).toContain('@import "tw-animate-css";');
      expect(css).toContain("@custom-variant dark (&:is(.dark *));");
      expect(css).toContain("@theme inline {");
    });

    it("should map theme colors only to tokens defined in both themes", () => {
      const css = read("client/src/index.css");
      const block = (start: string) => {
        const from = css.indexOf(start);
        return css.slice(from, css.indexOf("\n}", from));
      };
      const theme = block("@theme inline {");
      const light = block(":root {");
      const dark = block(".dark {");

      const referenced = [...theme.matchAll(/hsl\(var\(--([\w-]+)\)\)/g)].map((m) => m[1]);
      expect(referenced.length).toBeGreaterThan(10);
      for (const token of referenced) {
        expect(light, `--${token} in :root`).toContain(`--${token}:`);
        expect(dark, `--${token} in .dark`).toContain(`--${token}:`);
      }
    });
  });

  describe("vite.config.ts", () => {
    it("should exist", () => {
      const viteConfigPath = path.join(projectRoot, "vite.config.ts");
      expect(fs.existsSync(viteConfigPath)).toBe(true);
    });
  });

  describe("Emoji check (demojify) and pre-commit hook", () => {
    const pkg = JSON.parse(read("package.json"));

    it("pins demojify once, in the npm scripts that CI and the hook both call", () => {
      expect(pkg.scripts["emoji:check"]).toMatch(/^go run github\.com\/nicholashoule\/demojify-sanitize\/cmd\/demojify@v\d+\.\d+\.\d+ /);
      expect(pkg.scripts["emoji:fix"]).toBe(`${pkg.scripts["emoji:check"]} -sub`);
      expect(read(".github/workflows/ci.yml")).toContain("run: npm run emoji:check");
      expect(read(".githooks/pre-commit")).toContain("npm run --silent emoji:check");
    });

    it("installs the hooks on npm install, without failing an install that lacks scripts/", () => {
      // `|| exit 0` works in sh and cmd.exe: a Docker build that copies package*.json
      // before scripts/ runs `npm ci` while install-hooks.mjs does not exist yet
      expect(pkg.scripts.prepare).toBe("node scripts/install-hooks.mjs || exit 0");
      expect(read("scripts/install-hooks.mjs")).toContain('"core.hooksPath", ".githooks"');
    });

    it("keeps the hook runnable by sh on every OS: shebang, LF endings", () => {
      const hook = read(".githooks/pre-commit");
      expect(hook.startsWith("#!/bin/sh\n")).toBe(true);
      expect(hook).not.toContain("\r");
      expect(read(".gitattributes")).toContain(".githooks/* text eol=lf");
    });

    it.skipIf(!inGitWorkTree)("keeps the hook executable in git", () => {
      const indexEntry = execFileSync("git", ["ls-files", "-s", ".githooks/pre-commit"], { cwd: projectRoot }).toString();
      expect(indexEntry.startsWith("100755 ")).toBe(true);
    });
  });

  // Runs the real hook with sh in a scratch repository. Stubs stand in for go (it
  // reports STUB_GO_VERSION) and for npm, which acts like `npm run emoji:check`:
  // demojify's exit codes, the last -root wins, and the word FORBIDDEN stands in for
  // an emoji. The other tools the hook needs are wrapped, so PATH holds nothing else
  // (no real Go).
  describe.skipIf(!sh)("pre-commit hook behavior", () => {
    const hook = path.join(projectRoot, ".githooks", "pre-commit").replace(/\\/g, "/");
    let tmp: string;
    let toolsDir: string;
    let goDir: string;

    const stubs: Record<string, string> = {
      go: '[ "$1 $2" = "env GOVERSION" ] && echo "$STUB_GO_VERSION"\nexit 0\n',
      npm: [
        "root=.",
        "while [ $# -gt 0 ]; do",
        '  case $1 in',
        '    -version) [ -n "$STUB_DEMOJIFY_BROKEN" ] && echo "go: download failed" >&2 && exit 1; echo "demojify stub"; exit 0 ;;',
        '    -root) root=$2; shift ;;',
        "  esac",
        "  shift",
        "done",
        'echo "scanning $root"',
        'grep -rl FORBIDDEN "$root" && exit 1',
        'echo "[PASS] no findings"',
        "",
      ].join("\n"),
    };

    const writeScript = (file: string, body: string) => {
      fs.writeFileSync(file, `#!/bin/sh\n${body}`, { mode: 0o755 });
    };

    beforeAll(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pre-commit-hook-"));
      toolsDir = path.join(tmp, "tools");
      goDir = path.join(tmp, "go");
      fs.mkdirSync(toolsDir);
      fs.mkdirSync(goDir);
      writeScript(path.join(toolsDir, "npm"), stubs.npm);
      writeScript(path.join(goDir, "go"), stubs.go);
      // Wrap the real tools (found on the current PATH) by absolute path
      for (const tool of ["git", "sed", "mktemp", "rm", "grep"]) {
        const real = execFileSync(sh!, ["-c", `command -v ${tool}`]).toString().trim();
        writeScript(path.join(toolsDir, tool), `exec '${real}' "$@"\n`);
      }
    });

    afterAll(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    /** A scratch repository with `staged` files in the index and `unstaged` only on disk */
    function makeRepo(staged: Record<string, string>, unstaged: Record<string, string> = {}): string {
      const repo = fs.mkdtempSync(path.join(tmp, "repo-"));
      execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
      for (const [name, text] of Object.entries(staged)) fs.writeFileSync(path.join(repo, name), text);
      execFileSync("git", ["add", "."], { cwd: repo, stdio: "ignore" });
      for (const [name, text] of Object.entries(unstaged)) fs.writeFileSync(path.join(repo, name), text);
      return repo;
    }

    /** Runs the hook in `repo`; its temporary directory goes under a fresh TMPDIR */
    function runHook(repo: string, opts: { goVersion?: string; demojifyBroken?: boolean } = {}) {
      const env: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(process.env)) {
        // Drop the real PATH and any GIT_DIR/GIT_INDEX_FILE inherited from a running git
        if (!/^path$|^git_/i.test(key)) env[key] = value;
      }
      env.PATH = (opts.goVersion ? [goDir, toolsDir] : [toolsDir]).join(path.delimiter);
      if (opts.goVersion) env.STUB_GO_VERSION = opts.goVersion;
      if (opts.demojifyBroken) env.STUB_DEMOJIFY_BROKEN = "1";
      const tmpDir = fs.mkdtempSync(path.join(tmp, "tmpdir-"));
      env.TMPDIR = tmpDir.replace(/\\/g, "/");
      const result = spawnSync(sh!, [hook], { cwd: repo, env, encoding: "utf8" });
      return { code: result.status, stderr: result.stderr, stdout: result.stdout, tmpDir };
    }

    it("skips (exit 0) with a message when Go is not installed", () => {
      const { code, stderr } = runHook(makeRepo({ "a.txt": "FORBIDDEN\n" }));
      expect(code).toBe(0);
      expect(stderr).toContain("pre-commit: Go is not installed");
      expect(stderr).toContain("CI still runs it");
    });

    it("skips (exit 0) with a message when Go is older than 1.24", () => {
      const { code, stderr } = runHook(makeRepo({ "a.txt": "FORBIDDEN\n" }), { goVersion: "go1.23.4" });
      expect(code).toBe(0);
      expect(stderr).toContain("pre-commit: found Go 1.23.4");
    });

    it("skips (exit 0) with a message when demojify cannot be downloaded or built", () => {
      const { code, stderr } = runHook(makeRepo({ "a.txt": "FORBIDDEN\n" }), { goVersion: "go1.25.0", demojifyBroken: true });
      expect(code).toBe(0);
      expect(stderr).toContain("go: download failed");
      expect(stderr).toContain("pre-commit: could not run demojify");
    });

    it("fails (exit 1) when a staged file has findings", () => {
      const { code, stdout, stderr } = runHook(makeRepo({ "ok.txt": "fine\n", "bad.txt": "FORBIDDEN\n" }), { goVersion: "go1.25.0" });
      expect(code).toBe(1);
      expect(stdout).toContain("bad.txt");
      expect(stderr).toContain("pre-commit: emoji found in the staged files");
    });

    it("passes (exit 0) when findings are only in unstaged edits or untracked files", () => {
      const repo = makeRepo({ "ok.txt": "fine\n" }, { "ok.txt": "FORBIDDEN\n", "untracked.txt": "FORBIDDEN\n" });
      const { code, stdout } = runHook(repo, { goVersion: "go1.25.0" });
      expect(code).toBe(0);
      expect(stdout).toContain("[PASS] no findings");
    });

    it("removes its temporary export of the index, with or without findings", () => {
      for (const text of ["fine\n", "FORBIDDEN\n"]) {
        const { stdout, tmpDir } = runHook(makeRepo({ "a.txt": text }), { goVersion: "go1.25.0" });
        // The export was made under TMPDIR (Git for Windows' sh rewrites it as /tmp/...),
        // then removed
        expect(stdout).toMatch(new RegExp(`^scanning \\S*/${path.basename(tmpDir)}/`, "m"));
        expect(fs.readdirSync(tmpDir)).toEqual([]);
      }
    });
  });

  describe("Developer instructions", () => {
    it("should tell developers to use a real browser, not VS Code's Simple Browser", () => {
      const instructions = read(".github/instructions/frontend.instructions.md");

      expect(instructions).toContain("real browser");
      expect(instructions).toContain("Simple Browser has HMR issues");
    });
  });
});
