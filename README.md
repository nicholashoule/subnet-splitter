# CIDR Subnet Calculator

A subnet calculator web app and a Kubernetes network-planning API. The API generates non-overlapping VPC, node, control-plane, pod, and service CIDRs for EKS, GKE, AKS, and self-hosted clusters, as JSON or YAML, for use in Terraform and other infrastructure tools.

[![CI](https://github.com/nicholashoule/subnet-splitter/actions/workflows/ci.yml/badge.svg)](https://github.com/nicholashoule/subnet-splitter/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/nicholashoule/subnet-splitter)](LICENSE)
[![npm](https://img.shields.io/badge/npm-v11%2B-CB3837?logo=npm)](https://www.npmjs.com/)

[<img src="https://github.com/nicholashoule/subnet-splitter/blob/main/client/public/subnet-splitter.png" width="1280"/>](https://github.com/nicholashoule/subnet-splitter)

## Features

### Frontend Application
- **Subnet Calculation**: Enter any CIDR notation to get detailed network information
- **Recursive Splitting**: Split networks into smaller subnets down to /32 (single host)
- **Interactive Table**: Split subnets appear below their parent, each marked by a color-coded bar for its prefix length; remove a split to restore the parent, or turn on Hide Parents to list only the smallest subnets
- **Copy to Clipboard**: Click to copy any field value (network address, broadcast, hosts, etc.)
- **CSV Export**: Select rows and export subnet details to CSV for use in Excel or other tools
- **Dark/Light Mode**: Theme support with elegant UI
- **Responsive Design**: Works on desktop and mobile devices

### Backend API (Production-Ready)
- **Kubernetes Network Planning**: Generate network plans for EKS, GKE, AKS, and generic Kubernetes
- **Separated Address Spaces**: Nodes, control plane, pods, and services each get their own range, checked never to overlap
- **Provider-Aware Layouts**: EKS subnets span two AZs; GKE and AKS subnets are regional; one control-plane network per cluster
- **Public or Private Networks**: `networkMode: "private"` drops public subnets for internal load-balancer subnets and NAT egress
- **Multi-Cluster Friendly**: Supply your own pod and service ranges (`podsCidr`, `servicesCidr`) and zone names (`availabilityZones`)
- **Deployment Tiers**: Pre-configured subnet allocations (Micro → Hyperscale), see [compliance audits](docs/compliance/)
- **Compliance Documentation**: Full compliance audits for [EKS](docs/compliance/EKS_COMPLIANCE_AUDIT.md), [GKE](docs/compliance/GKE_COMPLIANCE_AUDIT.md), and [AKS](docs/compliance/AKS_COMPLIANCE_AUDIT.md)

## Network Information Provided

- CIDR notation and prefix length
- Network address and broadcast address
- First and last usable host addresses
- Total addresses and usable hosts count
- Subnet mask and wildcard mask
- Network class classification

## Security

This application follows a **security by design** approach with multiple layers of protection:

### Security Features
- **No database**: No user data to protect or risk exposing
- **Stateless API**: Plans are computed from the request alone; with an explicit `vpcCidr` the same input gives the same plan (only `metadata.generatedAt` differs)
- **Client-side calculator**: The web calculator runs entirely in the browser
- **Helmet middleware**: Adds security headers for XSS, clickjacking, and MIME sniffing protection
- **Content Security Policy (CSP)**: 
  - Strict policy in production: `script-src 'self'` only, no third-party script origins
  - Swagger UI (`/api/docs/ui`) alone may load its pinned, Subresource Integrity-checked assets from cdn.jsdelivr.net
  - Relaxed policy in development: allows Vite HMR and React Fast Refresh
  - Prevents inline script injection attacks
- **Rate limiting**: API routes limited to 100 requests per minute per IP (health checks exempt); SPA fallback routes limited to 30 requests per 15 minutes
- **Static isolation**: Only compiled assets from `dist/public` are served in production
- **Request validation**: All API requests validated with Zod schemas; request bodies capped at 16 KB
- **Safe errors**: 5xx responses never include internal error details
- **No vulnerabilities**: `npm audit` reports 0 vulnerabilities

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

### Security Best Practices
- Environment-aware configuration for dev vs production
- File extension checks prevent serving source files as HTML
- Middleware ordering protects asset serving from SPA fallback interference
- All security settings documented; core protections covered by automated tests

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS v4** for styling, through its Vite plugin (Rust engine: Oxide + Lightning CSS; no PostCSS pipeline)
- **shadcn/ui** component library (Radix UI primitives)
- **Vite** for building and development

### Backend
- **Express.js 5** with TypeScript
- **Node.js** runtime
- **Zod** for API request validation
- **Helmet** for security headers
- **express-rate-limit** for DoS protection
- Stateless: no database or storage layer

## Project Structure

```
├── client/                 # React frontend (Vite, Tailwind CSS v4)
│   ├── index.html
│   └── src/
│       ├── components/ui/  # shadcn/ui components
│       ├── hooks/          # Custom React hooks
│       ├── lib/            # subnet-utils (calculator math), kubernetes-network-generator (API planner)
│       ├── pages/          # Calculator and 404 pages
│       └── index.css       # Design tokens and Tailwind theme (@theme inline)
├── server/                 # Express backend
│   ├── index.ts            # Entry point: Helmet, CSP, rate limiting, HOST/PORT binding
│   ├── routes.ts           # API routes (health, plan, tiers, OpenAPI)
│   ├── openapi.ts          # OpenAPI document (examples generated by the API itself)
│   ├── swagger-ui.ts       # API docs page (/api/docs/ui)
│   ├── csp-config.ts       # Content Security Policy directives
│   ├── logger.ts           # Structured JSON logging
│   ├── vite.ts             # Vite dev server setup with SPA fallback
│   └── static.ts           # Production static file serving with rate limiting
├── shared/                 # Shared code
│   ├── schema.ts           # Subnet types and limits (dependency-free, safe for the client bundle)
│   └── kubernetes-schema.ts # Kubernetes API Zod schemas and tier configuration
├── tests/                  # Unit and integration test suite (Vitest)
│   ├── unit/               # Calculator math, plan generator, network separation, compliance, config, styles
│   ├── integration/        # API endpoints, calculator, rate limiting, CSP, static serving, Swagger UI
│   ├── manual/             # Manual testing scripts (2 PowerShell, 2 TypeScript)
│   ├── helpers/            # Shared test utilities
│   └── README.md           # Testing documentation
├── scripts/                # Build and utility tools
│   ├── build.ts            # Production build (client with Vite, server bundle with esbuild)
│   ├── smoke-test.ts       # Starts the production build and checks it over HTTP
│   └── install-hooks.mjs   # Points git at .githooks/ (runs on npm install)
├── .githooks/
│   └── pre-commit          # Emoji check before each commit (skipped without Go 1.24+)
├── .github/
│   ├── workflows/          # CI (ci.yml) and instruction-file validation
│   ├── instructions/       # Development guidelines (backend, frontend, testing, general)
│   └── swagger-ui-theming.md # How the API docs page is styled and upgraded
├── docs/                   # Reference documentation
│   ├── api.md              # Kubernetes Network Planning API reference
│   ├── test-suite-analysis.md # Test suite health analysis
│   ├── test-improvement-analysis.md # Test improvement notes
│   ├── git-conventions.md  # Git commit message conventions
│   ├── test-templates.md   # Test patterns and examples
│   ├── ui-examples.md      # UI code and design system
│   └── compliance/         # Compliance and platform-specific documentation
│       ├── kubernetes-network-reference.md # K8s network formulas
│       ├── security-reference.md # CSP and security configuration
│       ├── ip-allocation-cross-reference.md # Cross-provider IP comparison
│       ├── AKS_COMPLIANCE_AUDIT.md # Azure Kubernetes Service
│       ├── EKS_COMPLIANCE_AUDIT.md # AWS Elastic Kubernetes Service
│       └── GKE_COMPLIANCE_AUDIT.md # Google Kubernetes Engine
├── vite.config.ts          # Vite config (React + Tailwind plugins, aliases)
├── CHANGELOG.md            # Release notes (Keep a Changelog)
├── SECURITY.md             # Vulnerability reporting and security policy
└── package.json
```

## Getting Started

### Development Setup

#### Prerequisites
- Node.js v24.x or v26+ ([download](https://nodejs.org/))
- npm v11+ (comes with Node.js)
- Git

#### Installation

**Clone the repository:**
```bash
git clone https://github.com/nicholashoule/subnet-splitter.git
cd subnet-splitter
```

**Install dependencies** (exact versions from `package-lock.json`):
```bash
npm ci
```

#### Security Audit (Required)

Always verify the project has no security vulnerabilities before running any code:

```bash
npm audit
```

If vulnerabilities are found, fix them:
```bash
npm audit fix
```

If issues persist, use `--force` (may install breaking changes):
```bash
npm audit fix --force
```

**Note:** Do not run `npm run dev`, `npm run test`, or `npm run build` without addressing security vulnerabilities first.

**Start development server:**
```bash
npm run dev
```

The development server listens on `127.0.0.1:5000` (loopback only). Changes to the React app and CSS reload live; restart `npm run dev` after changing server code (`server/`, `shared/`, or `client/src/lib/kubernetes-network-generator.ts`).

**Access the application:**
- Web UI: Open `http://127.0.0.1:5000` in your browser
- API endpoint: `POST http://127.0.0.1:5000/api/k8s/plan`
- Tier info: `GET http://127.0.0.1:5000/api/k8s/tiers`
- API docs: `http://127.0.0.1:5000/api/docs/ui` (Swagger UI)

#### Windows-Specific Setup

If PowerShell's execution policy blocks `npm` (the `npm.ps1` shim), call `npm.cmd` instead:

```bash
npm.cmd ci
npm.cmd run dev
```

**Note:** Line endings are normalized to LF via `.gitattributes`, so Git may show CRLF warnings on Windows. This is normal and safe.

### Production Build

```bash
npm run build    # client to dist/public/, server bundle to dist/index.cjs
npm start        # node dist/index.cjs
npm run smoke    # optional: start the build on port 5099 and check it over HTTP
```

The production build creates optimized assets in `dist/public/` and a self-contained server bundle at `dist/index.cjs` (all server dependencies are bundled, so `node_modules` is not needed at runtime; `NODE_ENV=production` is baked in at build time). To deploy, copy `dist/` to a host with Node.js 24 or 26 and run `node dist/index.cjs`.

`npm run smoke` starts the built server and checks health, the web app and its security headers, the plan and tiers APIs (including private mode and validation errors), JSON 404s for unknown API paths, and the API docs page, then stops it. It also checks that a bad `PORT` or `TRUST_PROXY` stops startup with a clear error. It also checks that the served OpenAPI document matches `server/openapi.ts` and writes it to `dist/openapi.json`. Set `SMOKE_PORT` to use a different port.

**Runtime configuration (environment variables):**

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5000` | Port for both the API and the web UI (an integer from 1 to 65535; anything else stops startup with an error) |
| `HOST` | `0.0.0.0` in production, `127.0.0.1` in development | Interface to bind. Production binds all interfaces so the server is reachable in a container |
| `TRUST_PROXY` | `false` | Set to the number of trusted proxy hops (e.g. `1`) or a comma-separated list of proxy IPs/CIDRs when running behind a load balancer, so per-IP rate limiting sees real client IPs. Only trust proxies you control. `true` trusts every proxy and is logged as a warning, since any client can then choose its own IP; an invalid value stops startup with an error |

Health checks for load balancers and Kubernetes probes: `GET /health`, `/health/ready`, `/health/live` (also under `/api/v1/health`). They are never rate limited.

### Type Checking

```bash
npm run check
```

Verify TypeScript compilation without emitting files.

### Testing

```bash
# Run all tests once
npm test -- --run

# Watch mode (re-runs on change)
npm test

# Run specific test file
npm test -- --run tests/unit/subnet-utils.test.ts
npm test -- --run tests/unit/network-separation.test.ts

# Run the Kubernetes planning API tests
npm test -- --run tests/integration/kubernetes-network-api.test.ts

# Run only the JSON/YAML response format tests
npm test -- --run tests/integration/api-endpoints.test.ts -t "Response Format Support"

# Check for emoji (demojify CLI; needs Go 1.24+). Also runs as a pre-commit hook,
# installed by npm install, and as a CI job
npm run emoji:check

# Replace emoji with text tokens such as [PASS] and [FAIL]
npm run emoji:fix
```

#### Testing the API Endpoints

**Prerequisites**: Start the development server first:
```bash
npm run dev
```

**Test JSON output** (default format):
```bash
curl -X POST http://127.0.0.1:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"professional","provider":"eks","vpcCidr":"10.100.0.0/18"}'
```

**Test a private network** (no public subnets; internal load-balancer subnets instead):
```bash
curl -X POST http://127.0.0.1:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"enterprise","provider":"gke","vpcCidr":"10.20.0.0/16","networkMode":"private"}'
```

**Test YAML output** (add `?format=yaml` query parameter):
```bash
curl -X POST "http://127.0.0.1:5000/api/k8s/plan?format=yaml" \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"professional","provider":"eks","vpcCidr":"10.100.0.0/18"}'
```

**Test tier information endpoint**:
```bash
# JSON format
curl http://127.0.0.1:5000/api/k8s/tiers

# YAML format
curl "http://127.0.0.1:5000/api/k8s/tiers?format=yaml"
```

**PowerShell Testing** (Windows):
```powershell
# JSON output
Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/k8s/plan" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"deploymentSize":"professional","provider":"eks"}' | ConvertTo-Json -Depth 10

# YAML output
Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/k8s/plan?format=yaml" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"deploymentSize":"hyperscale","provider":"gke"}' | Select-Object -ExpandProperty Content
```

The project includes a comprehensive test suite (100% passing) covering:

**Unit Tests:**
- **Subnet calculations**: IP address conversion and validation, CIDR prefix/mask calculations for all prefix lengths (0-32), subnet splitting and calculations, network class identification (Classes A-E including multicast and reserved), edge cases (RFC 3021 point-to-point /31, /32 host routes, /0 all-IPv4), RFC 1918 private ranges, error handling with clear error messages, subnet tree operations
- **Kubernetes network generation**: Network plan generation, deployment tier configurations, RFC 1918 private IP enforcement, subnet allocation algorithms
- **Network separation**: For every tier, provider, and network mode (plus 2,000 random VPCs): nodes, control plane, pods, and services never overlap, every CIDR is canonical, reserved ranges are avoided, EKS spans two AZs, the control plane is one network, private mode has no public subnets, and overrides are validated
- **IP calculation compliance**: IP allocation formulas, deployment tier compliance, exact minimum VPC sizes per provider
- **UI styles**: WCAG contrast of the color pairs the app renders, in both themes, with colors read from `client/src/index.css`; no hard-coded Tailwind palette colors in client code outside the depth indicator; design system consistency and page structure
- **Configuration**: Tailwind v4 setup (Vite plugin, no legacy config or PostCSS, theme tokens defined for both themes), Vite configuration validation

**Integration Tests:**
- **API endpoints**: Health checks, OpenAPI spec (examples checked against live responses), provider and network-mode tiers, validation errors, JSON and YAML response formats, and the API docs page (palette matches the web app, pinned SRI assets, theme toggle)
- **Calculator UI**: React component behavior, form validation, subnet operations, CSV export, hide parents feature, depth indicator visual hierarchy
- **Kubernetes Network Planning API**: Plan structure (plain data that survives a JSON round trip), RFC 1918 enforcement, public IP rejection, all deployment tiers and providers
- **Rate limiting**: API limit (100/min, health exempt) and SPA fallback limit, standard rate-limit headers
- **Static serving**: Compression and cache headers for hashed assets and `index.html`
- **Swagger UI CSP middleware**: Route-specific CSP; the global CSP allows no third-party scripts
- **Swagger UI theming**: The docs page served by an in-process server the test starts itself, so it always runs (no `npm run dev` needed)
- **CSP violation endpoint**: W3C spec compliance, rate limiting, schema validation

See [tests/README.md](tests/README.md) for comprehensive testing documentation and [docs/test-suite-analysis.md](docs/test-suite-analysis.md) for detailed test suite analysis.

### Continuous Integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and every pull request, on Node.js 24 and 26:

1. `npm ci` (exact versions from `package-lock.json`)
2. `npm audit` (fails on any known vulnerability)
3. `npm run check` (TypeScript)
4. `npm test -- --run` (all unit and integration tests)
5. `npm run build`
6. `npm run smoke` (starts `dist/index.cjs` and checks it over HTTP)
7. OpenAPI validation of the served document (`@apidevtools/swagger-cli`)

A separate `emoji` job runs [demojify](https://github.com/nicholashoule/demojify-sanitize) (pinned to v1.1.0) over every text file and fails on any emoji; see [.github/emoji-prevention.md](.github/emoji-prevention.md).

Run the same checks locally before pushing (`emoji:check` needs Go 1.24+):

```bash
npm audit && npm run check && npm test -- --run && npm run build && npm run smoke && npm run emoji:check
```

[`.github/workflows/validate-instructions.yml`](.github/workflows/validate-instructions.yml) checks the files in `.github/instructions/` (front matter, at most 200 lines each) when they change.

## Windows Compatibility

This project is fully tested on Windows and includes several optimizations for cross-platform support:

- **Line Endings**: Configured via `.gitattributes` to use LF (Unix-style) for all source files
- **npm Scripts**: No inline environment variables, so every script runs unchanged in cmd, PowerShell, and POSIX shells
- **Server Binding**: Development binds `127.0.0.1`; override with the `HOST` environment variable
- **.gitignore**: Comprehensive coverage of OS-specific files (Windows, macOS, Linux)

All development tools and commands work identically on Windows, macOS, and Linux.

## Usage

### Web Interface

1. Enter a CIDR notation (e.g., `192.168.1.0/24`) in the input field
2. Click "Calculate" or use one of the example buttons
3. View the subnet details in the Network Overview card
4. Use the split button to divide subnets into smaller ranges
5. Select rows with checkboxes and export to CSV

### REST API - Kubernetes Network Planning

The application provides production-ready REST endpoints for generating optimized network configurations across EKS, GKE, AKS, and self-hosted Kubernetes.

**WARNING Security Requirement:** All VPC CIDRs **must use private RFC 1918 IP ranges**. Public IPs are rejected with security guidance. See full [API documentation](docs/api.md) for details.

#### Endpoint 1: Generate Network Plan

**POST `/api/k8s/plan`**

Generate an optimized network plan with subnet allocation, pod CIDR, and service CIDR ranges.

**Quick Example:**
```bash
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks",
    "vpcCidr": "10.100.0.0/18"
  }'
```

**Request Parameters:**
```json
{
  "deploymentSize": "micro|standard|professional|enterprise|hyperscale",
  "provider": "eks|gke|aks|kubernetes|k8s",
  "region": "us-east-1",
  "vpcCidr": "10.100.0.0/18",
  "deploymentName": "my-cluster"
}
```

- `deploymentSize` (required): Deployment tier for cluster size
- `provider` (optional): Cloud provider (`eks`, `gke`, `aks`, `kubernetes`, `k8s`). Defaults to `kubernetes`. Note: `k8s` is an alias for `kubernetes`
- `region` (optional): Cloud region used to name zones (e.g. `us-east-1` gives `us-east-1a`; `us-central1` gives `us-central1-a`). Lowercase letters, digits, and hyphens, up to 64 characters. Defaults per provider: `us-east-1` (EKS), `us-central1` (GKE), `eastus` (AKS), `region-1` (generic)
- `vpcCidr` (optional): **Private RFC 1918 CIDR only** (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16). Host bits are cleared (`10.1.2.3/16` becomes `10.1.0.0/16`). If omitted, a random /18 inside an RFC 1918 block is generated
- `podsCidr` (optional): Your own pod range instead of the generated one. RFC 1918 or `100.64.0.0/10`, /8 to /24
- `servicesCidr` (optional): Your own service (ClusterIP) range. RFC 1918, /13 to /24 (EKS allows /12-/24; AKS requires smaller than /12)
- `networkMode` (optional): `public` (default) or `private`. Private plans have no public subnets; see [Private network mode](#private-network-mode)
- `availabilityZones` (optional): Zone names to assign round-robin, e.g. `["ap-northeast-1a", "ap-northeast-1c"]`. EKS and generic only (EKS needs two or more); rejected for GKE and AKS, whose subnets are regional
- `deploymentName` (optional): Reference name for deployment tracking, up to 128 characters

**Accepted Private IP Ranges** (the *entire* range must be inside one block):
- [PASS] `10.0.0.0/8`: any range within it, e.g. `10.100.0.0/16`
- [PASS] `172.16.0.0/12`: 172.16.0.0 - 172.31.255.255
- [PASS] `192.168.0.0/16`: any range within it

**Rejected:** public ranges (e.g. `8.8.8.0/16`, `200.0.0.0/16`), and ranges that start in private space but extend past it (e.g. `10.0.0.0/7`, `172.16.0.0/11`, `192.168.0.0/15`)

**Address space separation** (every tier, every provider). Each plan keeps four kinds of address space apart, and no two ranges overlap:

| Space | Where | Field |
|-------|-------|-------|
| Nodes | Private subnets inside the VPC | `subnets.private` |
| Control plane | One control-plane network inside the VPC | `subnets.controlPlane` |
| Pods | Outside the VPC, in its own RFC 1918 block | `pods.cidr` |
| Services | Outside the VPC, in a third RFC 1918 block | `services.cidr` |

Load-balancer subnets (public, or internal in private mode) are also inside the VPC. Subnets are placed first-fit at offsets aligned to their size, so the control-plane network usually fills the gap between the load-balancer and node subnets.

The control plane is one network in every tier: **GKE** one /28 for `master_ipv4_cidr_block`; **AKS** one /28 for API Server VNet Integration; **generic** one /28 for control-plane nodes, so a floating API server address (keepalived, kube-vip) can move between them. **EKS** gets one /27 split into two /28s in two AZs for `vpc_config.subnet_ids`: EKS rejects a single subnet (it requires two AZs), and AWS advises naming only two so you control where its network interfaces land.

**Where pods and services land:** pods take the first free slot in `10.0.0.0/8` (or `172.16.0.0/12` when the VPC is in `10.0.0.0/8`); services take the first free slot in `192.168.0.0/16` (or `172.16.0.0/12` when the VPC is in `192.168.0.0/16`). Neither ever overlaps `172.17.0.0/16`, Docker's default bridge network, which AWS also reserves for some services. A VPC that overlaps it is allowed but returns a `warnings` entry.

**Running several clusters in one network, or regenerating a plan for an existing cluster?** Every plan with a VPC in the same block gets the same generated pod and service ranges. Pass `podsCidr` and `servicesCidr` to keep clusters apart, and pass an existing cluster's service range to keep it: service CIDRs cannot change after cluster creation.

#### Private network mode

Pass `"networkMode": "private"` for a network with no public subnets. Load balancers become internal, and egress goes through a managed NAT or gateway that takes no space in this layout:

| Provider | `subnets.loadBalancer` | Egress |
|----------|------------------------|--------|
| GKE | One regional proxy-only subnet (`purpose = REGIONAL_MANAGED_PROXY`) for internal Application Load Balancers and the internal Gateway. Only one can be active per region and network, so clusters there share it | Cloud NAT on a Cloud Router (no subnet needed) |
| AKS | One regional subnet for internal load balancer frontends (point services at it with the `service.beta.kubernetes.io/azure-load-balancer-internal-subnet` annotation; by default they use the node subnet) | `outbound_type` `managedNATGateway`, `userAssignedNATGateway`, or `userDefinedRouting` |
| EKS | One per AZ (at least two, as ALBs require), tagged `kubernetes.io/role/internal-elb` | A public NAT gateway needs a public subnet, and a private NAT gateway can't reach the internet, so use a transit gateway to a shared egress VPC, or VPC endpoints with no internet |
| Generic | One per zone (e.g. MetalLB address pools) | Your network's own NAT |

Load-balancer subnets use the tier's public subnet size (/26 to /23, within GKE's proxy-only minimum of /26). In public mode `subnets.loadBalancer` is empty; in private mode `subnets.public` is.

**Zones:** EKS spreads node, load-balancer, and control-plane subnets across at least two AZs (EKS requires cluster subnets in two AZs). Generated names follow `{region}{letter}`, but which letters exist varies by region and account, so pass `availabilityZones` with the zones your account has (e.g. from `data.aws_availability_zones`). GKE and AKS subnets carry no zone, because their subnets are regional; node pools choose zones.

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks",
    "vpcCidr": "10.100.0.0/18",
    "deploymentName": "prod-us-east-1"
  }'
```

**Response:**
```json
{
  "deploymentSize": "professional",
  "provider": "eks",
  "networkMode": "public",
  "region": "us-east-1",
  "deploymentName": "prod-us-east-1",
  "vpc": {
    "cidr": "10.100.0.0/18"
  },
  "subnets": {
    "public": [
      {
        "cidr": "10.100.0.0/25",
        "name": "public-1",
        "type": "public",
        "availabilityZone": "us-east-1a"
      },
      {
        "cidr": "10.100.0.128/25",
        "name": "public-2",
        "type": "public",
        "availabilityZone": "us-east-1b"
      }
    ],
    "private": [
      {
        "cidr": "10.100.2.0/23",
        "name": "private-1",
        "type": "private",
        "availabilityZone": "us-east-1a"
      },
      {
        "cidr": "10.100.4.0/23",
        "name": "private-2",
        "type": "private",
        "availabilityZone": "us-east-1b"
      }
    ],
    "loadBalancer": [],
    "controlPlane": [
      {
        "cidr": "10.100.1.0/28",
        "name": "control-plane-1",
        "type": "control-plane",
        "availabilityZone": "us-east-1a"
      },
      {
        "cidr": "10.100.1.16/28",
        "name": "control-plane-2",
        "type": "control-plane",
        "availabilityZone": "us-east-1b"
      }
    ]
  },
  "pods": {
    "cidr": "172.16.0.0/18"
  },
  "services": {
    "cidr": "192.168.0.0/20"
  },
  "metadata": {
    "generatedAt": "2026-10-02T12:00:00.000Z",
    "version": "2.0"
  }
}
```

#### Endpoint 2: Get Deployment Tiers

**GET `/api/k8s/tiers`**

Retrieve every tier's layout as the generator applies it. Add `?provider=eks` (or `gke`, `aks`) for that provider's layout: EKS raises every subnet type to at least two, which needs a larger VPC for micro (/23) and standard (/22). `minVpcPrefix` is computed from the actual layout. The response below is the default (generic) layout.

**Example Request:**
```bash
curl http://localhost:5000/api/k8s/tiers
```

**Response:**
```json
{
  "micro": {
    "networkMode": "public",
    "publicSubnets": 1,
    "loadBalancerSubnets": 0,
    "privateSubnets": 1,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 26,
    "loadBalancerSubnetSize": 26,
    "privateSubnetSize": 25,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 20,
    "servicesPrefix": 20,
    "minVpcPrefix": 24,
    "description": "Single Node: 1 node, minimal subnet allocation (proof of concept)"
  },
  "standard": {
    "networkMode": "public",
    "publicSubnets": 1,
    "loadBalancerSubnets": 0,
    "privateSubnets": 1,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 25,
    "loadBalancerSubnetSize": 25,
    "privateSubnetSize": 24,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 16,
    "servicesPrefix": 20,
    "minVpcPrefix": 23,
    "description": "Development/Testing: 1-3 nodes, minimal subnet allocation"
  },
  "professional": {
    "networkMode": "public",
    "publicSubnets": 2,
    "loadBalancerSubnets": 0,
    "privateSubnets": 2,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 25,
    "loadBalancerSubnetSize": 25,
    "privateSubnetSize": 23,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 18,
    "servicesPrefix": 20,
    "minVpcPrefix": 21,
    "description": "Small Production: 3-10 nodes, dual AZ ready"
  },
  "enterprise": {
    "networkMode": "public",
    "publicSubnets": 3,
    "loadBalancerSubnets": 0,
    "privateSubnets": 3,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 24,
    "loadBalancerSubnetSize": 24,
    "privateSubnetSize": 21,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 16,
    "servicesPrefix": 20,
    "minVpcPrefix": 19,
    "description": "Large Production: 10-50 nodes, triple AZ ready with HA"
  },
  "hyperscale": {
    "networkMode": "public",
    "publicSubnets": 3,
    "loadBalancerSubnets": 0,
    "privateSubnets": 3,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 23,
    "loadBalancerSubnetSize": 23,
    "privateSubnetSize": 20,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 13,
    "servicesPrefix": 18,
    "minVpcPrefix": 18,
    "description": "Global Scale: 50-5,000 nodes across 3 AZs. The /13 pod range holds 2,048 nodes at a /24 per node (AKS overlay; GKE at 65-128 max pods per node). 5,000 nodes needs GKE max pods per node of 32 or fewer, or a /11 podsCidr"
  }
}
```

#### API Error Responses

**400 Bad Request** - Invalid parameters (each problem is listed as `field: message`):
```json
{
  "error": "Invalid request: deploymentSize: Required",
  "code": "INVALID_REQUEST"
}
```

**400 Bad Request** - Public IP rejected (security enforcement):
```json
{
  "error": "VPC CIDR \"8.8.8.0/16\" uses public IP space. The entire range must fall within a private RFC 1918 block: 10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16. Public IPs expose nodes to the internet (critical security risk). Use private subnets for Kubernetes nodes and public subnets only for load balancers/ingress controllers.",
  "code": "NETWORK_GENERATION_ERROR"
}
```

**404 Not Found** - No API route for that path and method (paths are case-sensitive):
```json
{
  "error": "Not found",
  "code": "NOT_FOUND"
}
```

**429 Too Many Requests** - More than 100 API requests in a minute from one IP:
```json
{
  "error": "Too many requests. Please wait a minute and try again.",
  "code": "RATE_LIMITED"
}
```

**500 Internal Server Error** - Server error:
```json
{
  "error": "Failed to generate network plan",
  "code": "INTERNAL_ERROR"
}
```

#### Deployment Tiers Overview

Subnet counts are public / node / control plane. Sizes are prefix and address count.

| Tier | Nodes | Subnets (generic, GKE, AKS) | Subnets (EKS) | Public | Node | Control plane | Pods | Services | Min VPC (EKS) | Use Case |
|------|-------|---|---|---|---|---|---|---|---|---|
| **Micro** | 1 | 1 / 1 / 1 | 2 / 2 / 2 | /26 (64) | /25 (128) | /28 (16) | /20 (16 nodes) | /20 (4,096) | /24 (/23) | POC, Development |
| **Standard** | 1-3 | 1 / 1 / 1 | 2 / 2 / 2 | /25 (128) | /24 (256) | /28 (16) | /16 (256 nodes) | /20 (4,096) | /23 (/22) | Dev/Testing |
| **Professional** | 3-10 | 2 / 2 / 1 | 2 / 2 / 2 | /25 (128) | /23 (512) | /28 (16) | /18 (64 nodes) | /20 (4,096) | /21 (/21) | Small Production (HA-ready) |
| **Enterprise** | 10-50 | 3 / 3 / 1 | 3 / 3 / 2 | /24 (256) | /21 (2,048) | /28 (16) | /16 (256 nodes) | /20 (4,096) | /19 (/19) | Large Production (Multi-AZ) |
| **Hyperscale** | 50-5,000 | 3 / 3 / 1 | 3 / 3 / 2 | /23 (512) | /20 (4,096) | /28 (16) | /13 (2,048 nodes) | /18 (16,384) | /18 (/18) | Global Scale |

Counts are for public mode. In private mode the public count moves to load-balancer subnets, except GKE and AKS, which get a single regional load-balancer subnet. Pod node counts assume a /24 per node, which AKS CNI Overlay always assigns and GKE assigns at 65-128 max pods per node. Cloud providers reserve a few addresses in every subnet (AWS and Azure 5, GCP 4).

**Network Sizing Notes:**
- **Pod CIDR**: Separate range for container networking (GKE pod secondary range, AKS CNI Overlay `pod_cidr`, or an EKS overlay CNI such as Calico or Cilium)
- **Service CIDR**: /20 (4,096 ClusterIPs, the size GKE uses by default), or /18 for hyperscale (16,384, above Kubernetes' tested limit of 10,000 services)
- **Hyperscale pod capacity**: the /13 pod range holds 2,048 nodes at a /24 per node. Reaching 5,000 nodes needs GKE max pods per node of 32 or fewer (a /26 per node), or a /11 `podsCidr` (AKS overlay always takes a /24 per node, so on AKS only a larger range helps)
- **Public Subnets**: For load balancers, NAT gateways, and bastion hosts
- **Private Subnets**: For Kubernetes worker nodes (EC2 instances or node pools)
- **Control-plane Subnets**: one /28 (EKS: one /27 as two /28s). /28 is GKE's required master range size, AKS's minimum API server subnet, and above EKS's minimum of 6 addresses
- All networks use RFC 1918 private addressing (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16); a caller-supplied `podsCidr` may also use 100.64.0.0/10

#### Supported Providers

- **EKS** - AWS Elastic Kubernetes Service. Subnets across at least two AZs; `pods.cidr` is for an overlay CNI (Calico, Cilium). It cannot be added to the VPC as a secondary CIDR for VPC CNI custom networking, because AWS refuses CIDRs from a different RFC 1918 block than the VPC's
- **GKE** - Google Kubernetes Engine (VPC-native). Node subnet with pod and service secondary ranges; regional subnets, no zones
- **AKS** - Azure Kubernetes Service with Azure CNI Overlay (`network_plugin_mode = "overlay"`). Regional subnets, no zones
- **Kubernetes** / **k8s** - Generic self-hosted or alternative cloud providers

## Supported Network Classes

The calculator supports all five IPv4 address classes:

### Class A
- **Address Range**: 1-126 (first octet)
- **Default Mask**: 255.0.0.0 (/8)
- **Usable Hosts per Network**: 16,777,214 (2²⁴ - 2)
- **Example**: `10.0.0.0/8` - RFC 1918 private network

### Class B
- **Address Range**: 128-191 (first octet)
- **Default Mask**: 255.255.0.0 (/16)
- **Usable Hosts per Network**: 65,534 (2¹⁶ - 2)
- **Example**: `172.16.0.0/12` - RFC 1918 private network

### Class C
- **Address Range**: 192-223 (first octet)
- **Default Mask**: 255.255.255.0 (/24)
- **Usable Hosts per Network**: 254 (2⁸ - 2)
- **Example**: `192.168.0.0/16` - RFC 1918 private network

### Class D (Multicast)
- **Address Range**: 224-239 (first octet)
- **Usage**: Reserved for multicast traffic
- **Example**: `224.0.0.1` - All hosts multicast

### Class E (Reserved)
- **Address Range**: 240-255 (first octet)
- **Usage**: Reserved for future use and research

## RFC 1918 Private Address Ranges

The calculator includes pre-configured examples for the three RFC 1918 private address ranges:
- `10.0.0.0/8` - Class A private (entire first octet)
- `172.16.0.0/12` - Class B private (172.16.0.0 to 172.31.255.255)
- `192.168.0.0/16` - Class C private (65,536 addresses)

## Example CIDR Ranges

- `10.0.0.0/8` - Class A private network (16,777,216 addresses)
- `172.16.0.0/12` - Class B private network (1,048,576 addresses)
- `192.168.0.0/16` - Class C private network (65,536 addresses)
- `192.168.1.0/24` - Class C subnet (256 addresses)

## Project Documentation

Comprehensive documentation is available to help developers understand and contribute to this project:

### For Contributors & AI Agents
- **[.github/instructions/](.github/instructions/)** - Development guidelines, indexed from [.github/copilot-instructions.md](.github/copilot-instructions.md):
  - [general](.github/instructions/general.instructions.md): architecture, security protocols, conventions
  - [backend](.github/instructions/backend.instructions.md): server, API, CSP, rate limiting
  - [frontend](.github/instructions/frontend.instructions.md): React, Tailwind CSS v4, design tokens
  - [testing](.github/instructions/testing.instructions.md): test strategy and coverage
- **[.github/swagger-ui-theming.md](.github/swagger-ui-theming.md)** - How the API docs page is styled, and how to upgrade Swagger UI
- **[docs/git-conventions.md](docs/git-conventions.md)** - Commit message conventions
- **[CHANGELOG.md](CHANGELOG.md)** - Release notes; **[SECURITY.md](SECURITY.md)** - Vulnerability reporting and security policy

### Testing & Quality
- **[tests/README.md](tests/README.md)** - Comprehensive testing documentation
- **[docs/test-suite-analysis.md](docs/test-suite-analysis.md)** - Detailed test suite analysis and health metrics

### API & Compliance
- **[docs/api.md](docs/api.md)** - Kubernetes Network Planning API reference
- **[docs/compliance/](docs/compliance/)** - Platform-specific compliance audits:
  - [EKS_COMPLIANCE_AUDIT.md](docs/compliance/EKS_COMPLIANCE_AUDIT.md) - AWS Elastic Kubernetes Service
  - [GKE_COMPLIANCE_AUDIT.md](docs/compliance/GKE_COMPLIANCE_AUDIT.md) - Google Kubernetes Engine
  - [AKS_COMPLIANCE_AUDIT.md](docs/compliance/AKS_COMPLIANCE_AUDIT.md) - Azure Kubernetes Service

## Author

Created by [nicholashoule](https://github.com/nicholashoule)

## Contributing

We welcome contributions! Please follow these guidelines:

### Before You Start

1. **Read the development guidelines**: Review [.github/instructions/](.github/instructions/) for:
   - Project architecture and structure
   - Code style and naming conventions
   - Robustness and hardening principles
   - Security audit requirements (mandatory)
   - API planning documentation

2. **Review recent changes**: [CHANGELOG.md](CHANGELOG.md) explains what changed and why, including the network allocation rules.

3. **Understand commit conventions**: Follow [Conventional Commits](https://www.conventionalcommits.org/) as documented in [docs/git-conventions.md](docs/git-conventions.md):
   - Use `feat:` for new features
   - Use `fix:` for bug fixes
   - Use `docs:` for documentation
   - Use `chore:` for maintenance
   - Use `refactor:`, `test:`, `perf:`, `style:`, `ci:` as appropriate

### Development Workflow

1. **Set up environment**: Follow the [Development Setup](#development-setup) section above
2. **Create a feature branch**: `git checkout -b feat/your-feature-name`
3. **Make your changes**: Ensure code follows project conventions
4. **Test thoroughly**: 
   - Run the [CI checks](#continuous-integration) locally
   - Test on Windows, macOS, or Linux
   - Test both light and dark modes
5. **Commit with clear messages**: Use conventional commit format
6. **Submit changes**: Create a pull request with description

### Code Standards

- **TypeScript**: Strict mode enabled (`strict: true`)
- **No `any` types**: Always provide proper types
- **Icons**: Use Lucide React only, no unicode characters
- **Styling**: Tailwind CSS utilities, no inline styles
- **Components**: React functional components with hooks
- **Validation**: Use Zod for input validation

### Testing Your Changes

```bash
# Everything CI runs
npm audit && npm run check && npm test -- --run && npm run build && npm run smoke

# Then try it in a browser
npm run dev
```

Visit `http://127.0.0.1:5000` (and `/api/docs/ui`) and test:
- Subnet calculations with various CIDR notations
- Recursive splitting and deletion
- CSV export functionality
- Light/dark mode switching
- Mobile responsiveness
- Error handling with invalid inputs

### Project Structure

Before making changes, understand:
- **Client**: `client/src/` - React components, utilities, styles
- **Server**: `server/` - Express.js backend: the Kubernetes planning API, OpenAPI docs, and static serving
- **Shared**: `shared/` - TypeScript types and Zod schemas
- **Documentation**: `.github/instructions/` (developer guidelines) and `docs/` (API and compliance references)

### Questions or Issues?

- Review the [Project Documentation](#project-documentation) section above for comprehensive guides
- Search existing issues for similar problems
- When opening new issues, provide clear context and steps to reproduce

## License

MIT. See [LICENSE](LICENSE).
