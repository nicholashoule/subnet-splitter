/**
 * scripts/install-hooks.mjs
 *
 * Runs on `npm install` / `npm ci` (the "prepare" script): points git at the
 * committed hooks in .githooks/ (the pre-commit emoji check). Does nothing when
 * there is no git checkout or no git.
 *
 * The script runs as `node scripts/install-hooks.mjs || exit 0` (works in sh and
 * cmd.exe), so an install never fails because of it: a container build that copies
 * package*.json before scripts/ runs `npm ci` while this file does not exist yet.
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
