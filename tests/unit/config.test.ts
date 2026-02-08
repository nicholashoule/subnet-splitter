/**
 * tests/unit/config.test.ts
 * 
 * Configuration validation tests to ensure build configs are properly set up.
 * These tests catch configuration issues that could break styling or compilation.
 * 
 * Tests:
 * - Tailwind CSS content paths are valid
 * - PostCSS configuration doesn't have experimental options
 * - No experimental/unsupported config patterns used
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../");

describe("Configuration Validation", () => {
  describe("tailwind.config.ts", () => {
    it("should use standard glob patterns in content paths", () => {
      const tailwindConfigPath = path.join(projectRoot, "tailwind.config.ts");
      const configContent = fs.readFileSync(tailwindConfigPath, "utf-8");

      // Check for standard glob patterns - accept various valid formats
      const hasStandardPatterns =
        configContent.includes("./client/**/*.{js,jsx,ts,tsx}") ||
        configContent.includes('./client/**/*.{js,jsx,ts,tsx}') ||
        configContent.includes("./client/src/**/*.tsx") ||
        configContent.includes("./client/index.html"); // Also valid if separate

      expect(hasStandardPatterns).toBe(true);
    });

    it("should not use experimental import.meta.url path resolution", () => {
      const tailwindConfigPath = path.join(projectRoot, "tailwind.config.ts");
      const configContent = fs.readFileSync(tailwindConfigPath, "utf-8");

      // These patterns indicate experimental/problematic configurations
      const hasExperimentalPattern =
        configContent.includes('import.meta.url') &&
        (configContent.includes('fileURLToPath') || configContent.includes('dirname'));

      expect(hasExperimentalPattern).toBe(false);
    });

    it("should have content array defined (not empty)", () => {
      const tailwindConfigPath = path.join(projectRoot, "tailwind.config.ts");
      const configContent = fs.readFileSync(tailwindConfigPath, "utf-8");

      // Check that content is not empty
      const contentMatch = configContent.match(/content:\s*\[([\s\S]*?)\]/);
      expect(contentMatch).toBeTruthy();

      if (contentMatch) {
        const contentValue = contentMatch[1].trim();
        // Should not be empty
        expect(contentValue.length).toBeGreaterThan(0);
        // Should not just be comments
        expect(contentValue.replace(/\/\/.*$/gm, "").trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe("postcss.config.js", () => {
    it("should have clean tailwindcss plugin config", () => {
      const postcssConfigPath = path.join(projectRoot, "postcss.config.js");
      const configContent = fs.readFileSync(postcssConfigPath, "utf-8");

      // Should not have experimental 'from' option
      expect(configContent).not.toContain("from: undefined");
      expect(configContent).not.toContain("from:");
    });

    it("should have autoprefixer configured", () => {
      const postcssConfigPath = path.join(projectRoot, "postcss.config.js");
      const configContent = fs.readFileSync(postcssConfigPath, "utf-8");

      expect(configContent).toContain("autoprefixer");
    });

    it("should not have nested complex plugin options", () => {
      const postcssConfigPath = path.join(projectRoot, "postcss.config.js");
      const configContent = fs.readFileSync(postcssConfigPath, "utf-8");

      // Simple plugins config is better - tailwindcss: {} is ideal
      const tailwindPluginMatch = configContent.match(/tailwindcss:\s*\{([^}]*)\}/);
      if (tailwindPluginMatch) {
        const pluginOptions = tailwindPluginMatch[1].trim();
        // If there are options, they should be minimal/standard
        // Empty {} is preferred
        expect(pluginOptions.length).toBeLessThan(50); // Should be nearly empty
      }
    });
  });

  describe("vite.config.ts", () => {
    it("should exist and be readable", () => {
      const viteConfigPath = path.join(projectRoot, "vite.config.ts");
      expect(fs.existsSync(viteConfigPath)).toBe(true);
    });
  });

  describe("Build Outputs", () => {
    it("should not reference simple browser as primary dev environment", () => {
      // This is a documentation check - the copilot instructions should mention
      // using real browsers for dev work
      const instructionsPath = path.join(projectRoot, ".github/copilot-instructions.md");
      const instructions = fs.readFileSync(instructionsPath, "utf-8");

      // Should mention Simple Browser limitations
      expect(instructions).toContain("Simple Browser");
      expect(instructions).toContain("real browser");
    });
  });
});
