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
│       ├── lib/            # Utilities (subnet-utils)
│       └── pages/          # Route components
├── server/                 # Express backend
│   ├── index.ts            # Entry point with Helmet + security configuration
│   ├── routes.ts           # API route definitions (Kubernetes Network Planning)
│   ├── vite.ts             # Vite dev server setup with SPA fallback
│   └── static.ts           # Static file serving with rate limiting
├── tests/                  # Comprehensive unit and integration test suite
│   ├── unit/               # Unit tests (subnet-utils.test.ts)
│   ├── integration/        # Integration tests (styles, config, etc.)
│   └── README.md           # Testing documentation
├── shared/                 # Shared code
│   └── schema.ts           # TypeScript types and Zod schemas
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

**Start development server:**
```bash
npm run dev
```

The application will be available at `http://localhost:5000` or `http://127.0.0.1:5000`.

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
```

The project includes a comprehensive test suite with **144 tests** (100% passing) covering:

**Unit Tests (53):**
- IP address conversion and validation
- CIDR prefix/mask calculations for all prefix lengths (0-32)
- Subnet splitting and calculations
- Network class identification (Classes A-E including multicast and reserved)
- Edge cases (RFC 3021 point-to-point /31, /32 host routes, /0 all-IPv4)
- RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Error handling and validation with clear error messages
- Subnet tree operations (countSubnetNodes)

**Integration Tests (91):**
- CSS variable definitions (light and dark modes)
- WCAG accessibility compliance (contrast ratio validation)
- Color palette consistency
- Tailwind CSS integration
- Design system documentation validation
- Header styling and layout
- Footer styling and layout
- Configuration validation

See [tests/README.md](tests/README.md) for comprehensive testing documentation.

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

#### Endpoint 1: Generate Network Plan

**POST `/api/kubernetes/network-plan`**

Generate an optimized network plan with subnet allocation, pod CIDR, and service CIDR ranges.

**Request Parameters:**
```json
{
  "deploymentSize": "standard|professional|enterprise|hyperscale",
  "provider": "eks|gke|kubernetes",
  "vpcCidr": "10.0.0.0/16",
  "deploymentName": "my-cluster"
}
```

- `deploymentSize` (required): Deployment tier for cluster size
- `provider` (optional): Cloud provider (`eks`, `gke`, `kubernetes`). Defaults to `kubernetes`
- `vpcCidr` (optional): Custom VPC CIDR. If omitted, generates random RFC 1918 range
- `deploymentName` (optional): Reference name for deployment tracking

**Example Request:**
```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks",
    "vpcCidr": "10.0.0.0/16",
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
    "cidr": "10.0.0.0/16"
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

**GET `/api/kubernetes/tiers`**

Retrieve information about all available deployment tiers and their configurations.

**Example Request:**
```bash
curl http://localhost:5000/api/kubernetes/tiers
```

**Response:**
```json
{
  "standard": {
    "publicSubnets": 1,
    "privateSubnets": 1,
    "subnetSize": 24,
    "podsPrefix": 16,
    "servicesPrefix": 16,
    "description": "Development/Testing: 1-3 nodes, minimal subnet allocation"
  },
  "professional": {
    "publicSubnets": 2,
    "privateSubnets": 2,
    "subnetSize": 23,
    "podsPrefix": 16,
    "servicesPrefix": 16,
    "description": "Small Production: 3-10 nodes, dual AZ ready"
  },
  "enterprise": {
    "publicSubnets": 3,
    "privateSubnets": 3,
    "subnetSize": 23,
    "podsPrefix": 16,
    "servicesPrefix": 16,
    "description": "Large Production: 10-50 nodes, triple AZ ready with HA"
  },
  "hyperscale": {
    "publicSubnets": 8,
    "privateSubnets": 8,
    "subnetSize": 19,
    "podsPrefix": 13,
    "servicesPrefix": 16,
    "description": "Global Scale: 50-5000 nodes, multi-region ready (EKS/GKE max), GKE-optimized"
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

**500 Internal Server Error** - Server error:
```json
{
  "error": "Failed to generate network plan",
  "code": "INTERNAL_ERROR"
}
```

#### Deployment Tiers Overview

| Tier | Nodes | Public Subnets | Private Subnets | Subnet Size | Use Case |
|------|-------|---|---|---|---|
| **Micro** | 1 | 1 | 1 | /25 | POC, Development |
| **Standard** | 1-3 | 1 | 1 | /24 | Dev/Testing |
| **Professional** | 3-10 | 2 | 2 | /23 | Small Production (HA-ready) |
| **Enterprise** | 10-50 | 3 | 3 | /23 | Large Production (Multi-AZ) |
| **Hyperscale** | 50-5000 | 8 | 8 | /19 | Global Scale (EKS/GKE max) |

#### Supported Providers

- **EKS** - AWS Elastic Kubernetes Service with VPC CNI
- **GKE** - Google Kubernetes Engine with Alias IP ranges
- **AKS** - Azure Kubernetes Service with Azure CNI Overlay
- **Kubernetes** - Generic self-hosted or alternative cloud providers

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
