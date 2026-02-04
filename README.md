# CIDR Subnet Calculator

A modern web application for calculating subnet details, splitting CIDR ranges recursively, and planning network configurations.

## Features

### Frontend Application
- **Subnet Calculation**: Enter any CIDR notation to get detailed network information
- **Recursive Splitting**: Split networks into smaller subnets down to /32 (single host)
- **Interactive Table**: Expand/collapse subnet hierarchies with visual indentation
- **Copy to Clipboard**: Click to copy any field value (network address, broadcast, hosts, etc.)
- **CSV Export**: Select rows and export subnet details to CSV for use in Excel or other tools
- **Dark/Light Mode**: Theme support with elegant UI
- **Responsive Design**: Works on desktop and mobile devices

### Backend API (Production-Ready)
- **Kubernetes Network Planning**: Generate optimized network plans for EKS, GKE, AKS, and generic Kubernetes
- **Multi-Cloud Support**: Battle-tested configurations for all major cloud providers
- **Deployment Tiers**: Pre-configured subnet allocations (Micro → Hyperscale)
- **Provider Flexibility**: Same API works with AWS, Google Cloud, Azure, and self-hosted Kubernetes

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
- **Stateless API**: All operations are deterministic (same input = same output)
- **Client-side calculations**: All subnet logic runs in the browser
- **Helmet middleware**: Adds security headers for XSS, clickjacking, and MIME sniffing protection
- **Content Security Policy (CSP)**: 
  - Strict policy in production: `script-src 'self'` only
  - Relaxed policy in development: allows Vite HMR and React Fast Refresh
  - Prevents inline script injection attacks
- **Rate limiting**: Production SPA routes protected with rate limiting (30 requests per 15 minutes)
- **Static isolation**: Only compiled assets from `dist/public` are served in production
- **Request validation**: All API requests validated with Zod schemas
- **No vulnerabilities**: `npm audit` reports 0 vulnerabilities

### Security Best Practices
- Environment-aware configuration for dev vs production
- File extension checks prevent serving source files as HTML
- Middleware ordering protects asset serving from SPA fallback interference
- All security settings documented; core protections covered by automated tests

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **shadcn/ui** component library (Radix UI primitives)
- **React Hook Form** with Zod validation
- **Vite** for building and development

### Backend
- **Express.js 5** with TypeScript
- **Node.js** runtime
- **Helmet** for security headers
- **express-rate-limit** for DoS protection
- In-memory storage (no database required for core functionality)

## Project Structure

```
├── client/                 # React frontend
│   └── src/
│       ├── components/ui/  # shadcn/ui components
│       ├── hooks/          # Custom React hooks
│       ├── lib/            # Utilities (subnet-utils, kubernetes-network-generator)
│       └── pages/          # Route components
├── server/                 # Express backend
│   ├── index.ts            # Entry point with Helmet + security configuration
│   ├── routes.ts           # API route definitions (Kubernetes Network Planning)
│   ├── vite.ts             # Vite dev server setup with SPA fallback
│   └── static.ts           # Static file serving with rate limiting
├── tests/                  # Comprehensive unit and integration test suite
│   ├── unit/               # Unit tests (subnet-utils.test.ts, kubernetes-network-generator.test.ts, emoji-detection.test.ts)
│   ├── integration/        # Integration tests (styles, API, config, security)
│   ├── manual/             # PowerShell manual testing scripts
│   └── README.md           # Testing documentation
├── scripts/                # Build and utility tools
│   ├── build.ts            # Production build orchestration
│   └── fix-emoji.ts        # Emoji detection and auto-fix CLI tool
├── docs/                   # Reference documentation
│   ├── API.md              # Kubernetes Network Planning API reference
│   └── compliance/         # Platform-specific compliance audits
│       ├── AKS_COMPLIANCE_AUDIT.md   # Azure Kubernetes Service
│       ├── EKS_COMPLIANCE_AUDIT.md   # AWS Elastic Kubernetes Service
│       └── GKE_COMPLIANCE_AUDIT.md   # Google Kubernetes Engine
├── shared/                 # Shared code
│   ├── schema.ts           # TypeScript types and Zod schemas
│   └── kubernetes-schema.ts # Kubernetes API schemas
└── package.json
```

## Getting Started

### Development Setup

#### Prerequisites
- Node.js v20+ ([download](https://nodejs.org/))
- npm v11+ (comes with Node.js)
- Git

#### Installation

**Clone the repository:**
```bash
git clone https://github.com/nicholashoule/subnet-cidr-splitter.git
cd subnet-cidr-splitter
```

**Install dependencies:**
```bash
npm install
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

The application will be available at `http://localhost:5000` or `http://127.0.0.1:5000`.

**Access the application:**
- Web UI: Open `http://127.0.0.1:5000` in your browser
- API endpoint: `POST http://127.0.0.1:5000/api/k8s/plan`
- Tier info: `GET http://127.0.0.1:5000/api/k8s/tiers`
- API docs: `http://127.0.0.1:5000/api/docs/ui` (Swagger UI)

#### Windows-Specific Setup

On Windows, use `npm.cmd` instead of `npm`:

```bash
npm.cmd install
npm.cmd run dev
```

The development server automatically handles Windows network binding compatibility (falls back from `0.0.0.0` to `127.0.0.1` if needed).

**Note:** Line endings are normalized to LF via `.gitattributes`, so Git may show CRLF warnings on Windows. This is normal and safe.

### Production Build

```bash
npm run build
npm start
```

The production build creates optimized assets in the `dist/` directory.

### Type Checking

```bash
npm run check
npm.cmd run check
```

Verify TypeScript compilation without emitting files.

### Testing

```bash
# Run all tests
npm run test

# Run tests with interactive UI
npm run test:ui

# Run tests in watch mode (default)
npm run test
npm.cmd run test -- --run

# Run specific test file
npm run test -- tests/unit/subnet-utils.test.ts
npm run test -- tests/integration/styles.test.ts

# Run API tests specifically (JSON/YAML validation)
npm run test -- tests/integration/kubernetes-network-api.test.ts --run

# Run only JSON/YAML format tests
npm run test -- tests/integration/kubernetes-network-api.test.ts -t "Output Format" --run

# Run emoji detection tests
npm run test:emoji

# Check for emoji in codebase
npm run emoji:check

# Auto-fix emoji in codebase
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

The project includes a comprehensive test suite with **371 tests** (100% passing) covering:

**Unit Tests (121):**
- **Subnet calculations (53 tests)**: IP address conversion and validation, CIDR prefix/mask calculations for all prefix lengths (0-32), subnet splitting and calculations, network class identification (Classes A-E including multicast and reserved), edge cases (RFC 3021 point-to-point /31, /32 host routes, /0 all-IPv4), RFC 1918 private ranges, error handling with clear error messages, subnet tree operations
- **Kubernetes network generation (57 tests)**: Network plan generation, deployment tier configurations, RFC 1918 private IP enforcement, subnet allocation algorithms
- **Emoji detection (11 tests)**: Scans all markdown and source files for emoji, validates clean text-based documentation, reports violations with file/line numbers

**Integration Tests (250):**
- **API endpoints (38 tests)**: API infrastructure, health checks, OpenAPI spec, Swagger UI
- **Kubernetes Network Planning API (89 tests)**: JSON/YAML output formats, RFC 1918 enforcement, public IP rejection, all deployment tiers and providers, differentiated subnet sizing
- **Security (65 tests)**: Rate limiting middleware, CSP enforcement, CSP violation endpoint, Swagger UI CSP middleware
- **UI components (50 tests)**: Calculator UI behavior, WCAG accessibility compliance
- **Configuration (8 tests)**: Build configuration validation, environment setup

See [tests/README.md](tests/README.md) for comprehensive testing documentation and [docs/TEST_AUDIT.md](docs/TEST_AUDIT.md) for detailed test suite analysis.

## Windows Compatibility

This project is fully tested on Windows and includes several optimizations for cross-platform support:

- **Line Endings**: Configured via `.gitattributes` to use LF (Unix-style) for all source files
- **npm Scripts**: Uses `cross-env` package to handle environment variables on Windows cmd
- **Server Binding**: Automatic fallback from `0.0.0.0` to `127.0.0.1` to `localhost` if needed
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

**WARNING Security Requirement:** All VPC CIDRs **must use private RFC 1918 IP ranges**. Public IPs are rejected with security guidance. See full [API documentation](docs/API.md) for details.

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
  "vpcCidr": "10.100.0.0/18",
  "deploymentName": "my-cluster"
}
```

- `deploymentSize` (required): Deployment tier for cluster size
- `provider` (optional): Cloud provider (`eks`, `gke`, `aks`, `kubernetes`, `k8s`). Defaults to `kubernetes`. Note: `k8s` is an alias for `kubernetes`
- `vpcCidr` (optional): **Private RFC 1918 CIDR only** (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16). If omitted, generates random RFC 1918 range
- `deploymentName` (optional): Reference name for deployment tracking

**Accepted Private IP Ranges:**
- [PASS] Class A: `10.0.0.0/8` (any /16 or larger subnet within this range)
- [PASS] Class B: `172.16.0.0/12` (172.16.0.0 - 172.31.255.255)
- [PASS] Class C: `192.168.0.0/16` (any subnet within this range)

**Rejected Public IPs:** All non-RFC 1918 ranges are rejected (e.g., `8.8.8.0/16`, `1.1.1.0/16`, `200.0.0.0/16`)

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
  "deploymentName": "prod-us-east-1",
  "vpc": {
    "cidr": "10.100.0.0/18"
  },
  "subnets": {
    "public": [
      {
        "cidr": "10.0.0.0/24",
        "name": "public-1",
        "type": "public"
      },
      {
        "cidr": "10.0.1.0/24",
        "name": "public-2",
        "type": "public"
      }
    ],
    "private": [
      {
        "cidr": "10.0.2.0/23",
        "name": "private-1",
        "type": "private"
      },
      {
        "cidr": "10.0.4.0/23",
        "name": "private-2",
        "type": "private"
      }
    ]
  },
  "pods": {
    "cidr": "10.1.0.0/16"
  },
  "services": {
    "cidr": "10.2.0.0/16"
  },
  "metadata": {
    "generatedAt": "2026-02-01T15:30:45.123Z",
    "version": "1.0"
  }
}
```

#### Endpoint 2: Get Deployment Tiers

**GET `/api/k8s/tiers`**

Retrieve information about all available deployment tiers and their configurations.

**Example Request:**
```bash
curl http://localhost:5000/api/k8s/tiers
```

**Response:**
```json
{
  "micro": {
    "publicSubnets": 1,
    "privateSubnets": 1,
    "publicSubnetSize": 26,
    "privateSubnetSize": 25,
    "minVpcPrefix": 24,
    "podsPrefix": 18,
    "servicesPrefix": 16,
    "description": "Single Node: 1 node, minimal subnet allocation (proof of concept)"
  },
  "standard": {
    "publicSubnets": 1,
    "privateSubnets": 1,
    "publicSubnetSize": 25,
    "privateSubnetSize": 24,
    "minVpcPrefix": 23,
    "podsPrefix": 16,
    "servicesPrefix": 16,
    "description": "Development/Testing: 1-3 nodes, minimal subnet allocation"
  },
  "professional": {
    "publicSubnets": 2,
    "privateSubnets": 2,
    "publicSubnetSize": 25,
    "privateSubnetSize": 23,
    "minVpcPrefix": 21,
    "podsPrefix": 16,
    "servicesPrefix": 16,
    "description": "Small Production: 3-10 nodes, dual AZ ready"
  },
  "enterprise": {
    "publicSubnets": 3,
    "privateSubnets": 3,
    "publicSubnetSize": 24,
    "privateSubnetSize": 21,
    "minVpcPrefix": 18,
    "podsPrefix": 16,
    "servicesPrefix": 16,
    "description": "Large Production: 10-50 nodes, triple AZ ready with HA"
  },
  "hyperscale": {
    "publicSubnets": 3,
    "privateSubnets": 3,
    "publicSubnetSize": 23,
    "privateSubnetSize": 20,
    "minVpcPrefix": 18,
    "podsPrefix": 13,
    "servicesPrefix": 16,
    "description": "Global Scale: 50-5000 nodes, multi-region ready (EKS/GKE max)"
  }
}
```

#### API Error Responses

**400 Bad Request** - Invalid parameters:
```json
{
  "error": "Invalid deployment size: unknown",
  "code": "NETWORK_GENERATION_ERROR"
}
```

**400 Bad Request** - Public IP rejected (security enforcement):
```json
{
  "error": "VPC CIDR \"8.8.8.0/16\" uses public IP space. Kubernetes deployments MUST use private RFC 1918 ranges: 10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16. Public IPs expose nodes to the internet (critical security risk). Use private subnets for Kubernetes nodes and public subnets only for load balancers/ingress controllers.",
  "code": "NETWORK_GENERATION_ERROR"
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

| Tier | Nodes | Public Subnets | Private Subnets | Public Size | Private Size | Pod CIDR | Service CIDR | Use Case |
|------|-------|---|---|---|---|---|---|---|
| **Micro** | 1 | 1 | 1 | /26 (62 IPs) | /25 (126 IPs) | /20 (4K IPs) | /16 (65K IPs) | POC, Development |
| **Standard** | 1-3 | 1 | 1 | /25 (126 IPs) | /24 (254 IPs) | /16 (65K IPs) | /16 (65K IPs) | Dev/Testing |
| **Professional** | 3-10 | 2 | 2 | /25 (126 IPs) | /23 (510 IPs) | /18 (16K IPs) | /16 (65K IPs) | Small Production (HA-ready) |
| **Enterprise** | 10-50 | 3 | 3 | /24 (254 IPs) | /21 (2K IPs) | /16 (65K IPs) | /16 (65K IPs) | Large Production (Multi-AZ) |
| **Hyperscale** | 50-5000 | 3 | 3 | /23 (510 IPs) | /20 (4K IPs) | /16 (65K IPs) | /16 (65K IPs) | Global Scale (EKS/GKE max) |

**Network Sizing Notes:**
- **Pod CIDR**: Separate IP range for container networking (via CNI plugins like AWS VPC CNI, Calico, or Cilium)
- **Service CIDR**: Kubernetes ClusterIP range for service discovery (10.2.0.0/16 by default, can be customized)
- **Public Subnets**: For load balancers, NAT gateways, and bastion hosts
- **Private Subnets**: For Kubernetes worker nodes (EC2 instances or node pools)
- All networks use RFC 1918 private addressing (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)

#### Supported Providers

- **EKS** - AWS Elastic Kubernetes Service with VPC CNI
- **GKE** - Google Kubernetes Engine with Alias IP ranges
- **AKS** - Azure Kubernetes Service with Azure CNI Overlay
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
- `172.16.0.0/12` - Class B private (16.0.0.0 to 31.255.255.255)
- `192.168.0.0/16` - Class C private (65,536 addresses)

## Example CIDR Ranges

- `10.0.0.0/8` - Class A private network (16,777,216 addresses)
- `172.16.0.0/12` - Class B private network (1,048,576 addresses)
- `192.168.0.0/16` - Class C private network (65,536 addresses)
- `192.168.1.0/24` - Class C subnet (256 addresses)

## Author

Created by [nicholashoule](https://github.com/nicholashoule)

## Contributing

We welcome contributions! Please follow these guidelines:

### Before You Start

1. **Read the guidelines**: Review [.github/.copilot-instructions.md](.github/.copilot-instructions.md) for:
   - Project architecture and structure
   - Code style and naming conventions
   - Robustness and hardening principles
   - API planning documentation

2. **Understand commit conventions**: Follow [Conventional Commits](https://www.conventionalcommits.org/) as documented in [.github/.copilot-instructions.md](.github/.copilot-instructions.md#git-commit-message-conventions):
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
   - Test on Windows, macOS, or Linux
   - Run `npm run check` for TypeScript validation
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
# Type check
npm run check

# Build for production
npm run build

# Run development server
npm run dev
```

Visit `http://localhost:5000` and test:
- Subnet calculations with various CIDR notations
- Recursive splitting and deletion
- CSV export functionality
- Light/dark mode switching
- Mobile responsiveness
- Error handling with invalid inputs

### Project Structure

Before making changes, understand:
- **Client**: `client/src/` - React components, utilities, styles
- **Server**: `server/` - Express.js backend (currently static serving only)
- **Shared**: `shared/` - TypeScript types and Zod schemas
- **Documentation**: `.github/` - Developer guidelines and reasoning

### Questions or Issues?

- Review [.github/agent-reasoning.md](.github/agent-reasoning.md) for development history and decisions
- Check existing issues for similar problems
- Ask clearly and provide context in your issue description

## License

MIT
