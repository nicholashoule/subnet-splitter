/**
 * scripts/install-hooks.mjs
 *
 * Runs on `npm install` / `npm ci` (the "prepare" script): points git at the
 * committed hooks in .githooks/ (the pre-commit emoji check). Skips quietly when
 * there is no git checkout or no git, e.g. in a container build.
 */

import { execFileSync } from "child_process";
import { existsSync } from "fs";

if (existsSync(".git") && existsSync(".githooks")) {
  try {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  } catch {
    // git not installed or not usable here: hooks are optional, CI runs the same checks
  }
}
