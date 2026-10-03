/**
 * scripts/smoke-test.ts
 *
 * Starts the production build (dist/index.cjs) and checks it end to end over HTTP:
 * health, static app and SPA fallback, security headers, the plan and tiers APIs,
 * validation errors, rate-limit headers, and the API docs. Unit and integration
 * tests import the source; this catches problems that only appear in the bundle.
 * The API docs check downloads the pinned Swagger UI files from the CDN to compare
 * them with their integrity hashes, so it needs network access to cdn.jsdelivr.net.
 *
 * Also checks that the served OpenAPI document matches server/openapi.ts and writes
 * it to dist/openapi.json for validation.
 *
 * Run after `npm run build`:  npm run smoke
 * Port: SMOKE_PORT (default 5099)
 */

import { spawn } from "child_process";
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { isDeepStrictEqual } from "util";
import { openApiSpec } from "../server/openapi";

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

const CDN_HOST = "cdn.jsdelivr.net";

/** Parses a URL, or returns null for CSP keywords ('self') and other non-URL tokens */
function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Splits a Content-Security-Policy header into directive name -> source list */
function parseCsp(header: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const directive of header.split(";")) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

// Compare parsed hostnames, not substrings: "cdn.jsdelivr.net.example.com" is not the CDN
const isCdn = (url: string) => parseUrl(url)?.hostname === CDN_HOST;
const isHttpsCdn = (url: string) => {
  const parsed = parseUrl(url);
  return parsed?.protocol === "https:" && parsed.hostname === CDN_HOST;
};

/** Starts the bundle with extra environment and waits (10s at most) for it to exit */
function runToExit(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["dist/index.cjs"], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const timer = setTimeout(() => child.kill(), 10_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

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

  await check("web app is served with a strict CSP and the security headers", async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    const csp = parseCsp(res.headers.get("content-security-policy") ?? "");
    assert(res.ok && html.includes('<div id="root">'), "index.html not served");
    assert(csp.get("script-src")?.join(" ") === "'self'", `script-src not 'self' only: ${csp.get("script-src")}`);
    assert(![...csp.values()].flat().some(isCdn), "global CSP allows the CDN");
    // Over plain HTTP on a LAN address, upgrade-insecure-requests would blank the page
    assert(!csp.has("upgrade-insecure-requests"), "global CSP upgrades requests to https");
    // The other headers SECURITY.md lists (Helmet's defaults)
    const expected: Record<string, string | null> = {
      "x-content-type-options": "nosniff",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-frame-options": "SAMEORIGIN",
      "x-xss-protection": "0",
      "referrer-policy": "strict-origin-when-cross-origin",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-resource-policy": "same-origin",
      "x-powered-by": null,
    };
    for (const [name, value] of Object.entries(expected)) {
      assert(res.headers.get(name) === value, `${name}: ${res.headers.get(name)} (expected ${value})`);
    }
  });

  await check("hashed assets are immutable and the SPA falls back to index.html", async () => {
    const html = await (await fetch(`${base}/`)).text();
    const asset = html.match(/\/assets\/[\w.-]+\.js/)?.[0];
    assert(asset, "no script asset in index.html");
    const res = await fetch(`${base}${asset}`);
    assert(res.ok && (res.headers.get("cache-control") ?? "").includes("immutable"), "asset not cached immutably");
    // A file copied from client/public whose name only looks hashed must revalidate
    const publicFile = await fetch(`${base}/github-nicholashoule.png`);
    assert(publicFile.ok && publicFile.headers.get("cache-control") === "no-cache", `public file cached as ${publicFile.headers.get("cache-control")}`);
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

  await check("unknown API paths get a JSON 404, not the web app", async () => {
    // In production the SPA fallback answers unmatched GETs, so this must come first.
    // Routing is case-sensitive, so /API/... matches no route but is still an API path.
    for (const path of ["/api/typo", "/api/k8s/plan", "/API/k8s/tiers", "/Api/version"]) {
      const res = await fetch(`${base}${path}`);
      const body = await res.text();
      assert(res.status === 404 && (res.headers.get("content-type") ?? "").includes("json"), `GET ${path}: ${res.status} ${body.slice(0, 40)}`);
      assert(JSON.parse(body).code === "NOT_FOUND", `GET ${path}: ${body}`);
    }
    const repeated = await fetch(`${base}/api/k8s/tiers?format=json&format=yaml`);
    assert(repeated.status === 200, `repeated format parameter gave ${repeated.status}`);
  });

  await check("OpenAPI document is served (saved to dist/openapi.json)", async () => {
    const spec = await (await fetch(`${base}/api/docs`)).json();
    assert(spec.openapi === "3.0.0" && spec.info?.version === version, "unexpected openapi/info.version");
    assert(spec.paths?.["/k8s/plan"]?.post?.operationId === "generateNetworkPlan", "operationId missing");
    // Save the document built from source, not the HTTP response; they must be identical
    const source = JSON.parse(JSON.stringify(openApiSpec));
    assert(isDeepStrictEqual(spec, source), "served OpenAPI document differs from server/openapi.ts");
    writeFileSync("dist/openapi.json", JSON.stringify(source, null, 2));
  });

  await check("API docs page loads pinned assets whose SRI hashes match the CDN files", async () => {
    const res = await fetch(`${base}/api/docs/ui`);
    const html = await res.text();
    const csp = parseCsp(res.headers.get("content-security-policy") ?? "");
    // Every element that loads from the CDN must carry SRI, whatever its tag name.
    // Attributes are read per element (text between "<" and ">"); no tag-matching regex.
    const elements = html.split("<").map((chunk) => new Map(
      [...chunk.slice(0, chunk.indexOf(">")).matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name.toLowerCase(), value])
    ));
    const cdnElements = elements.filter((attrs) => [attrs.get("src"), attrs.get("href")].some((url) => url !== undefined && isCdn(url)));
    assert(res.ok && cdnElements.length === 2, `expected 2 CDN elements, found ${cdnElements.length}`);
    assert(
      cdnElements.every((attrs) => attrs.get("integrity")?.startsWith("sha384-") && attrs.get("crossorigin") === "anonymous"),
      "CDN asset without SRI"
    );
    // A stale or mistyped hash passes the format check above, but the browser refuses
    // the file and the docs page stays blank. Hash what the CDN actually serves.
    for (const attrs of cdnElements) {
      const url = (attrs.get("src") ?? attrs.get("href"))!;
      let asset: Response;
      try {
        asset = await fetch(url);
      } catch (error) {
        throw new Error(`could not download ${url} to check its integrity hash (needs network access to ${CDN_HOST}): ${error}`);
      }
      assert(asset.ok, `${url}: HTTP ${asset.status}`);
      const actual = `sha384-${createHash("sha384").update(Buffer.from(await asset.arrayBuffer())).digest("base64")}`;
      const declared = attrs.get("integrity")!.split(/\s+/);
      assert(declared.includes(actual), `${url}: integrity ${declared.join(" ")} does not match the file (${actual})`);
    }
    for (const directive of ["script-src", "style-src"]) {
      assert(csp.get(directive)?.some(isHttpsCdn), `docs CSP ${directive} lacks the CDN`);
    }
    // The docs policy extends the global one: every directive and source it sends
    const global = parseCsp((await fetch(`${base}/`)).headers.get("content-security-policy") ?? "");
    for (const [directive, sources] of global) {
      const docsSources = csp.get(directive);
      assert(docsSources && sources.every((s) => docsSources.includes(s)), `docs CSP drops ${directive} ${sources.join(" ")}`);
    }
    assert(!csp.has("upgrade-insecure-requests"), "docs CSP upgrades requests to https");
  });

  await check("invalid PORT and TRUST_PROXY stop startup with a clear error", async () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ PORT: "abc" }, "Invalid PORT"],
      [{ PORT: "70000" }, "Invalid PORT"],
      [{ TRUST_PROXY: "not-an-address" }, "Invalid TRUST_PROXY"],
    ];
    for (const [env, message] of cases) {
      const { code, output } = await runToExit({ PORT: String(port + 1), HOST: "127.0.0.1", ...env });
      assert(code === 1 && output.includes(message), `${JSON.stringify(env)}: exit ${code}, ${output.slice(0, 120)}`);
    }
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
