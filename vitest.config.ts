/**
 * vitest.config.ts
 * 
 * Configuration for Vitest unit testing framework.
 * Uses the same resolve aliases as vite.config.ts for consistent imports.
 * Tests are discovered in the tests/ directory with pattern: tests with .test.ts extension
 */

import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
