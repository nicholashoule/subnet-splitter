#!/usr/bin/env node

/**
 * scripts/fix-emoji.ts
 * 
 * Automatically detect and fix emoji in project files.
 * This script scans the entire codebase for emoji and replaces them
 * with text alternatives, saving developer time by preventing token waste.
 * 
 * Usage:
 *   npx ts-node scripts/fix-emoji.ts                  # Detect only
 *   npx ts-node scripts/fix-emoji.ts --fix            # Fix and write files
 *   npx ts-node scripts/fix-emoji.ts --help           # Show help
 * 
 * Examples:
 *   npx ts-node scripts/fix-emoji.ts
 *   npx ts-node scripts/fix-emoji.ts --fix
 *   npx ts-node scripts/fix-emoji.ts --fix --verbose
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  EMOJI_REPLACEMENTS,
  EXCLUDE_FILES,
  findFiles,
  replaceEmoji,
  detectEmoji,
  EXCLUDE_DIRS,
  SCAN_EXTENSIONS,
} from "../tests/helpers/emoji-config.js";

// ============================================
// Main Logic
// ============================================

const args = process.argv.slice(2);
const shouldFix = args.includes("--fix");
const verbose = args.includes("--verbose");
const showHelp = args.includes("--help") || args.includes("-h");

if (showHelp) {
  console.log(`
Fix Emoji - Automatically detect and replace emoji in project files

Usage:
  npx ts-node scripts/fix-emoji.ts [options]

Options:
  --fix              Actually write fixed files (default: dry-run, detect only)
  --verbose          Show detailed output for each file
  --help             Show this help message

Examples:
  # Detect emoji (dry-run)
  npx ts-node scripts/fix-emoji.ts

  # Fix emoji and write files
  npx ts-node scripts/fix-emoji.ts --fix

  # Detailed output
  npx ts-node scripts/fix-emoji.ts --fix --verbose

About:
  This tool automatically replaces emoji with text alternatives.
  It uses the same emoji map as tests/unit/emoji-detection.test.ts
  
  Supported emoji replacements: ${Object.keys(EMOJI_REPLACEMENTS).length}
  File types scanned: ${Array.from(SCAN_EXTENSIONS).join(", ")}
  Directories excluded: ${Array.from(EXCLUDE_DIRS).join(", ")}
`);
  process.exit(0);
}

const projectRoot = process.cwd();
const allFiles = findFiles(projectRoot);

interface FileResult {
  file: string;
  violations: number;
  fixed: number;
  modified: boolean;
}

const results: FileResult[] = [];
let totalViolations = 0;
let totalFixed = 0;

console.log(`Scanning ${allFiles.length} files for emoji...\n`);

for (const file of allFiles) {
  try {
    const relFile = path.relative(projectRoot, file);
    
    // Skip files that must not be auto-fixed
    if (EXCLUDE_FILES.has(relFile.replace(/\\/g, "/"))) {
      if (verbose) {
        console.log(`[SKIP] Protected file: ${relFile}`);
      }
      continue;
    }
    
    const content = readFileSync(file, "utf-8");
    const violations = detectEmoji(content);

    if (violations.length > 0) {
      totalViolations += violations.length;

      if (shouldFix) {
        const fixed = replaceEmoji(content);
        writeFileSync(file, fixed, "utf-8");
        totalFixed += violations.length;

        if (verbose) {
          console.log(`[PASS] Fixed: ${relFile}`);
          violations.forEach((v) => {
            console.log(`   Line ${v.line}: ${v.content}`);
          });
        }

        results.push({
          file: relFile,
          violations: violations.length,
          fixed: violations.length,
          modified: true,
        });
      } else {
        if (verbose) {
          console.log(`WARNING  Found: ${relFile}`);
          violations.forEach((v) => {
            console.log(`   Line ${v.line}: ${v.content}`);
          });
        }

        results.push({
          file: relFile,
          violations: violations.length,
          fixed: 0,
          modified: false,
        });
      }
    }
  } catch (e) {
    // Skip files that can't be read
  }
}

// ============================================
// Summary Report
// ============================================

console.log("\n" + "=".repeat(60));
console.log("EMOJI SCAN SUMMARY");
console.log("=".repeat(60));

if (results.length === 0) {
  console.log("[PASS] No emoji found. Your codebase is clean!");
} else {
  console.log(`\nFiles with emoji: ${results.length}`);
  console.log(`Total emoji violations: ${totalViolations}`);

  results.forEach((r) => {
    const status = r.modified ? "[PASS] FIXED" : "WARNING  FOUND";
    console.log(`  ${status}: ${r.file} (${r.violations})`);
  });

  if (shouldFix) {
    console.log(`\nTotal emoji replaced: ${totalFixed}`);
    console.log("[PASS] All emoji have been fixed!");
    console.log("\nNext steps:");
    console.log("  1. Review the changes: git diff");
    console.log("  2. Run tests: npm run test -- --run");
    console.log("  3. Commit: git add . && git commit -m \"fix: replace emoji with text\"");
  } else {
    console.log("\n[TIP] To fix these emoji, run:");
    console.log("  npx ts-node scripts/fix-emoji.ts --fix");
  }
}

console.log("=".repeat(60) + "\n");

// Exit with error if emoji found and not fixing
process.exit(shouldFix || results.length === 0 ? 0 : 1);
