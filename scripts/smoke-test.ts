/**
 * scripts/smoke-test.ts
 *
 * Starts the production build (dist/index.cjs) and checks it end to end over HTTP:
 * health, static app and SPA fallback, security headers, the plan and tiers APIs,
 * validation errors, rate-limit headers, and the API docs. Unit and integration
 * tests import the source; this catches problems that only appear in the bundle.
 *
 * Also writes the served OpenAPI document to dist/openapi.json for validation.
 *
 * Run after `npm run build`:  npm run smoke
 * Port: SMOKE_PORT (default 5099)
 */

import { spawn } from "child_process";
import { readFileSync, writeFileSync } from "fs";

const port = Number(process.env.SMOKE_PORT || 5099);
const base = `http://127.0.0.1:${port}`;
const { version } = JSON.parse(readFileSync("package.json", "utf-8"));

const server = spawn(process.execPath, ["dist/index.cjs"], {
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
  stdio: ["ignore", "ignore", "pipe"],
});
let serverErrors = "";
server.stderr.on("data", (chunk) => { serverErrors += chunk; });

const results: string[] = [];
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push(`[PASS] ${name}`);
  } catch (error) {
    failed++;
    results.push(`[FAIL] ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch { /* not listening yet */ }
    if (server.exitCode !== null) throw new Error(`server exited (${server.exitCode}): ${serverErrors}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not become healthy within 15s");
}

try {
  await waitForServer();

  await check("health reports the package version", async () => {
    const body = await (await fetch(`${base}/health`)).json();
    assert(body.status === "healthy", `status ${body.status}`);
    assert(body.version === version, `version ${body.version} != ${version}`);
  });

  await check("web app is served with a strict CSP", async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    const csp = res.headers.get("content-security-policy") ?? "";
    assert(res.ok && html.includes('<div id="root">'), "index.html not served");
    assert(/script-src 'self'(;|$)/.test(csp), `script-src not 'self' only: ${csp}`);
    assert(!csp.includes("cdn.jsdelivr.net"), "global CSP allows the CDN");
    assert(res.headers.get("x-content-type-options") === "nosniff", "nosniff missing");
  });

  await check("hashed assets are immutable and the SPA falls back to index.html", async () => {
    const html = await (await fetch(`${base}/`)).text();
    const asset = html.match(/\/assets\/[\w.-]+\.js/)?.[0];
    assert(asset, "no script asset in index.html");
    const res = await fetch(`${base}${asset}`);
    assert(res.ok && (res.headers.get("cache-control") ?? "").includes("immutable"), "asset not cached immutably");
    const fallback = await fetch(`${base}/some/client/route`);
    assert(fallback.ok && (await fallback.text()).includes('<div id="root">'), "SPA fallback failed");
  });

  await check("plan: private EKS layout with a two-subnet control plane", async () => {
    const res = await fetch(`${base}/api/k8s/plan`, json({ deploymentSize: "micro", provider: "eks", vpcCidr: "10.0.0.0/23", networkMode: "private" }));
    assert(res.ok, `HTTP ${res.status}`);
    assert((res.headers.get("ratelimit-limit") ?? "") === "100", "rate-limit headers missing");
    const plan = await res.json();
    assert(plan.networkMode === "private" && plan.subnets.public.length === 0, "public subnets in private mode");
    assert(new Set(plan.subnets.loadBalancer.map((s: { availabilityZone: string }) => s.availabilityZone)).size === 2, "LB subnets not in two AZs");
    assert(plan.subnets.controlPlane.length === 2 && plan.subnets.controlPlane.every((s: { cidr: string }) => s.cidr.endsWith("/28")), "control plane not 2 x /28");
    assert(plan.pods.cidr && plan.services.cidr && plan.metadata.version, "pods/services/metadata missing");
  });

  await check("plan: YAML output", async () => {
    const res = await fetch(`${base}/api/k8s/plan?format=yaml`, json({ deploymentSize: "enterprise", provider: "gke", vpcCidr: "10.20.0.0/16" }));
    const text = await res.text();
    assert(res.ok && (res.headers.get("content-type") ?? "").includes("yaml"), "not YAML");
    assert(text.includes("networkMode: public") && text.includes("controlPlane:"), "YAML body incomplete");
  });

  await check("plan: readable validation errors and RFC 1918 enforcement", async () => {
    const missing = await (await fetch(`${base}/api/k8s/plan`, json({ provider: "eks" }))).json();
    assert(missing.code === "INVALID_REQUEST" && missing.error.includes("deploymentSize: Required"), JSON.stringify(missing));
    const spill = await fetch(`${base}/api/k8s/plan`, json({ deploymentSize: "micro", vpcCidr: "10.0.0.0/7" }));
    assert(spill.status === 400 && (await spill.json()).code === "NETWORK_GENERATION_ERROR", "10.0.0.0/7 accepted");
  });

  await check("tiers: provider and network mode", async () => {
    const tiers = await (await fetch(`${base}/api/k8s/tiers?provider=gke&networkMode=private`)).json();
    assert(tiers.enterprise?.publicSubnets === 0 && tiers.enterprise?.loadBalancerSubnets === 1, JSON.stringify(tiers.enterprise));
    const bad = await fetch(`${base}/api/k8s/tiers?networkMode=isolated`);
    assert(bad.status === 400, `unknown networkMode gave ${bad.status}`);
  });

  await check("OpenAPI document is served (saved to dist/openapi.json)", async () => {
    const spec = await (await fetch(`${base}/api/docs`)).json();
    assert(spec.openapi === "3.0.0" && spec.info?.version === version, "unexpected openapi/info.version");
    assert(spec.paths?.["/k8s/plan"]?.post?.operationId === "generateNetworkPlan", "operationId missing");
    writeFileSync("dist/openapi.json", JSON.stringify(spec, null, 2));
  });

  await check("API docs page loads pinned assets with SRI", async () => {
    const res = await fetch(`${base}/api/docs/ui`);
    const html = await res.text();
    const csp = res.headers.get("content-security-policy") ?? "";
    const cdnTags = html.match(/<(?:script|link)[^>]*cdn\.jsdelivr\.net[^>]*>/g) ?? [];
    assert(res.ok && cdnTags.length === 2, `expected 2 CDN tags, found ${cdnTags.length}`);
    assert(cdnTags.every((t) => /integrity="sha384-/.test(t)), "CDN asset without SRI");
    assert(csp.includes("https://cdn.jsdelivr.net"), "docs CSP lacks the CDN");
  });
} catch (error) {
  failed++;
  results.push(`[FAIL] startup: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  server.kill();
}

console.log(results.join("\n"));
console.log(failed ? `\n${failed} smoke check(s) failed` : `\nAll ${results.length} smoke checks passed`);
process.exit(failed ? 1 : 0);
