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
- **Storage**: All subnet calculations are performed client-side (no database required for core features)
- **Schema Location**: `shared/schema.ts` - TypeScript types and Zod schemas shared between frontend and backend
- **Validation**: Zod schemas for input validation (CIDR format)
- **State Management**: React useState/useCallback hooks for local state (rootSubnet tree, selectedIds, statusMessage)

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
├── README.md               # Project documentation
└── agent-reasoning.md      # Development prompts and reasoning
```

### Build Configuration
- **Development**: `npm run dev` - runs tsx with Vite middleware
- **Production Build**: `npm run build` - Vite builds client, esbuild bundles server
- **Database Sync**: `npm run db:push` - Drizzle Kit schema push

### Type Safety
- Path aliases configured: `@/*` for client, `@shared/*` for shared code
- Strict TypeScript with module bundler resolution
- Zod schemas ensure runtime validation matches static types

## External Dependencies

### Core Libraries
- **subnet-utils.ts**: Custom library for CIDR calculations (calculateSubnet, splitSubnet, formatNumber, getSubnetClass)

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
- **Security by design**: No database, no sensitive API endpoints, all calculations client-side
- **Static isolation**: Production only serves compiled assets from `dist/public`
- **Replit platform**: DDoS protection and network-level firewall

### Session Management
- **connect-pg-simple**: PostgreSQL session store (available but not currently active)
- **memorystore**: In-memory session alternative