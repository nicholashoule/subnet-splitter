# CIDR Subnet Calculator

A modern web application for calculating subnet details, splitting CIDR ranges recursively, and planning network configurations.

## Features

- **Subnet Calculation**: Enter any CIDR notation to get detailed network information
- **Recursive Splitting**: Split networks into smaller subnets down to /32 (single host)
- **Interactive Table**: Expand/collapse subnet hierarchies with visual indentation
- **Copy to Clipboard**: Click to copy any field value (network address, broadcast, hosts, etc.)
- **CSV Export**: Select rows and export subnet details to CSV for use in Excel or other tools
- **Dark/Light Mode**: Theme support with elegant UI
- **Responsive Design**: Works on desktop and mobile devices

## Network Information Provided

- CIDR notation and prefix length
- Network address and broadcast address
- First and last usable host addresses
- Total addresses and usable hosts count
- Subnet mask and wildcard mask
- Network class classification

## Security

This application follows a **security by design** approach:

- **No database**: No user data to protect or risk exposing
- **No API endpoints**: No server-side attack vectors
- **Client-side calculations**: All subnet logic runs in the browser
- **Helmet middleware**: Adds security headers (XSS, clickjacking, MIME sniffing protection)
- **Static isolation**: Only compiled assets from `dist/public` are served in production
- **Replit platform**: Additional DDoS and network-level protection

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
│   ├── index.ts            # Entry point
│   ├── routes.ts           # API routes
│   └── vite.ts             # Vite dev server setup
├── shared/                 # Shared code
│   └── schema.ts           # TypeScript types and Zod schemas
└── package.json
```

## Getting Started

### Development

```bash
npm install
npm run dev
```

The application will be available at `http://localhost:5000`.

### Production Build

```bash
npm run build
npm start
```

## Usage

1. Enter a CIDR notation (e.g., `192.168.1.0/24`) in the input field
2. Click "Calculate" or use one of the example buttons
3. View the subnet details in the Network Overview card
4. Use the split button to divide subnets into smaller ranges
5. Select rows with checkboxes and export to CSV

## Example CIDR Ranges

- `192.168.1.0/24` - Class C network (256 addresses)
- `10.0.0.0/16` - Large private network (65,536 addresses)
- `172.16.0.0/12` - Private network range (1,048,576 addresses)
- `192.168.0.0/22` - Supernet (1,024 addresses)

## Author

Created by [nicholashoule](https://github.com/nicholashoule)

## License

MIT
