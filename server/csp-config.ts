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
 * Swagger UI requires 'unsafe-inline' for inline script execution.
 * This cannot be safely added to global CSP without affecting all endpoints.
 * 
 * Starting from baseCSPDirectives, we add:
 * - 'unsafe-inline' to script-src for SwaggerUIBundle inline scripts
 * - https://cdn.jsdelivr.net to connect-src for source map fetching
 * 
 * IMPORTANT: When baseCSPDirectives changes, this must also be updated to stay in sync.
 */
export function buildSwaggerUICSP(): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "img-src 'self' data:",
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "font-src 'self' https://fonts.gstatic.com"
  ];
  return directives.join("; ");
}
