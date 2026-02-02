/**
 * server/routes.ts
 * 
 * API route registration. Centralized location for all Express route definitions.
 * 
 * All routes should:
 * - Be prefixed with /api
 * - Use the storage instance for data operations
 * - Return appropriate HTTP status codes and error responses
 * - Include input validation using Zod schemas from shared/schema.ts
 */

import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { generateKubernetesNetworkPlan, getDeploymentTierInfo, KubernetesNetworkGenerationError } from "../client/src/lib/kubernetes-network-generator";
import YAML from "yaml";
import { logger } from "./logger";
import { openApiSpec } from "./openapi";
import { buildSwaggerUICSP } from "./csp-config";

/**
 * Format response as JSON or YAML based on format parameter or Accept header
 */
function formatResponse(data: unknown, format?: string): { contentType: string; body: string } {
  const outputFormat = (format || "json").toLowerCase();
  
  if (outputFormat === "yaml" || outputFormat === "yml") {
    return {
      contentType: "application/yaml",
      body: YAML.stringify(data)
    };
  }
  
  // Default to JSON
  return {
    contentType: "application/json",
    body: JSON.stringify(data, null, 2)
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<{ server: Server; routes: Array<{ method: string; path: string }> }> {
  const registeredRoutes: Array<{ method: string; path: string }> = [];
  
  // Wrap Express methods to track route registration
  const originalGet = app.get.bind(app);
  const originalPost = app.post.bind(app);
  const originalPut = app.put.bind(app);
  const originalDelete = app.delete.bind(app);
  const originalPatch = app.patch.bind(app);
  
  app.get = function(path: any, ...handlers: any[]) {
    if (typeof path === 'string') {
      registeredRoutes.push({ method: 'GET', path });
    }
    return originalGet(path, ...handlers);
  } as any;
  
  app.post = function(path: any, ...handlers: any[]) {
    if (typeof path === 'string') {
      registeredRoutes.push({ method: 'POST', path });
    }
    return originalPost(path, ...handlers);
  } as any;
  
  app.put = function(path: any, ...handlers: any[]) {
    if (typeof path === 'string') {
      registeredRoutes.push({ method: 'PUT', path });
    }
    return originalPut(path, ...handlers);
  } as any;
  
  app.delete = function(path: any, ...handlers: any[]) {
    if (typeof path === 'string') {
      registeredRoutes.push({ method: 'DELETE', path });
    }
    return originalDelete(path, ...handlers);
  } as any;
  
  app.patch = function(path: any, ...handlers: any[]) {
    if (typeof path === 'string') {
      registeredRoutes.push({ method: 'PATCH', path });
    }
    return originalPatch(path, ...handlers);
  } as any;

  // Health check endpoints for production monitoring
  // Note: These are also available at /api/v1/health for OpenAPI compatibility
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0"
    });
  });

  app.get("/health/ready", (req, res) => {
    // Add any readiness checks here (e.g., database connectivity)
    // For now, we're always ready since we don't have external dependencies
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/health/live", (req, res) => {
    // Liveness check - is the process alive?
    res.status(200).json({
      status: "alive",
      timestamp: new Date().toISOString()
    });
  });

  // API v1 health endpoints (for OpenAPI/Swagger UI compatibility)
  app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0"
    });
  });

  app.get("/api/v1/health/ready", (req, res) => {
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/v1/health/live", (req, res) => {
    res.status(200).json({
      status: "alive",
      timestamp: new Date().toISOString()
    });
  });

  // API version endpoint
  app.get("/api/version", (req, res) => {
    res.json({
      version: "1.0.0",
      apiVersion: "v1",
      endpoints: {
        primary: [
          "/api/k8s/plan",
          "/api/k8s/tiers"
        ],
        aliases: [
          "/api/v1/k8s/plan",
          "/api/v1/k8s/tiers"
        ],
        descriptive: [
          "/api/v1/kubernetes/network-plan",
          "/api/v1/kubernetes/tiers",
          "/api/kubernetes/network-plan",
          "/api/kubernetes/tiers"
        ]
      },
      note: "Use primary endpoints for concise paths. Aliases and descriptive paths available for clarity."
    });
  });

  // OpenAPI specification endpoint
  app.get("/api/docs", (req, res) => {
    const format = req.query.format as string | undefined;
    const { contentType, body } = formatResponse(openApiSpec, format);
    res.type(contentType).send(body);
  });

  // Swagger UI CSP override middleware
  // IMPORTANT: This completely replaces the global CSP policy to allow 'unsafe-inline' for scripts.
  // 
  // Swagger UI requires inline script execution, which cannot be safely added to global CSP
  // without affecting all endpoints. Route-specific override allows Swagger UI exception
  // while keeping the rest of the application fully protected.
  //
  // The CSP directives are defined in server/csp-config.ts (buildSwaggerUICSP function)
  // and are kept in sync with baseCSPDirectives via that shared module.
  const swaggerCSPMiddleware = (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', buildSwaggerUICSP());
    next();
  };

  // Swagger UI HTML (minimal implementation)
  app.get("/api/docs/ui", swaggerCSPMiddleware, (req, res) => {
    // Prevent caching to ensure UI updates work properly
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CIDR Subnet Calculator API Documentation</title>
  <script>
    // Set theme immediately before any CSS loads
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.className = savedTheme;
  </script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    * {
      transition: none !important;
    }
    html, html.light {
      background-color: hsl(210, 20%, 98%);
    }
    body { 
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: hsl(210, 20%, 98%);
      color: hsl(222, 47%, 11%);
    }
    .topbar { display: none !important; }
    
    /* === LIGHT MODE (Default) === */
    .swagger-ui {
      background-color: hsl(210, 20%, 98%) !important;
      color: hsl(222, 47%, 11%) !important;
    }
    .swagger-ui .wrapper {
      background-color: transparent !important;
    }
    .swagger-ui .info {
      background-color: white !important;
      color: hsl(222, 47%, 11%) !important;
      border: 1px solid hsl(214, 20%, 88%) !important;
      border-radius: 0.5rem !important;
      padding: 1.5rem !important;
      margin-bottom: 1.5rem !important;
    }
    .swagger-ui .info .title,
    .swagger-ui .info p,
    .swagger-ui .info li,
    .swagger-ui h1, .swagger-ui h2, .swagger-ui h3,
    .swagger-ui h4, .swagger-ui h5, .swagger-ui h6,
    .swagger-ui p, .swagger-ui label,
    .swagger-ui .prop-type, .swagger-ui .parameter__in,
    .swagger-ui .parameter__name, .swagger-ui .parameter__type {
      color: hsl(222, 47%, 11%) !important;
    }
    /* Layout title with badges on the right */
    .swagger-ui .info .title {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      gap: 1rem !important;
    }
    /* General spans - but not badge spans */
    .swagger-ui span:not(.info .title small) {
      color: hsl(222, 47%, 11%) !important;
    }
    /* Light mode - Version badges (1.0.0, OAS 3.0) - ensure backgrounds are visible */
    .swagger-ui .info .title small {
      background-color: hsl(215, 16%, 47%) !important;
      color: white !important;
      padding: 2px 8px !important;
      border-radius: 3px !important;
      display: inline-block !important;
      flex-shrink: 0 !important;
    }
    .swagger-ui .info .title small.version-stamp {
      background-color: hsl(221, 83%, 53%) !important;
      color: white !important;
    }
    .swagger-ui .scheme-container {
      background-color: white !important;
      border: 1px solid hsl(214, 20%, 88%) !important;
      border-radius: 0.5rem !important;
      padding: 1rem 1.5rem !important;
      margin: 0 0 1.5rem 0 !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      flex: 1 !important;
    }
    /* Fix scheme-container parent to allow full width */
    .swagger-ui .swagger-container .scheme-container {
      max-width: 100% !important;
    }
    .swagger-ui .opblock-tag-section {
      background-color: transparent !important;
    }
    .swagger-ui .opblock-tag {
      color: hsl(222, 47%, 11%) !important;
      border-bottom-color: hsl(214, 20%, 88%) !important;
    }
    .swagger-ui .opblock-tag small {
      color: hsl(215, 16%, 47%) !important;
    }
    .swagger-ui .opblock {
      background-color: white !important;
      border-color: hsl(214, 20%, 88%) !important;
      border-radius: 0.5rem !important;
    }
    .swagger-ui .opblock .opblock-summary {
      background-color: hsl(210, 20%, 99%) !important;
      border-color: hsl(214, 20%, 88%) !important;
    }
    .swagger-ui .opblock .opblock-summary-description,
    .swagger-ui .opblock .opblock-summary-path {
      color: hsl(222, 47%, 11%) !important;
    }
    .swagger-ui .opblock .opblock-body {
      background-color: white !important;
    }
    .swagger-ui .opblock .opblock-section-header {
      background-color: hsl(210, 20%, 97%) !important;
    }
    .swagger-ui .opblock-description-wrapper,
    .swagger-ui .opblock-description-wrapper p {
      color: hsl(222, 47%, 11%) !important;
    }
    .swagger-ui .model-box,
    .swagger-ui .model,
    .swagger-ui .model-container {
      background-color: white !important;
      color: hsl(222, 47%, 11%) !important;
      border-color: hsl(214, 20%, 88%) !important;
      border-radius: 0.375rem !important;
    }
    .swagger-ui .models {
      background-color: white !important;
      border: 1px solid hsl(214, 20%, 88%) !important;
      border-radius: 0.5rem !important;
      padding: 1rem !important;
      margin-top: 1.5rem !important;
      overflow: hidden !important;
    }
    .swagger-ui .model-title,
    .swagger-ui .model .property,
    .swagger-ui .model-box-control,
    .swagger-ui .models-control {
      color: hsl(222, 47%, 11%) !important;
    }
    /* Hover effects for model section headers */
    .swagger-ui .models h4,
    .swagger-ui .models-control,
    .swagger-ui .model-box-control {
      cursor: pointer !important;
      transition: color 0.15s ease, background-color 0.15s ease !important;
      padding: 0.5rem 0.75rem !important;
      border-radius: 0.25rem !important;
      display: flex !important;
      width: 100% !important;
      box-sizing: border-box !important;
      align-items: center !important;
      justify-content: space-between !important;
    }
    .swagger-ui .models h4:hover,
    .swagger-ui .models-control:hover,
    .swagger-ui .model-box-control:hover {
      color: hsl(221, 83%, 53%) !important;
      background-color: hsl(210, 20%, 96%) !important;
    }
    .swagger-ui .tab-content,
    .swagger-ui .responses-inner,
    .swagger-ui .response-col_status,
    .swagger-ui .response-col_description,
    .swagger-ui .response-col_description__inner {
      background-color: white !important;
      color: hsl(222, 47%, 11%) !important;
    }
    .swagger-ui .responses-inner h4,
    .swagger-ui .responses-inner h5 {
      color: hsl(222, 47%, 11%) !important;
    }
    .swagger-ui .body-param,
    .swagger-ui .body-param__text {
      background-color: white !important;
      color: hsl(222, 47%, 11%) !important;
    }
    /* Code/Example sections - force light backgrounds */
    .swagger-ui .microlight,
    .swagger-ui .highlight-code,
    .swagger-ui .highlight-code > div,
    .swagger-ui code,
    .swagger-ui pre,
    .swagger-ui pre.microlight,
    .swagger-ui .model-example pre,
    .swagger-ui .responses-inner pre,
    .swagger-ui .opblock-body pre {
      background: hsl(210, 20%, 99%) !important;
      background-color: hsl(210, 20%, 99%) !important;
      color: hsl(222, 47%, 11%) !important;
    }
    .swagger-ui .microlight *,
    .swagger-ui .highlight-code *,
    .swagger-ui code *,
    .swagger-ui pre * {
      background: transparent !important;
      background-color: transparent !important;
      color: hsl(222, 47%, 11%) !important;
    }
    /* Override any syntax highlighter classes */
    .swagger-ui .hljs,
    .swagger-ui pre[class*="language-"],
    .swagger-ui code[class*="language-"] {
      background: hsl(210, 20%, 99%) !important;
      background-color: hsl(210, 20%, 99%) !important;
      color: hsl(222, 47%, 11%) !important;
    }
    .swagger-ui .prop-format,
    .swagger-ui .renderedMarkdown p {
      color: hsl(222, 47%, 11%) !important;
    }
    .swagger-ui table thead tr th,
    .swagger-ui table tbody tr td {
      background-color: white !important;
      color: hsl(222, 47%, 11%) !important;
      border-color: hsl(214, 20%, 88%) !important;
    }
    .swagger-ui select,
    .swagger-ui input[type=text],
    .swagger-ui input[type=email],
    .swagger-ui input[type=password],
    .swagger-ui textarea {
      background-color: white !important;
      color: hsl(222, 47%, 11%) !important;
      border: 1px solid hsl(214, 20%, 88%) !important;
      border-radius: 0.375rem !important;
    }
    .swagger-ui select:focus,
    .swagger-ui input:focus,
    .swagger-ui textarea:focus {
      outline: 2px solid hsl(221, 83%, 53%) !important;
      outline-offset: 0 !important;
      border-color: hsl(221, 83%, 53%) !important;
    }
    .swagger-ui .btn {
      background-color: white !important;
      color: hsl(222, 47%, 11%) !important;
      border: 1px solid hsl(214, 20%, 88%) !important;
    }
    .swagger-ui .btn.execute {
      background-color: hsl(221, 83%, 53%) !important;
      color: white !important;
      border-color: hsl(221, 83%, 53%) !important;
    }
    .swagger-ui .btn:hover {
      box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
    }
    .swagger-ui .opblock-summary-method {
      color: white !important;
    }
    .swagger-ui .opblock-control-arrow {
      fill: hsl(222, 47%, 11%) !important;
    }
    .swagger-ui .tab li button {
      color: hsl(215, 16%, 47%) !important;
      background: transparent !important;
      border-bottom: 2px solid transparent !important;
    }
    .swagger-ui .tab li.active button {
      color: hsl(222, 47%, 11%) !important;
      border-bottom-color: hsl(221, 83%, 53%) !important;
    }
    .swagger-ui .opblock-summary-control:focus,
    .swagger-ui .model-box-control:focus,
    .swagger-ui .models-control:focus {
      outline: none !important;
    }
    .swagger-ui .opblock-summary-control:focus .opblock-summary {
      box-shadow: none !important;
    }
    
    /* Header styling (matches webapp) */
    header {
      border-bottom: 1px solid hsl(214, 20%, 88%);
      background-color: hsl(210, 20%, 96%, 0.2);
      padding: 1rem 1.5rem;
      margin: 0 -1.5rem 1.5rem -1.5rem;
      text-align: center;
    }
    header img {
      width: 4rem;
      height: 4rem;
      border-radius: 0.5rem;
      margin-bottom: 0.5rem;
      cursor: pointer;
      opacity: 1;
      transition: opacity 0.2s;
    }
    header img:hover {
      opacity: 0.8;
    }
    header h1 {
      font-size: 2.25rem;
      font-weight: bold;
      letter-spacing: -0.025em;
      margin: 0.75rem 0;
      color: hsl(222, 47%, 11%);
    }
    header p {
      color: hsl(215, 16%, 47%);
      font-size: 1.125rem;
      max-width: 42rem;
      margin: 0 auto;
      line-height: 1.75;
    }
    
    /* Footer styling (matches webapp) */
    footer {
      border-top: 1px solid hsl(214, 20%, 88%);
      background-color: hsl(210, 20%, 96%, 0.3);
      padding: 2rem 1.5rem;
      margin: 2rem -1.5rem 0 -1.5rem;
      text-align: center;
      font-size: 0.875rem;
      color: hsl(215, 16%, 47%);
    }
    footer p {
      max-width: 42rem;
      margin: 0 auto 0.75rem;
      line-height: 1.75;
    }
    footer a {
      color: hsl(221, 83%, 53%);
      text-decoration: none;
      font-weight: 500;
    }
    footer a:hover {
      text-decoration: underline;
    }
    footer .license {
      font-size: 0.75rem;
      margin-top: 0.5rem;
    }

    
    /* === DARK MODE === */
    html.dark body {
      background-color: hsl(222, 47%, 8%);
      color: hsl(210, 20%, 98%);
    }
    html.dark .swagger-ui {
      background-color: hsl(222, 47%, 8%) !important;
      color: hsl(210, 20%, 98%) !important;
    }
    /* Dark mode - Version badges (1.0.0, OAS 3.0) - ensure backgrounds are visible */
    html.dark .swagger-ui .info .title small {
      background-color: hsl(222, 13%, 22%) !important;
      color: hsl(210, 20%, 98%) !important;
      padding: 2px 8px !important;
      border-radius: 3px !important;
      display: inline-block !important;
      flex-shrink: 0 !important;
    }
    html.dark .swagger-ui .info .title small.version-stamp {
      background-color: hsl(160, 60%, 22%) !important;
      color: white !important;
    }
    html.dark .swagger-ui .wrapper {
      background-color: transparent !important;
    }
    html.dark .swagger-ui .info {
      background-color: hsl(222, 47%, 11%) !important;
      color: hsl(210, 20%, 98%) !important;
      border: 1px solid hsl(217, 33%, 17%) !important;
      border-radius: 0.5rem !important;
      padding: 1.5rem !important;
      margin-bottom: 1.5rem !important;
    }
    /* Dark mode - Layout title with badges on the right */
    html.dark .swagger-ui .info .title {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      gap: 1rem !important;
    }
    html.dark .swagger-ui .info .title,
    html.dark .swagger-ui .info p,
    html.dark .swagger-ui .info li,
    html.dark .swagger-ui h1, html.dark .swagger-ui h2, html.dark .swagger-ui h3,
    html.dark .swagger-ui h4, html.dark .swagger-ui h5, html.dark .swagger-ui h6,
    html.dark .swagger-ui p, html.dark .swagger-ui label,
    html.dark .swagger-ui .prop-type, html.dark .swagger-ui .parameter__in,
    html.dark .swagger-ui .parameter__name, html.dark .swagger-ui .parameter__type {
      color: hsl(210, 20%, 98%) !important;
    }
    /* General spans in dark mode - but not badge spans */
    html.dark .swagger-ui span:not(.info .title small) {
      color: hsl(210, 20%, 98%) !important;
    }
    html.dark .swagger-ui .scheme-container {
      background-color: hsl(222, 47%, 11%) !important;
      border: 1px solid hsl(217, 33%, 17%) !important;
      border-radius: 0.5rem !important;
      padding: 1rem 1.5rem !important;
      margin: 0 0 1.5rem 0 !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      flex: 1 !important;
    }
    /* Dark mode: Fix scheme-container parent to allow full width */
    html.dark .swagger-ui .swagger-container .scheme-container {
      max-width: 100% !important;
    }
    html.dark .swagger-ui .opblock-tag-section {
      background-color: transparent !important;
    }
    html.dark .swagger-ui .opblock-tag {
      color: hsl(210, 20%, 98%) !important;
      border-bottom-color: hsl(217, 33%, 17%) !important;
    }
    html.dark .swagger-ui .opblock-tag small {
      color: hsl(215, 20%, 65%) !important;
    }
    html.dark .swagger-ui .opblock {
      background-color: hsl(222, 47%, 11%) !important;
      border-color: hsl(217, 33%, 17%) !important;
      border-radius: 0.5rem !important;
    }
    html.dark .swagger-ui .opblock .opblock-summary {
      background-color: hsl(222, 47%, 9%) !important;
      border-color: hsl(217, 33%, 17%) !important;
    }
    html.dark .swagger-ui .opblock .opblock-summary-description,
    html.dark .swagger-ui .opblock .opblock-summary-path {
      color: hsl(210, 20%, 98%) !important;
    }
    html.dark .swagger-ui .opblock .opblock-body {
      background-color: hsl(222, 47%, 11%) !important;
    }
    html.dark .swagger-ui .opblock .opblock-section-header {
      background-color: hsl(222, 47%, 9%) !important;
    }
    html.dark .swagger-ui .opblock-description-wrapper,
    html.dark .swagger-ui .opblock-description-wrapper p {
      color: hsl(210, 20%, 98%) !important;
    }
    html.dark .swagger-ui .model-box,
    html.dark .swagger-ui .model,
    html.dark .swagger-ui .model-container {
      background-color: hsl(222, 47%, 11%) !important;
      color: hsl(210, 20%, 98%) !important;
      border-color: hsl(217, 33%, 17%) !important;
      border-radius: 0.375rem !important;
    }
    html.dark .swagger-ui .models {
      background-color: hsl(222, 47%, 11%) !important;
      border: 1px solid hsl(217, 33%, 17%) !important;
      border-radius: 0.5rem !important;
      padding: 1rem !important;
      margin-top: 1.5rem !important;
      overflow: hidden !important;
    }
    html.dark .swagger-ui .model-title,
    html.dark .swagger-ui .model .property,
    html.dark .swagger-ui .model-box-control,
    html.dark .swagger-ui .models-control {
      color: hsl(210, 20%, 98%) !important;
    }
    /* Dark mode: Hover effects for model section headers */
    html.dark .swagger-ui .models h4,
    html.dark .swagger-ui .models-control,
    html.dark .swagger-ui .model-box-control {
      cursor: pointer !important;
      transition: color 0.15s ease, background-color 0.15s ease !important;
      padding: 0.5rem 0.75rem !important;
      border-radius: 0.25rem !important;
      display: flex !important;
      width: 100% !important;
      box-sizing: border-box !important;
      align-items: center !important;
      justify-content: space-between !important;
    }
    html.dark .swagger-ui .models h4:hover,
    html.dark .swagger-ui .models-control:hover,
    html.dark .swagger-ui .model-box-control:hover {
      color: hsl(217, 91%, 60%) !important;
      background-color: hsl(222, 47%, 14%) !important;
    }
    html.dark .swagger-ui .tab-content,
    html.dark .swagger-ui .responses-inner,
    html.dark .swagger-ui .response-col_status,
    html.dark .swagger-ui .response-col_description,
    html.dark .swagger-ui .response-col_description__inner {
      background-color: hsl(222, 47%, 11%) !important;
      color: hsl(210, 20%, 98%) !important;
    }
    html.dark .swagger-ui .responses-inner h4,
    html.dark .swagger-ui .responses-inner h5 {
      color: hsl(210, 20%, 98%) !important;
    }
    html.dark .swagger-ui .body-param,
    html.dark .swagger-ui .body-param__text {
      background-color: hsl(222, 47%, 11%) !important;
      color: hsl(210, 20%, 98%) !important;
    }
    html.dark .swagger-ui .microlight,
    html.dark .swagger-ui .highlight-code,
    html.dark .swagger-ui code,
    html.dark .swagger-ui pre {
      background-color: transparent !important;
      color: hsl(210, 20%, 98%) !important;
    }
    html.dark .swagger-ui .microlight *,
    html.dark .swagger-ui .highlight-code *,
    html.dark .swagger-ui code *,
    html.dark .swagger-ui pre * {
      color: inherit !important;
      background-color: transparent !important;
    }
    html.dark .swagger-ui .prop-format,
    html.dark .swagger-ui .renderedMarkdown p {
      color: hsl(210, 20%, 98%) !important;
    }
    html.dark .swagger-ui table thead tr th,
    html.dark .swagger-ui table tbody tr td {
      background-color: hsl(222, 47%, 11%) !important;
      color: hsl(210, 20%, 98%) !important;
      border-color: hsl(217, 33%, 17%) !important;
    }
    html.dark .swagger-ui select,
    html.dark .swagger-ui input[type=text],
    html.dark .swagger-ui input[type=email],
    html.dark .swagger-ui input[type=password],
    html.dark .swagger-ui textarea {
      background-color: hsl(222, 47%, 11%) !important;
      color: hsl(210, 20%, 98%) !important;
      border: 1px solid hsl(217, 33%, 17%) !important;
      border-radius: 0.375rem !important;
    }
    html.dark .swagger-ui select:focus,
    html.dark .swagger-ui input:focus,
    html.dark .swagger-ui textarea:focus {
      outline: 2px solid hsl(217, 91%, 60%) !important;
      outline-offset: 0 !important;
      border-color: hsl(217, 91%, 60%) !important;
    }
    html.dark .swagger-ui .btn {
      background-color: hsl(222, 47%, 11%) !important;
      color: hsl(210, 20%, 98%) !important;
      border: 1px solid hsl(217, 33%, 17%) !important;
    }
    html.dark .swagger-ui .btn.execute {
      background-color: hsl(217, 91%, 60%) !important;
      color: white !important;
      border-color: hsl(217, 91%, 60%) !important;
    }
    html.dark .swagger-ui .btn:hover {
      box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
    }
    html.dark .swagger-ui .opblock-summary-method {
      color: white !important;
    }
    html.dark .swagger-ui .opblock-control-arrow {
      fill: hsl(210, 20%, 98%) !important;
    }
    html.dark .swagger-ui .tab li button {
      color: hsl(215, 20%, 65%) !important;
      background: transparent !important;
      border-bottom: 2px solid transparent !important;
    }
    html.dark .swagger-ui .tab li.active button {
      color: hsl(210, 20%, 98%) !important;
      border-bottom-color: hsl(217, 91%, 60%) !important;
    }
    html.dark .swagger-ui .opblock-summary-control:focus,
    html.dark .swagger-ui .model-box-control:focus,
    html.dark .swagger-ui .models-control:focus {
      outline: none !important;
    }
    html.dark .swagger-ui .opblock-summary-control:focus .opblock-summary {
      box-shadow: none !important;
    }
    html.dark header {
      border-bottom-color: hsl(217, 33%, 17%);
      background-color: rgba(34, 31, 53, 0.2);
    }
    html.dark header h1 {
      color: hsl(210, 20%, 98%);
    }
    html.dark header p {
      color: hsl(215, 20%, 65%);
    }
    html.dark footer {
      border-top-color: hsl(217, 33%, 17%);
      background-color: rgba(34, 31, 53, 0.3);
      color: hsl(215, 20%, 65%);
    }
    html.dark footer a {
      color: hsl(217, 91%, 60%);
    }
    
    /* Theme toggle bar (matches webapp) */
    .theme-bar {
      display: flex;
      justify-content: flex-end;
      padding: 0.5rem 1.5rem;
      border-bottom: 1px solid hsl(214, 20%, 88%);
      background-color: hsl(210, 20%, 96%, 0.2);
    }
    html.dark .theme-bar {
      border-bottom-color: hsl(217, 33%, 17%);
      background-color: rgba(34, 31, 53, 0.2);
    }
    
    /* Theme toggle button (matches webapp Button component) */
    #theme-toggle {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.5rem;
      border: none;
      background: transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: hsl(215, 16%, 47%);
      transition: background-color 0.2s;
    }
    #theme-toggle:hover {
      background-color: hsl(210, 20%, 96%);
    }
    #theme-toggle svg {
      width: 1.25rem;
      height: 1.25rem;
    }
    html.dark #theme-toggle {
      color: hsl(215, 20%, 65%);
    }
    html.dark #theme-toggle:hover {
      background-color: hsl(217, 33%, 17%);
    }
    
    /* Container structure */
    .container {
      max-width: 1600px;
      margin: 0 auto;
      padding: 0 1.5rem 2rem;
    }
  </style>
</head>
<body>
  <div class="theme-bar">
    <button id="theme-toggle" aria-label="Toggle theme">
      <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2"/>
        <path d="M12 20v2"/>
        <path d="m4.93 4.93 1.41 1.41"/>
        <path d="m17.66 17.66 1.41 1.41"/>
        <path d="M2 12h2"/>
        <path d="M20 12h2"/>
        <path d="m6.34 17.66-1.41 1.41"/>
        <path d="m19.07 4.93-1.41 1.41"/>
      </svg>
      <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
      </svg>
    </button>
  </div>
  <div class="container">
    <header>
      <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer">
        <img src="/github-nicholashoule.png" alt="GitHub QR Code" />
      </a>
      <h1>CIDR Subnet Calculator API</h1>
      <p>
        REST API for subnet calculations and Kubernetes network planning.
        Generate optimized network configurations for EKS, GKE, AKS, and self-hosted clusters.
      </p>
    </header>
    <div id="swagger-ui"></div>
    <footer>
      <p>
        Interactive API documentation powered by Swagger UI.
        All calculations are stateless and deterministic - same input always produces the same output.
      </p>
      <p>
        Created by <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer">nicholashoule</a>
      </p>
      <p class="license">
        <a href="https://github.com/nicholashoule/subnet-cidr-splitter/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>
      </p>
    </footer>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    // Theme management (synchronized with webapp)
    const html = document.documentElement;
    const themeToggle = document.getElementById('theme-toggle');
    const sunIcon = themeToggle.querySelector('.sun-icon');
    const moonIcon = themeToggle.querySelector('.moon-icon');
    
    function updateThemeIcon(theme) {
      if (theme === 'dark') {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      } else {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      }
    }
    
    // Get current theme from localStorage (source of truth)
    const currentTheme = localStorage.getItem('theme') || 'light';
    html.className = currentTheme;
    updateThemeIcon(currentTheme);
    
    // Toggle theme
    themeToggle.addEventListener('click', () => {
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      // Reload page to apply new syntax highlighting theme
      location.reload();
    });
    
    // Listen for theme changes from other tabs/windows (e.g., webapp)
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme' && e.newValue) {
        // Reload Swagger UI to apply new syntax highlighting theme
        location.reload();
      }
    });
    
    // Initialize Swagger UI immediately
    // In light mode, disable syntax highlighting to avoid dark theme issues
    // In dark mode, use tomorrow-night theme
    const syntaxHighlightConfig = currentTheme === 'dark' 
      ? { activated: true, theme: 'tomorrow-night' }
      : { activated: false };
    
    SwaggerUIBundle({
      url: '/api/docs',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIStandalonePreset
      ],
      layout: "StandaloneLayout",
      syntaxHighlight: syntaxHighlightConfig,
      // Disable Swagger validator badge by setting validatorUrl to null
      // The validator badge normally appears in the top-right and sends the OpenAPI spec to validator.swagger.io
      // for validation against OpenAPI standards. We disable this to prevent:
      // 1. CORS errors when the validator service is unavailable or misconfigured
      // 2. Validation errors for valid but non-standard spec extensions
      // 3. External requests for privacy and offline support
      // This is a permanent solution since the spec validation is not critical for API documentation viewing.
      // Developers should validate the spec locally during development (e.g., with openapi-spec-validator or similar tools).
      validatorUrl: null,
      onComplete: function() {
        // Function to apply light mode styles
        function applyLightStyles() {
          const activeTheme = localStorage.getItem('theme') || 'light';
          if (activeTheme === 'light') {
            document.querySelectorAll('.swagger-ui .microlight, .swagger-ui pre, .swagger-ui code, .swagger-ui .highlight-code, .swagger-ui pre.microlight, .swagger-ui .model-example pre, .swagger-ui .responses-inner pre, .swagger-ui .opblock-body pre').forEach(el => {
              // Skip if this element is a badge or inside a badge
              if (el.classList.contains('version-stamp') || 
                  el.closest('.info .title small') || 
                  el.closest('.info .title')) {
                return;
              }
              
              el.style.setProperty('background', 'hsl(210, 20%, 99%)', 'important');
              el.style.setProperty('background-color', 'hsl(210, 20%, 99%)', 'important');
              el.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
              
              // Force light mode on all children (including syntax tokens)
              // But exclude version badges and anything in .info .title
              el.querySelectorAll('*').forEach(child => {
                if (!child.closest('.info .title') && 
                    !child.classList.contains('version-stamp')) {
                  child.style.setProperty('background', 'transparent', 'important');
                  child.style.setProperty('background-color', 'transparent', 'important');
                  child.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
                }
              });
            });
            
            // Explicitly force correct badge styling
            document.querySelectorAll('.swagger-ui .info .title small').forEach(badge => {
              // Force the badges to have correct colors
              if (badge.classList.contains('version-stamp')) {
                badge.style.setProperty('background-color', 'hsl(221, 83%, 53%)', 'important');
              } else {
                badge.style.setProperty('background-color', 'hsl(215, 16%, 47%)', 'important');
              }
              badge.style.setProperty('color', 'white', 'important');
              badge.style.setProperty('padding', '2px 8px', 'important');
              badge.style.setProperty('border-radius', '3px', 'important');
              badge.style.setProperty('display', 'inline-block', 'important');
              
              // Also fix any children inside the badge (like pre or span elements)
              badge.querySelectorAll('*').forEach(child => {
                child.style.setProperty('background', 'transparent', 'important');
                child.style.setProperty('background-color', 'transparent', 'important');
                child.style.setProperty('color', 'white', 'important');
              });
            });
            
            // Force correct styling on "Try it out" section elements
            // Textarea for request body
            document.querySelectorAll('.swagger-ui textarea, .swagger-ui .body-param textarea, .swagger-ui .body-param__text').forEach(el => {
              el.style.setProperty('background-color', 'white', 'important');
              el.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
              el.style.setProperty('border', '1px solid hsl(214, 20%, 88%)', 'important');
            });
            
            // Response sections (live responses after Execute)
            document.querySelectorAll('.swagger-ui .responses-inner, .swagger-ui .response-col_description, .swagger-ui .response-col_description__inner').forEach(el => {
              el.style.setProperty('background-color', 'white', 'important');
              el.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
            });
            
            // Curl command display and response body
            document.querySelectorAll('.swagger-ui .curl-command, .swagger-ui .request-url, .swagger-ui .response-body, .swagger-ui .live-responses-table').forEach(el => {
              el.style.setProperty('background-color', 'white', 'important');
              el.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
            });
          }
        }
        
        // Apply styles initially with a small delay
        setTimeout(applyLightStyles, 100);
        // Also apply after a longer delay to catch late-rendered elements
        setTimeout(applyLightStyles, 500);
        
        // Reapply styles on any click within Swagger UI (expanding operations, changing tabs, etc.)
        document.addEventListener('click', (e) => {
          // Check if click was inside swagger-ui
          if (e.target.closest('.swagger-ui') || e.target.closest('#swagger-ui')) {
            setTimeout(applyLightStyles, 50);
            // Also apply after a longer delay for dynamically loaded content
            setTimeout(applyLightStyles, 200);
          }
        });
        
        // Use MutationObserver to catch dynamically added elements (like "Try it out" sections)
        const swaggerContainer = document.getElementById('swagger-ui');
        if (swaggerContainer) {
          const mutationObserver = new MutationObserver((mutations) => {
            // Debounce: only apply if we haven't recently applied
            clearTimeout(window._swaggerStyleTimeout);
            window._swaggerStyleTimeout = setTimeout(applyLightStyles, 50);
          });
          
          mutationObserver.observe(swaggerContainer, {
            childList: true,
            subtree: true
          });
        }
        
        // Reapply when navigating to this page (for SPA routing)
        if (swaggerContainer) {
          // Use IntersectionObserver to detect when Swagger UI becomes visible
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                setTimeout(applyLightStyles, 50);
              }
            });
          }, { threshold: 0.1 });
          
          observer.observe(swaggerContainer);
        }
      }
    });
    
    // Clear any auto-selections on load
    window.addEventListener('load', () => {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
    });
    
    // Clear selections when clicking expand/collapse controls
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target.closest('.model-box-control') || target.closest('.opblock-summary-control')) {
        setTimeout(() => {
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
        }, 0);
      }
    });
  </script>
</body>
</html>
    `;
    res.type("html").send(html);
  });

  // Kubernetes Network Planning API
  // Primary concise endpoint: POST /api/k8s/plan
  app.post("/api/k8s/plan", async (req, res) => {
    try {
      const plan = await generateKubernetesNetworkPlan(req.body);
      const format = req.query.format as string | undefined;
      const { contentType, body } = formatResponse(plan, format);
      
      res.type(contentType).send(body);
    } catch (error) {
      const format = req.query.format as string | undefined;
      let errorResponse: unknown;
      
      if (error instanceof KubernetesNetworkGenerationError) {
        errorResponse = {
          error: error.message,
          code: "NETWORK_GENERATION_ERROR"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      if (error instanceof SyntaxError || (error as any).code === "INVALID_REQUEST" || (error as any).name === "ZodError") {
        errorResponse = {
          error: error instanceof Error ? error.message : "Invalid request",
          code: "INVALID_REQUEST"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      logger.error("Kubernetes network plan generation failed", {
        requestBody: req.body,
      }, error as Error);
      errorResponse = {
        error: "Failed to generate network plan",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      return res.status(500).type(contentType).send(body);
    }
  });

  // Primary concise endpoint: GET /api/k8s/tiers
  app.get("/api/k8s/tiers", (req, res) => {
    try {
      const tierInfo = getDeploymentTierInfo();
      const format = req.query.format as string | undefined;
      const { contentType, body } = formatResponse(tierInfo, format);
      
      res.type(contentType).send(body);
    } catch (error) {
      logger.error("Error fetching tier information", {}, error as Error);
      const format = req.query.format as string | undefined;
      const errorResponse = {
        error: "Failed to fetch tier information",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      res.status(500).type(contentType).send(body);
    }
  });

  // Long-form descriptive endpoint: /api/v1/kubernetes/network-plan
  app.post("/api/v1/kubernetes/network-plan", async (req, res) => {
    try {
      const plan = await generateKubernetesNetworkPlan(req.body);
      const format = req.query.format as string | undefined;
      const { contentType, body } = formatResponse(plan, format);
      
      res.type(contentType).send(body);
    } catch (error) {
      const format = req.query.format as string | undefined;
      let errorResponse: unknown;
      
      if (error instanceof KubernetesNetworkGenerationError) {
        errorResponse = {
          error: error.message,
          code: "NETWORK_GENERATION_ERROR"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      if (error instanceof SyntaxError || (error as any).code === "INVALID_REQUEST" || (error as any).name === "ZodError") {
        errorResponse = {
          error: error instanceof Error ? error.message : "Invalid request",
          code: "INVALID_REQUEST"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      logger.error("Kubernetes network plan generation failed", {
        requestBody: req.body,
      }, error as Error);
      errorResponse = {
        error: "Failed to generate network plan",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      return res.status(500).type(contentType).send(body);
    }
  });

  // Long-form descriptive endpoint: /api/v1/kubernetes/tiers
  app.get("/api/v1/kubernetes/tiers", (req, res) => {
    try {
      const tierInfo = getDeploymentTierInfo();
      const format = req.query.format as string | undefined;
      const { contentType, body } = formatResponse(tierInfo, format);
      
      res.type(contentType).send(body);
    } catch (error) {
      logger.error("Error fetching tier information", {}, error as Error);
      const format = req.query.format as string | undefined;
      const errorResponse = {
        error: "Failed to fetch tier information",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      res.status(500).type(contentType).send(body);
    }
  });

  // Versioned short-form aliases: /api/v1/k8s/*
  app.post("/api/v1/k8s/plan", async (req, res) => {
    try {
      const plan = await generateKubernetesNetworkPlan(req.body);
      const format = req.query.format as string | undefined;
      const { contentType, body } = formatResponse(plan, format);
      
      res.type(contentType).send(body);
    } catch (error) {
      const format = req.query.format as string | undefined;
      let errorResponse: unknown;
      
      if (error instanceof KubernetesNetworkGenerationError) {
        errorResponse = {
          error: error.message,
          code: "NETWORK_GENERATION_ERROR"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      if (error instanceof SyntaxError || (error as any).code === "INVALID_REQUEST" || (error as any).name === "ZodError") {
        errorResponse = {
          error: error instanceof Error ? error.message : "Invalid request",
          code: "INVALID_REQUEST"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      logger.error("Kubernetes network plan generation failed", {
        requestBody: req.body,
      }, error as Error);
      errorResponse = {
        error: "Failed to generate network plan",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      return res.status(500).type(contentType).send(body);
    }
  });

  app.get("/api/v1/k8s/tiers", (req, res) => {
    try {
      const tierInfo = getDeploymentTierInfo();
      const format = req.query.format as string | undefined;
      const { contentType, body } = formatResponse(tierInfo, format);
      
      res.type(contentType).send(body);
    } catch (error) {
      logger.error("Error fetching tier information", {}, error as Error);
      const format = req.query.format as string | undefined;
      const errorResponse = {
        error: "Failed to fetch tier information",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      res.status(500).type(contentType).send(body);
    }
  });

  // Additional long-form descriptive endpoints (without version prefix)
  app.post("/api/kubernetes/network-plan", async (req, res) => {
    try {
      const plan = await generateKubernetesNetworkPlan(req.body);
      const format = req.query.format as string | undefined;
      const { contentType, body } = formatResponse(plan, format);
      
      res.type(contentType).send(body);
    } catch (error) {
      const format = req.query.format as string | undefined;
      let errorResponse: unknown;
      
      if (error instanceof KubernetesNetworkGenerationError) {
        errorResponse = {
          error: error.message,
          code: "NETWORK_GENERATION_ERROR"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      if (error instanceof SyntaxError || (error as any).code === "INVALID_REQUEST" || (error as any).name === "ZodError") {
        errorResponse = {
          error: error instanceof Error ? error.message : "Invalid request",
          code: "INVALID_REQUEST"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      logger.error("Kubernetes network plan generation failed", {
        requestBody: req.body,
      }, error as Error);
      errorResponse = {
        error: "Failed to generate network plan",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      return res.status(500).type(contentType).send(body);
    }
  });

  app.get("/api/kubernetes/tiers", (req, res) => {
    try {
      const tierInfo = getDeploymentTierInfo();
      const format = req.query.format as string | undefined;
      const { contentType, body } = formatResponse(tierInfo, format);
      
      res.type(contentType).send(body);
    } catch (error) {
      logger.error("Error fetching tier information", {}, error as Error);
      const format = req.query.format as string | undefined;
      const errorResponse = {
        error: "Failed to fetch tier information",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      res.status(500).type(contentType).send(body);
    }
  });

  return { server: httpServer, routes: registeredRoutes };
}
