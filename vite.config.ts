/**
 * vite.config.ts
 *
 * Vite build and development server configuration.
 *
 * Features:
 * - React plugin integration
 * - Tailwind CSS v4 via its Vite plugin (Rust engine: Oxide scanner + Lightning CSS
 *   for prefixing and minification; no PostCSS pipeline)
 * - Path aliases (@, @shared)
 * - Vite's default dev server file access rules (server.fs.strict, and a deny list
 *   covering .env, keys and certificates, .npmrc and .git). Setting server.fs.deny
 *   here would replace that list, not add to it.
 * - Client root at ./client directory
 * - Build output to dist/public
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
