# CIDR Subnet Calculator

## Overview

This is a CIDR Subnet Calculator web application that allows users to calculate subnet details, split CIDR ranges recursively, and plan network configurations. The application features an interactive interface for visualizing subnet hierarchies and provides detailed network information including network addresses, broadcast addresses, host ranges, and subnet masks.

### Key Features
- CIDR input with validation and example presets
- Recursive subnet splitting down to /32
- Hierarchical table with expand/collapse functionality
- Copy-to-clipboard for all IP addresses and values
- Row selection with checkboxes and "Select All"
- CSV export of selected subnets for Excel/spreadsheet use
- Elegant scrollbar styling
- Dark/light mode support

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React hooks for local state
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Framework**: Express.js 5 with TypeScript
- **Runtime**: Node.js with tsx for TypeScript execution
- **API Pattern**: RESTful endpoints prefixed with `/api`
- **Static Serving**: Built client assets served from `dist/public`
- **Development**: Vite dev server middleware for HMR support

### Data Layer
- **Architecture**: All subnet calculations performed client-side (no database required)
- **Storage**: React state management using useState/useCallback hooks
- **Schema**: `shared/schema.ts` - TypeScript types and Zod schemas for validation
- **Validation**: Zod schemas validate CIDR notation format and network address correctness
- **State**: rootSubnet (subnet tree), selectedIds (CSV export), statusMessage (operation feedback)
- **Benefits**: Instant calculations, offline support, no server load, enhanced privacy

### Project Structure
```
├── client/                 # React frontend
│   └── src/
│       ├── components/ui/  # shadcn/ui components
│       ├── hooks/          # Custom React hooks (use-toast, use-mobile)
│       ├── lib/            # Utilities (subnet-utils, queryClient, utils)
│       └── pages/          # Route components (calculator.tsx)
├── server/                 # Express backend
│   ├── index.ts            # Entry point
│   ├── routes.ts           # API route registration
│   ├── storage.ts          # Data access layer (in-memory)
│   ├── static.ts           # Static file serving
│   └── vite.ts             # Vite dev server setup
├── shared/                 # Shared code between frontend/backend
│   └── schema.ts           # TypeScript types + Zod schemas
├── tests/                  # Comprehensive test suite
│   ├── unit/               # Unit tests
│   │   └── subnet-utils.test.ts  # Subnet calculation tests (38 tests)
│   ├── integration/        # Integration tests (placeholder)
│   └── README.md           # Testing documentation
├── .github/                # GitHub and development documentation
│   ├── .copilot-instructions.md # Developer guidelines and conventions
│   └── agent-reasoning.md       # Development history and decisions
├── README.md               # Project documentation
└── package.json            # Dependencies and scripts
```

### Build Configuration
- **Development**: `npm run dev` - Runs Express server with Vite middleware for hot reload
- **Production Build**: `npm run build` - Vite builds client, tsx bundles server with esbuild
- **Type Checking**: `npm run check` - Verify TypeScript compilation
- **Cross-Platform**: `npm.cmd` on Windows (see Windows Compatibility section)

### Robustness & Hardening
- **Input Validation**: Validates CIDR notation format and ensures IP matches network address
- **Error Boundaries**: React error boundary component for graceful error recovery
- **State Validation**: Validates subnet operations (split, delete) before state changes
- **Tree Size Limits**: MAX_TREE_NODES (10,000) prevents memory exhaustion
- **Number Overflow Protection**: Explicit validation in bitwise operations
- **Error Handling**: Custom `SubnetCalculationError` for specific, actionable error messages
- **Windows Compatibility**: Server binding fallback from 0.0.0.0 → 127.0.0.1 → localhost

### Type Safety
- Path aliases configured: `@/*` for client, `@shared/*` for shared code
- Strict TypeScript with module bundler resolution
- Zod schemas ensure runtime validation matches static types

## External Dependencies

### Core Libraries
- **subnet-utils.ts**: Custom library for CIDR calculations (calculateSubnet, splitSubnet, formatNumber, getSubnetClass)- **Zod**: Runtime type validation and schema definition
### UI Libraries
- **Radix UI**: Full suite of accessible UI primitives
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel component
- **React Day Picker**: Calendar/date picker
- **Vaul**: Drawer component
- **cmdk**: Command palette component

### Development Tools
- **Replit Plugins**: Runtime error overlay, cartographer, dev banner (development only)
- **PostCSS/Autoprefixer**: CSS processing

### Security
- **helmet**: Security headers middleware (XSS protection, clickjacking prevention, MIME sniffing protection)
- **Security by design**: 
  - No database = no user data to protect
  - No API endpoints = minimal attack surface
  - Client-side calculations = no server-side vulnerabilities
  - Static assets only = reduced exposure
- **Static isolation**: Production only serves compiled assets from `dist/public`
- **Replit platform**: Additional DDoS protection and network-level firewall

### Development & Documentation
- **Commit Conventions**: Follows Conventional Commits (feat, fix, docs, chore, etc.)
- **Documentation**: 
  - `README.md` - Project overview and usage
  - `.github/.copilot-instructions.md` - Developer guidelines and conventions
  - `.github/agent-reasoning.md` - Development history and decisions
- **Line Endings**: `.gitattributes` normalizes to LF across platforms
- **Git Ignore**: Comprehensive `.gitignore` for Windows, macOS, and Linux

### Session Management
- **Not implemented**: No user sessions needed (stateless calculations)
- **Not active**: Database dependencies (connect-pg-simple, drizzle-orm) present but unused