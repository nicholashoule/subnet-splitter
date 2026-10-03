/**
 * scripts/install-hooks.mjs
 *
 * Runs on `npm install` / `npm ci` (the "prepare" script): points git at the
 * committed hooks in .githooks/ (the pre-commit emoji check). Does nothing when
 * there is no git checkout or no git, and leaves an existing core.hooksPath alone
 * (a global gitleaks or husky setup, say): it prints how to opt in instead.
 *
 * The script runs as `node scripts/install-hooks.mjs || exit 0` (works in sh and
 * cmd.exe), so an install never fails because of it: a container build that copies
 * package*.json before scripts/ runs `npm ci` while this file does not exist yet.
 */

import { execFileSync } from "child_process";
import { existsSync } from "fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

if (existsSync(".git") && existsSync(".githooks")) {
  let current = "";
  try {
    current = git("config", "--get", "core.hooksPath");
  } catch {
    // Not set (git exits 1), or git is not usable here
  }
  try {
    if (current === "") {
      git("config", "core.hooksPath", ".githooks");
    } else if (current !== ".githooks") {
      console.log(
        `core.hooksPath is already "${current}", so the emoji pre-commit hook was not installed. ` +
        "To use it here instead: git config core.hooksPath .githooks"
      );
    }
  } catch {
    // git not installed or not usable here: hooks are optional, CI runs the same checks
  }
}
