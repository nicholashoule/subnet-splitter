/**
 * server/csp-config.ts
 * 
 * Centralized Content Security Policy (CSP) configuration.
 * 
 * This module defines CSP directives used across the application to prevent drift
 * between global and route-specific policies. Both server/index.ts (global Helmet CSP)
 * and server/routes.ts (Swagger UI override) reference these shared directives.
 * 
 * Design:
 * - Global CSP: Applied to all endpoints via Helmet middleware
 * - Swagger UI CSP: Extends global CSP with 'unsafe-inline' for scripts (required by SwaggerUIBundle)
 * - Shared directives: Base set that both policies inherit from
 */

export interface CSPDirectives {
  [key: string]: string[];
}

/**
 * Base CSP directives applied globally to all endpoints.
 * These are strict by default for maximum security.
 */
export const baseCSPDirectives: CSPDirectives = {
  defaultSrc: ["'self'"],
  // Strict: no inline scripts on any endpoint
  // Swagger UI gets exception via route-specific override
  scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
  // 'unsafe-inline' required for:
  // - Dynamic chart inline styles (client/src/components/ui/chart.tsx)
  // - Tailwind CSS compiled styles with inline blocks
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
};

/**
 * Development-only CSP additions
 * Allows Vite HMR and Replit plugins
 * 
 * CSP Reporting Strategy:
 * - Uses 'report-uri' (deprecated but widely supported) for CSP violation reports
 * - 'report-to' (modern W3C Reporting API) not used yet due to limited browser support
 * - Modern browsers that support 'report-to' will ignore it if reporting endpoint not configured
 * - Keeping 'report-uri' ensures CSP violations are caught in all browsers during development
 * 
 * Future migration path:
 * When browser support for Reporting API becomes widespread (>95%), consider:
 * 1. Add 'report-to' directive with Reporting-Endpoints header
 * 2. Keep 'report-uri' for older browser support (gradual phase-out)
 * 3. Eventually remove 'report-uri' when legacy browser support no longer needed
 * 
 * Reference: https://w3c.github.io/reporting/
 */
export const developmentCSPAdditions: CSPDirectives = {
  scriptSrc: ["'unsafe-inline'"],
  connectSrc: ["ws://127.0.0.1:*", "ws://localhost:*"],
  reportUri: ["/__csp-violation"],
};

/**
 * Replit-specific CSP additions (development only)
 * Allows Replit runtime overlays and dev tooling
 */
export const replitCSPAdditions: CSPDirectives = {
  scriptSrc: ["https://*.replit.com", "https://*.replit.dev"],
  connectSrc: ["https://*.replit.com", "https://*.replit.dev", "wss://*.replit.com", "wss://*.replit.dev"],
  imgSrc: ["https://*.replit.com", "https://*.replit.dev"],
};

/**
 * Swagger UI-specific CSP overrides
 * 
 * This function automatically builds environment-aware CSP for Swagger UI by:
 * 1. Starting with baseCSPDirectives (ensures consistency with global policy)
 * 2. In DEVELOPMENT: Adding 'unsafe-inline' to script-src for SwaggerUIBundle inline scripts
 * 3. In PRODUCTION: Keeping strict CSP without 'unsafe-inline' to maintain security posture
 * 4. Always adding 'https://cdn.jsdelivr.net' to connect-src for source map fetching
 * 
 * Security Rationale:
 * - Production environments must maintain strict CSP (`script-src 'self'`) to prevent XSS attacks
 * - Development-only 'unsafe-inline' allows Swagger UI HMR without compromising production security
 * - The CDN connection for source maps is always permitted (non-injectable resource type)
 * 
 * Benefits of programmatic approach:
 * - Automatic synchronization: Changes to baseCSPDirectives automatically inherited
 * - No manual sync required: Eliminates risk of configuration drift
 * - Environment-aware: Security posture matches deployment environment
 * - Single source of truth: All CSP policies derive from baseCSPDirectives
 * 
 * @param isDevelopment - Whether running in development mode (process.env.NODE_ENV === 'development')
 * @returns CSP header string for the Swagger UI route
 */
export function buildSwaggerUICSP(isDevelopment: boolean = false): string {
  // Helper: Convert camelCase directive names to kebab-case (e.g., scriptSrc -> script-src)
  const toKebabCase = (str: string): string => {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  };

  // Start with a copy of baseCSPDirectives to avoid mutating the original
  const swaggerDirectives: CSPDirectives = {};
  
  // Copy all base directives
  for (const [key, values] of Object.entries(baseCSPDirectives)) {
    swaggerDirectives[key] = [...values];
  }

  // Development-only: Add 'unsafe-inline' for Swagger UI inline scripts
  // Production: Maintain strict CSP without 'unsafe-inline' to prevent XSS attacks
  if (isDevelopment) {
    if (!swaggerDirectives.scriptSrc) {
      swaggerDirectives.scriptSrc = [];
    }
    if (!swaggerDirectives.scriptSrc.includes("'unsafe-inline'")) {
      swaggerDirectives.scriptSrc.push("'unsafe-inline'");
    }
  }

  // Always add CDN for Swagger UI dependencies (safe: non-injectable resource)
  if (!swaggerDirectives.connectSrc) {
    swaggerDirectives.connectSrc = [];
  }
  if (!swaggerDirectives.connectSrc.includes("https://cdn.jsdelivr.net")) {
    swaggerDirectives.connectSrc.push("https://cdn.jsdelivr.net");
  }

  // Convert CSPDirectives object to CSP header string
  // Format: "directive-name value1 value2; another-directive value3"
  const cspString = Object.entries(swaggerDirectives)
    .map(([key, values]) => `${toKebabCase(key)} ${values.join(" ")}`)
    .join("; ");

  return cspString;
}
