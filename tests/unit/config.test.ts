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

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../");
const read = (file: string) => fs.readFileSync(path.join(projectRoot, file), "utf-8");

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
    it("should exist and be readable", () => {
      const viteConfigPath = path.join(projectRoot, "vite.config.ts");
      expect(fs.existsSync(viteConfigPath)).toBe(true);
    });
  });

  describe("Build Outputs", () => {
    it("should not reference simple browser as primary dev environment", () => {
      // This is a documentation check - the copilot instructions should mention
      // using real browsers for dev work
      const instructions = read(".github/instructions/frontend.instructions.md");

      // Should mention Simple Browser limitations
      expect(instructions).toContain("Simple Browser");
      expect(instructions).toContain("real browser");
    });
  });
});
