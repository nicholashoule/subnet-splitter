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
 * - Swagger UI CSP: Extends global CSP with the jsDelivr CDN and 'unsafe-inline'
 *   for scripts (required by SwaggerUIBundle)
 * - Shared directives: Base set that both policies inherit from
 */

import { z } from "zod";

export interface CSPDirectives {
  [key: string]: string[];
}

/**
 * Base CSP directives applied globally to all endpoints.
 * These are strict by default for maximum security.
 *
 * Security Architecture Note:
 * - No third-party script origins. The app bundle is served from 'self'; only
 *   /api/docs/ui gets cdn.jsdelivr.net (via buildSwaggerUICSP). A CDN that serves
 *   arbitrary npm packages would otherwise let an injected <script> load any code.
 * - Follows principle of least privilege: other routes can't load or connect to external CDNs
 */
export const baseCSPDirectives: CSPDirectives = {
  defaultSrc: ["'self'"],
  // Strict: no inline scripts on any endpoint
  // Swagger UI gets exception via route-specific override
  scriptSrc: ["'self'"],
  // 'unsafe-inline' allows runtime-injected <style> blocks (Vite dev CSS injection,
  // Swagger UI). Style injection is far lower risk than script injection.
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
};

/**
 * Development-only CSP additions
 * Allows Vite HMR
 *
 * CSP Reporting Strategy:
 * - Uses 'report-uri' (deprecated but widely supported) for CSP violation reports
 * - 'report-to' (modern W3C Reporting API) not used yet due to limited browser support
 * - Modern browsers that support 'report-to' will ignore it if reporting endpoint not configured
 * - Keeping 'report-uri' ensures CSP violations are caught in all browsers during development
 *
 * Reference: https://w3c.github.io/reporting/
 */
export const developmentCSPAdditions: CSPDirectives = {
  scriptSrc: ["'unsafe-inline'"],
  connectSrc: ["ws://127.0.0.1:*", "ws://localhost:*"],
  reportUri: ["/__csp-violation"],
};

/**
 * Swagger UI-specific CSP overrides
 *
 * Builds the CSP for /api/docs/ui by:
 * 1. Starting with baseCSPDirectives (ensures consistency with global policy)
 * 2. Adding 'unsafe-inline' to script-src for SwaggerUIBundle initialization scripts
 * 3. Adding 'https://cdn.jsdelivr.net' to script-src/style-src (Swagger UI assets, pinned
 *    with Subresource Integrity in routes.ts) and connect-src (source maps)
 *
 * Security Rationale - Route-Specific CSP:
 * - Only /api/docs/ui gets cdn.jsdelivr.net and inline scripts (NOT in base policy)
 * - The page renders only the server's own OpenAPI spec (no user-controlled content)
 * - Main application and API endpoints maintain strict CSP
 *
 * @returns CSP header string for the Swagger UI route
 */
export function buildSwaggerUICSP(): string {
  // Helper: Convert camelCase directive names to kebab-case (e.g., scriptSrc -> script-src)
  const toKebabCase = (str: string): string => {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  };

  // SECURITY NOTE: This is CSP directive construction, NOT URL validation or sanitization.
  // We are building an allowlist of exact hosts for Content-Security-Policy headers.
  const cdnSource = "https://cdn.jsdelivr.net";
  const additions: CSPDirectives = {
    scriptSrc: ["'unsafe-inline'", cdnSource],
    styleSrc: [cdnSource],
    connectSrc: [cdnSource],
  };

  // Copy base directives (never mutate the shared object), then append additions
  const swaggerDirectives: CSPDirectives = {};
  for (const [key, values] of Object.entries(baseCSPDirectives)) {
    swaggerDirectives[key] = [...values];
  }
  for (const [key, values] of Object.entries(additions)) {
    const existing = (swaggerDirectives[key] ??= []);
    for (const value of values) {
      if (!existing.includes(value)) existing.push(value);
    }
  }

  // Format: "directive-name value1 value2; another-directive value3"
  return Object.entries(swaggerDirectives)
    .map(([key, values]) => `${toKebabCase(key)} ${values.join(" ")}`)
    .join("; ");
}

/**
 * CSP Violation Report Schema
 *
 * Used for validating and typing Content Security Policy violation reports
 * sent by browsers to the development-only /__csp-violation endpoint.
 *
 * Note: Browsers wrap the violation data in a "csp-report" key according to W3C spec.
 * The actual payload structure is:
 * {
 *   "csp-report": {
 *     "blocked-uri": "...",
 *     "violated-directive": "...",
 *     ...
 *   }
 * }
 *
 * Reference: https://w3c.github.io/webappsec-csp/#violation-reports
 */
const cspViolationFields = z.object({
  'blocked-uri': z.string().optional(),
  'violated-directive': z.string().optional(),
  'original-policy': z.string().optional(),
  'source-file': z.string().optional(),
  'line-number': z.number().optional(),
  'column-number': z.number().optional(),
  'document-uri': z.string().optional(),
  disposition: z.enum(['enforce', 'report']).optional(),
  status: z.number().optional(),
}).strict().optional();

// Wrapper schema for the actual browser payload
export const cspViolationReportSchema = z.object({
  'csp-report': cspViolationFields,
}).strict();

export type CSPViolationReport = z.infer<typeof cspViolationFields>;
