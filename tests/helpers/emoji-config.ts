/**
 * tests/helpers/emoji-config.ts
 * 
 * Shared emoji detection and replacement configuration.
 * Used by both:
 * - tests/unit/emoji-detection.test.ts (detection and validation)
 * - scripts/fix-emoji.ts (auto-fix tool)
 * 
 * This ensures the test and fix script always use identical rules.
 */

import { readdirSync, statSync } from "fs";
import path from "path";

// ============================================
// Emoji Detection Pattern
// ============================================

/**
 * Unicode emoji patterns that should NOT appear in source files.
 * Blocked patterns cover all major emoji Unicode ranges:
 * - U+1F300-U+1F9FF: Miscellaneous Symbols and Pictographs (main emoji block)
 * - U+2600-U+27BF: Miscellaneous Symbols (weather, symbols, stars, etc.)
 * - U+2700-U+27BF: Dingbats (decorative symbols)
 * - U+1F600-U+1F64F: Emoticons
 * - U+1F300-U+1F5FF: Misc Symbols and Pictographs
 * - U+1F680-U+1F6FF: Transport and Map Symbols
 * - U+1F900-U+1F9FF: Supplemental Symbols and Pictographs
 * 
 * Additional emoji from Letterlike/Technical/Geometric blocks (U+2000-U+25FF):
 * - U+2139: Information Source (ℹ)
 * - U+203C: Double Exclamation Mark (‼)
 * - U+2049: Exclamation Question Mark (⁉)
 * - U+231A-U+231B: Watch, Hourglass
 * - U+23E9-U+23FA: Media control symbols
 * - U+25AA-U+25AB, U+25B6, U+25C0, U+25FB-U+25FE: Geometric shapes used as emoji
 */
export const FORBIDDEN_EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{2139}\u{203C}\u{2049}\u{231A}-\u{231B}\u{23E9}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu;

// ============================================
// Emoji to Text Replacement Map
// ============================================

/**
 * Map of emoji to their text alternatives for auto-fixing.
 * Used by scripts/fix-emoji.ts to replace emoji with plain text.
 */
export const EMOJI_REPLACEMENTS: Record<string, string> = {
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
  "\ud83d\ude80": "Deployment",
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
  "\u2b06\ufe0f": "Up",
  "\u2b07": "Down",
  "\u2b07\ufe0f": "Down",
  "\u27a1": "Next",
  "\u27a1\ufe0f": "Next",
  "\u2b05": "Previous",
  "\u2b05\ufe0f": "Previous",
  "\ud83d\udc40": "See",
  "\ud83d\udce4": "From",
  "\u2611\ufe0f": "Selected",
  "\u2611": "Selected",
  "\u2610": "Unselected",
  
  // Arrows (common in documentation)
  "\u2192": "->",  // Rightwards arrow →
  "\u2190": "<-",  // Leftwards arrow ←
  "\u2191": "^",   // Upwards arrow ↑
  "\u2193": "v",   // Downwards arrow ↓
  "\u21d2": "=>",  // Rightwards double arrow ⇒
  "\u21d0": "<=",  // Leftwards double arrow ⇐
  "\u21d1": "^^",  // Upwards double arrow ⇑
  "\u21d3": "vv",  // Downwards double arrow ⇓
  
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
  "\u2612": "[x]",  // Ballot box with X ☒
  
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

// ============================================
// File Scanning Configuration
// ============================================

/**
 * Directories to exclude from emoji scanning
 */
export const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
]);

/**
 * Files that must not be auto-fixed (they contain emoji as test data or configuration)
 */
export const EXCLUDE_FILES = new Set([
  "tests/unit/emoji-detection.test.ts",
  "scripts/fix-emoji.ts",
  "tests/helpers/emoji-config.ts",
  "tests/integration/emoji.test.ts",
]);

/**
 * File extensions to scan for emoji
 */
export const SCAN_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".js", ".jsx"]);

// ============================================
// Shared Helper Functions
// ============================================

/**
 * Recursively find files to scan for emoji
 */
export function findFiles(dir: string, maxDepth = 10, currentDepth = 0): string[] {
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

/**
 * Replace emoji with text alternatives
 */
export function replaceEmoji(content: string): string {
  let fixed = content;
  
  // Replace each emoji with its text alternative
  for (const [emoji, replacement] of Object.entries(EMOJI_REPLACEMENTS)) {
    // Use global replace to catch all occurrences
    fixed = fixed.replaceAll(emoji, replacement);
  }
  
  return fixed;
}

/**
 * Detect emoji in content and return violations
 */
export function detectEmoji(content: string): Array<{ line: number; content: string }> {
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
