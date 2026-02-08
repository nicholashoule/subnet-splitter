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

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import path from "path";

// ============================================
// Configuration - Match tests/unit/emoji-detection.test.ts
// ============================================

const FORBIDDEN_EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{2139}\u{203C}\u{2049}\u{231A}-\u{231B}\u{23E9}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu;

const EMOJI_REPLACEMENTS: Record<string, string> = {
  // Information
  "\u2139\ufe0f": "INFO",
  "\u2139": "INFO",
  // Warning and alerts
  "\u26a0\ufe0f": "WARNING",
  "\u26a0": "WARNING",
  // Status symbols
  "\u2705": "[PASS]",
  "\u2713": "[PASS]",
  "\u2714": "[PASS]",  // Heavy check mark ✔
  "\u2714\ufe0f": "[PASS]",
  "\u274c": "[FAIL]",
  "\u2717": "[FAIL]",
  "\u2718": "[FAIL]",  // Heavy ballot X ✘
  "\u274e": "[FAIL]",  // Negative squared cross mark
  "\u2757": "[ALERT]",
  "\u2755": "[ALERT]",  // White exclamation mark
  "\u203c": "[ALERT]",  // Double exclamation ‼
  "\u203c\ufe0f": "[ALERT]",
  // Favorites and highlights
  "\u2b50": "[FEATURED]",
  "\u2605": "[FEATURED]",  // Filled star ★
  "\u2606": "[FEATURED]",  // Hollow star ☆
  "\ud83d\udca1": "[TIP]",
  "\ud83d\udd14": "[NOTIFICATION]",
  "\ud83d\udccc": "[PINNED]",
  "\ud83d\udd11": "[KEY]",
  "\ud83d\udd12": "LOCKED",
  "\ud83d\udd13": "UNLOCKED",
  
  // Cloud and deployment
  "\u2601\ufe0f": "Cloud",
  "\u2601": "Cloud",
  "\ud83d\udcca": "Report",
  "\ud83d\udcc8": "Growth",
  "\ud83d\udcc9": "Decline",
  "\ud83d\udcda": "Documentation",
  "\ud83d\udcd6": "Guide",
  "\ud83d\udcdd": "Note",
  "\ud83d\udcc1": "Directory",
  "\ud83d\udcc2": "Folder",
  "\ud83d\udd0d": "Search",
  "\ud83d\udd0e": "Search",
  "\ud83d\udd10": "Security",
  "\u2699": "Configuration",
  "\u2699\ufe0f": "Configuration",
  "\u26a1": "Settings",
  "\ud83c\udfd7": "Build",
  "\ud83c\udfaf": "Target",
  "\ud83c\udfa8": "Design",
  "\ud83d\udcbb": "Code",
  "\ud83d\udda5": "Server",
  "\ud83c\udf10": "Network",
  "\ud83c\udf0e": "Global",
  "\ud83d\uddfa": "Map",
  "\ud83d\udccd": "Map",
  
  // Status indicators
  "\u23f3": "Pending",
  "\u23f1": "Timer",
  "\u23f0": "Timer",
  "\ud83d\udd04": "Refresh",
  "\u231b": "Loading",
  "\u2b06": "Up",
  "\u2b07": "Down",
  "\u27a1": "Next",
  "\u2b05": "Previous",
  "\ud83d\udc40": "See",
  "\ud83d\udce4": "From",
  "\u2611\ufe0f": "Selected",
  
  // Arrows (common in documentation)
  "\u2192": "->",  // Rightwards arrow →
  "\u2190": "<-",  // Leftwards arrow ←
  "\u2191": "^",   // Upwards arrow ↑
  "\u2193": "v",   // Downwards arrow ↓
  "\u21d2": "=>",  // Rightwards double arrow ⇒
  "\u21d0": "<=",  // Leftwards double arrow ⇐
  "\u21d1": "^^",  // Upwards double arrow ⇑
  "\u21d3": "vv",  // Downwards double arrow ⇓
  "\u27a1\ufe0f": "->",  // Black rightwards arrow with FE0F
  "\u2b05\ufe0f": "<-",  // Leftwards black arrow with FE0F
  "\u2b06\ufe0f": "^",   // Upwards black arrow with FE0F
  "\u2b07\ufe0f": "v",   // Downwards black arrow with FE0F
  
  // Geometric shapes (bullet points)
  "\u25cf": "*",   // Black circle ●
  "\u25cb": "o",   // White circle ○
  "\u25a0": "*",   // Black square ■
  "\u25a1": "[]",  // White square □
  "\u25b2": "^",   // Black up-pointing triangle ▲
  "\u25b3": "^",   // White up-pointing triangle △
  "\u25bc": "v",   // Black down-pointing triangle ▼
  "\u25bd": "v",   // White down-pointing triangle ▽
  "\u25c6": "*",   // Black diamond ◆
  "\u25c7": "<>",  // White diamond ◇
  "\u25aa": "*",   // Black small square ▪
  "\u25ab": "[]",  // White small square ▫
  
  // Checkboxes
  "\u2611": "[x]",  // Ballot box with check ☑
  "\u2612": "[x]",  // Ballot box with X ☒
  "\u2610": "[ ]",  // Ballot box ☐
  
  // Common dingbats
  "\u2764": "<3",   // Heavy black heart ❤
  "\u2764\ufe0f": "<3",
  "\u2665": "<3",   // Black heart suit ♥
  "\u2665\ufe0f": "<3",
  "\u2666": "<>",   // Black diamond suit ♦
  "\u2666\ufe0f": "<>",
  "\u2022": "*",    // Bullet •
  "\u2023": ">",    // Triangular bullet ‣
  "\u25e6": "o",    // White bullet ◦
  "\u2219": "*",    // Bullet operator ∙
};

const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
]);

// Files that must not be auto-fixed (they contain emoji as test data or configuration)
const EXCLUDE_FILES = new Set([
  "tests/unit/emoji-detection.test.ts",
  "scripts/fix-emoji.ts",
  "tests/integration/emoji.test.ts",
]);

const SCAN_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".js", ".jsx"]);

// ============================================
// Helper Functions
// ============================================

function findFiles(dir: string, maxDepth = 10, currentDepth = 0): string[] {
  if (currentDepth > maxDepth) return [];
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry)) {
          files.push(...findFiles(fullPath, maxDepth, currentDepth + 1));
        }
      } else if (stat.isFile()) {
        const ext = path.extname(entry);
        if (SCAN_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (e) {
    // Skip directories we can't read
  }

  return files;
}

function replaceEmoji(content: string): string {
  let fixed = content;
  for (const [emoji, replacement] of Object.entries(EMOJI_REPLACEMENTS)) {
    fixed = fixed.replaceAll(emoji, replacement);
  }
  return fixed;
}

function detectEmoji(content: string): Array<{ line: number; content: string }> {
  const violations: Array<{ line: number; content: string }> = [];
  const lines = content.split("\n");
  
  lines.forEach((line, index) => {
    if (FORBIDDEN_EMOJI_PATTERN.test(line)) {
      violations.push({
        line: index + 1,
        content: line.trim(),
      });
    }
  });
  
  return violations;
}

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
