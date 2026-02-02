/**
 * scripts/build.ts
 * 
 * Production build script that:
 * 1. Cleans the dist directory
 * 2. Builds the client with Vite (outputs to dist/public)
 * 3. Bundles the server with esbuild (outputs to dist/index.cjs)
 * 
 * Uses an allowlist of dependencies to bundle with the server to optimize
 * cold start times by reducing openat(2) syscalls.
 * 
 * Run with: npm run build
 */

import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
// Only includes dependencies actually used by this application
const allowlist = [
  "express",
  "express-rate-limit",
  "helmet",
  "yaml",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
