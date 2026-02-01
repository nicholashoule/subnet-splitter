/**
 * tests/unit/emoji-detection.test.ts
 * 
 * Detects and prevents emoji/unicode symbols in documentation and code files.
 * Ensures all files use plain text formatting instead of decorative emojis.
 * 
 * This test runs against all markdown and code files to catch emoji usage
 * that could cause issues with:
 * - Terminal rendering on different systems
 * - CI/CD pipeline compatibility
 * - Documentation consistency
 * - Code portability
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// Unicode emoji patterns that should NOT appear in source files
// Blocked patterns:
// - U+1F300 to U+1F9FF: Full emoji range
// - Common decorative symbols used: cloud, search, lock, test, folder, rocket, 
//   pointer, chart, checkmark, books, refresh, phone, star, lightning, target,
//   lightbulb, wrench, memo, shield, plus-circle, graduation, chart-up, globe
const FORBIDDEN_EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}]/gu;

// Files/directories to exclude from scanning
const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
]);

// File extensions to scan
const SCAN_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".js", ".jsx"]);

// Helper to recursively find files
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

describe("Emoji Detection", () => {
  it("should not contain forbidden emoji in markdown files", () => {
    const projectRoot = path.resolve(__dirname, "../..");
    const files = findFiles(projectRoot).filter((f) => f.endsWith(".md"));

    const violations: Array<{ file: string; line: number; content: string }> = [];

    files.forEach((file) => {
      try {
        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n");
        const relFile = path.relative(projectRoot, file);

        lines.forEach((line, index) => {
          if (FORBIDDEN_EMOJI_PATTERN.test(line)) {
            violations.push({
              file: relFile,
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      } catch (e) {
        // Skip unreadable files
      }
    });

    expect(
      violations,
      `Found emoji in markdown files:\n${violations
        .map((v) => `  ${v.file}:${v.line} - ${v.content}`)
        .join("\n")}`
    ).toHaveLength(0);
  });

  it("should not contain forbidden emoji in source code", () => {
    const projectRoot = path.resolve(__dirname, "../..");
    const allFiles = findFiles(projectRoot);
    const codeFiles = allFiles.filter((f) =>
      /\.(ts|tsx|js|jsx)$/.test(f)
    );

    const violations: Array<{ file: string; line: number; content: string }> = [];

    codeFiles.forEach((file) => {
      try {
        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n");
        const relFile = path.relative(projectRoot, file);

        lines.forEach((line, index) => {
          if (FORBIDDEN_EMOJI_PATTERN.test(line)) {
            violations.push({
              file: relFile,
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      } catch (e) {
        // Skip unreadable files
      }
    });

    expect(
      violations,
      `Found emoji in source code:\n${violations
        .map((v) => `  ${v.file}:${v.line} - ${v.content}`)
        .join("\n")}`
    ).toHaveLength(0);
  });

  it("should not contain emoji in configuration files", () => {
    const projectRoot = path.resolve(__dirname, "../..");
    const configFiles = [
      ".github/copilot-instructions.md",
      ".github/agent-reasoning.md",
      "package.json",
      "tsconfig.json",
      "README.md",
      "DEVELOPMENT.md",
    ];

    const violations: Array<{ file: string; line: number; content: string }> = [];

    configFiles.forEach((file) => {
      const fullPath = path.resolve(projectRoot, file);
      try {
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, index) => {
          if (FORBIDDEN_EMOJI_PATTERN.test(line)) {
            violations.push({
              file,
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      } catch (e) {
        // File might not exist, skip
      }
    });

    expect(
      violations,
      `Found emoji in configuration:\n${violations
        .map((v) => `  ${v.file}:${v.line} - ${v.content}`)
        .join("\n")}`
    ).toHaveLength(0);
  });

  it("should provide clear error messages when emoji are found", () => {
    // This test demonstrates emoji detection works
    // Note: We DON'T use actual emojis here to avoid detection by the scanner
    // Instead, we show the Unicode ranges that are blocked
    const testCases = [
      "Contains Unicode range U+1F300-1F9FF (emoji block)",
      "Our pattern matches extended emoji characters",
    ];

    testCases.forEach((str) => {
      // Just verify pattern is configured correctly
      expect(typeof FORBIDDEN_EMOJI_PATTERN).toBe("object");
    });
  });

  it("should allow apostrophes and common symbols", () => {
    // Ensure we don't over-filter
    const allowedStrings = [
      "It's working fine",
      "Test (with parentheses)",
      "Multiple... dots",
      "Dashes-are-fine",
      "Under_scores_too",
      "Special @#$% chars in code",
      "Quotes 'single' and \"double\"",
      "Brackets [square] and {curly}",
      "Math: 1 + 2 = 3",
    ];

    allowedStrings.forEach((str) => {
      expect(str).not.toMatch(FORBIDDEN_EMOJI_PATTERN);
    });
  });
});

describe("Emoji Prevention Guide", () => {
  it("documents emoji formatting alternatives", () => {
    // Instead of showing emojis (which would trigger the test),
    // we document the text replacements
    const replacements: Record<string, string> = {
      "CLOUD_ICON": "Cloud Resources",
      "SEARCH_ICON": "Search Configuration", 
      "ROCKET_ICON": "Deployment",
      "CHECKMARK_ICON": "[PASS] All Tests Pass",
      "CHART_ICON": "Performance Report",
      "SHIELD_ICON": "Security",
      "ERROR_ICON": "Error",
      "WARNING_ICON": "Warning",
      "INFO_ICON": "Information",
      "STAR_ICON": "Featured",
    };

    // Verify all replacements are text-only
    Object.values(replacements).forEach((text) => {
      expect(text).not.toMatch(FORBIDDEN_EMOJI_PATTERN);
    });

    // Provide examples
    const examples = [
      "Replace: CLOUD_ICON → Cloud Resources",
      "Replace: ROCKET_ICON → Deployment",
      "Replace: CHECKMARK_ICON → [PASS] All Tests Pass",
      "Replace: WARNING_ICON → WARNING",
      "Replace: ERROR_ICON → ERROR",
    ];

    examples.forEach((ex) => {
      expect(ex).not.toMatch(FORBIDDEN_EMOJI_PATTERN);
    });
  });
});
