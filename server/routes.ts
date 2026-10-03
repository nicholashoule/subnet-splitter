/**
 * server/routes.ts
 * 
 * API route registration. Centralized location for all Express route definitions:
 * health checks (/health* and /api/v1/health*), and under /api the version, the
 * OpenAPI document and its Swagger UI page, and the Kubernetes planning endpoints.
 *
 * All routes should:
 * - Return appropriate HTTP status codes and { error, code } error bodies
 * - Validate input with the Zod schemas in shared/kubernetes-schema.ts
 *
 * The plan and tiers routes write their validation and planning errors in the format
 * ?format= asks for (JSON or YAML). Malformed, oversized or wrongly encoded bodies
 * (400, 413, 415, from errorHandler in server/app.ts), unknown API paths (404, below)
 * and rate limiting (429) are always JSON.
 */

import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import type { Server } from "http";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { z, ZodError } from "zod";
import { generateKubernetesNetworkPlan, getDeploymentTierInfo, KubernetesNetworkGenerationError } from "../client/src/lib/kubernetes-network-generator";
import { ProviderEnum, NetworkModeEnum, KubernetesNetworkPlanRequestSchema } from "../shared/kubernetes-schema";

/** Query parameters for GET /tiers (format is handled separately) */
const TierQuerySchema = z.object({
  provider: ProviderEnum.optional(),
  networkMode: NetworkModeEnum.optional(),
});
import YAML from "yaml";
import { version as APP_VERSION } from "../package.json";
import { logger } from "./logger";
import { isHealthProbe } from "./health";
import { API_PATH } from "./api-path";
import { openApiSpec } from "./openapi";
import { buildSwaggerUICSP } from "./csp-config";
import { swaggerUiHtml } from "./swagger-ui";

/**
 * Per-IP rate limiter for /api routes. Health probes (GET or HEAD on an exact health
 * path, server/health.ts) are exempt so load balancer and Kubernetes probes are never
 * throttled; every other request under /api counts, bodies or not.
 */
export function createApiRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 100, // generous for scripted/Terraform use, stops abusive loops
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a minute and try again.", code: "RATE_LIMITED" },
    // Mounted on API_PATH: req.baseUrl is the /api segment as sent (/api, /API, ...) and
    // req.path the rest, so only a correctly cased probe path is exempt
    skip: (req) => isHealthProbe(req.method, req.baseUrl + req.path),
    keyGenerator: (req) => req.ip ? ipKeyGenerator(req.ip) : "unknown",
  });
}

/** Most validation issues a response lists; the rest are counted */
const MAX_REPORTED_ISSUES = 5;

/**
 * Turn Zod issues into a short, readable message (e.g. "deploymentSize: Required").
 * Capped: an array of thousands of bad elements in a 16 KB body would otherwise make
 * an error response hundreds of KB long.
 */
function formatZodError(error: ZodError): string {
  const messages = error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map(issue => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message));
  const more = error.issues.length - MAX_REPORTED_ISSUES;
  return messages.join("; ") + (more > 0 ? `; and ${more} more` : "");
}

/**
 * What the log records of a plan request that failed with a 500: an allowlist of the
 * validated fields that determine the plan, enough to reproduce the failure. Unknown
 * fields and deploymentName (free text the plan only echoes) are left out, so nothing
 * else a client sends reaches the logs.
 */
function planInputsForLog(body: unknown): Record<string, unknown> | undefined {
  const parsed = KubernetesNetworkPlanRequestSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const { deploymentSize, provider, region, vpcCidr, podsCidr, servicesCidr, availabilityZones, networkMode } = parsed.data;
  return { deploymentSize, provider, region, vpcCidr, podsCidr, servicesCidr, availabilityZones, networkMode };
}

/**
 * The ?format= query value. A repeated parameter (?format=json&format=yaml) parses
 * as an array; anything that isn't a single string falls back to JSON.
 */
function formatOf(req: Request): string | undefined {
  return typeof req.query.format === "string" ? req.query.format : undefined;
}

/**
 * YAML with every string value double-quoted, so each reads back as the same string in
 * any YAML version: YAML 1.1 readers (PyYAML) load an unquoted "no" or "on" as a
 * boolean, and YAML 1.2 readers load "0o17" as a number. Keys stay plain.
 */
function toYaml(data: unknown): string {
  return YAML.stringify(data, { defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN" });
}

/**
 * Format response as JSON or YAML based on the format parameter
 */
function formatResponse(data: unknown, format?: string): { contentType: string; body: string } {
  const outputFormat = (format || "json").toLowerCase();
  
  if (outputFormat === "yaml" || outputFormat === "yml") {
    return { contentType: "application/yaml", body: toYaml(data) };
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

  // Register a route and record it for startup logging
  const get = (path: string, ...handlers: RequestHandler[]) => {
    registeredRoutes.push({ method: "GET", path });
    app.get(path, ...handlers);
  };
  const post = (path: string, ...handlers: RequestHandler[]) => {
    registeredRoutes.push({ method: "POST", path });
    app.post(path, ...handlers);
  };

  // Health check endpoints for production monitoring.
  // Served at both /health* and /api/v1/health* (OpenAPI/Swagger UI compatibility).
  // No external dependencies, so readiness and liveness are always true.
  const healthHandler: RequestHandler = (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: APP_VERSION
    });
  };
  const readyHandler: RequestHandler = (req, res) => {
    res.status(200).json({ status: "ready", timestamp: new Date().toISOString() });
  };
  const liveHandler: RequestHandler = (req, res) => {
    res.status(200).json({ status: "alive", timestamp: new Date().toISOString() });
  };

  for (const prefix of ["/health", "/api/v1/health"]) {
    get(prefix, healthHandler);
    get(`${prefix}/ready`, readyHandler);
    get(`${prefix}/live`, liveHandler);
  }

  // API version endpoint
  get("/api/version", (req, res) => {
    res.json({
      version: APP_VERSION,
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

  // OpenAPI specification endpoint. The document never changes while the server runs,
  // so it is serialized once (YAML takes milliseconds per request otherwise).
  const openApiJson = formatResponse(openApiSpec, "json");
  const openApiYaml = formatResponse(openApiSpec, "yaml");
  get("/api/docs", (req, res) => {
    const format = (formatOf(req) ?? "json").toLowerCase();
    const { contentType, body } = format === "yaml" || format === "yml" ? openApiYaml : openApiJson;
    res.type(contentType).send(body);
  });

  // Swagger UI CSP override middleware
  // IMPORTANT: This completely replaces the global CSP policy to allow 'unsafe-inline' for scripts.
  // 
  // Swagger UI requires inline script execution for SwaggerUIBundle initialization, which cannot be 
  // safely added to global CSP without affecting all endpoints. Route-specific override allows 
  // Swagger UI to function while keeping strict CSP on all other routes.
  //
  // The CSP directives are defined in server/csp-config.ts (buildSwaggerUICSP function)
  // and are kept in sync with baseCSPDirectives via that shared module.
  // Note: 'unsafe-inline' is required for Swagger UI to work - it cannot function without it.
  const swaggerCSPMiddleware = (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', buildSwaggerUICSP());
    next();
  };

  // Swagger UI page (markup and styles live in server/swagger-ui.ts)
  get("/api/docs/ui", swaggerCSPMiddleware, (req, res) => {
    // Revalidate every load so a redeploy's page and asset pins take effect immediately
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type("html").send(swaggerUiHtml);
  });

  // ── Shared route handlers ──────────────────────────────────────────
  // Extracted to avoid duplicating identical logic across multiple endpoint aliases.

  /** Handler for POST /api/k8s/plan and its aliases */
  const handleNetworkPlan = async (req: Request, res: Response) => {
    try {
      const plan = await generateKubernetesNetworkPlan(req.body);
      const format = formatOf(req);
      const { contentType, body } = formatResponse(plan, format);
      
      res.type(contentType).send(body);
    } catch (error) {
      const format = formatOf(req);
      let errorResponse: unknown;
      
      if (error instanceof KubernetesNetworkGenerationError) {
        errorResponse = {
          error: error.message,
          code: "NETWORK_GENERATION_ERROR"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      if (error instanceof ZodError) {
        errorResponse = {
          error: `Invalid request: ${formatZodError(error)}`,
          code: "INVALID_REQUEST"
        };
        const { contentType, body } = formatResponse(errorResponse, format);
        return res.status(400).type(contentType).send(body);
      }
      logger.error("Kubernetes network plan generation failed", {
        request: planInputsForLog(req.body),
      }, error as Error);
      errorResponse = {
        error: "Failed to generate network plan",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      return res.status(500).type(contentType).send(body);
    }
  };

  /** Handler for GET /api/k8s/tiers and its aliases */
  const handleTiers = (req: Request, res: Response) => {
    const format = formatOf(req);
    // Layouts differ by provider (EKS needs two AZs; GKE/AKS subnets are regional)
    // and by network mode (private replaces public subnets with internal LB subnets)
    const query = TierQuerySchema.safeParse(req.query);
    if (!query.success) {
      const issue = query.error.issues[0];
      const { contentType, body } = formatResponse({
        error: `Invalid request: ${issue.path.join(".")}: ${issue.message}`,
        code: "INVALID_REQUEST"
      }, format);
      return res.status(400).type(contentType).send(body);
    }
    try {
      const tierInfo = getDeploymentTierInfo(undefined, query.data.provider, query.data.networkMode);
      const { contentType, body } = formatResponse(tierInfo, format);

      res.type(contentType).send(body);
    } catch (error) {
      logger.error("Error fetching tier information", {}, error as Error);
      const errorResponse = {
        error: "Failed to fetch tier information",
        code: "INTERNAL_ERROR"
      };
      const { contentType, body } = formatResponse(errorResponse, format);
      res.status(500).type(contentType).send(body);
    }
  };

  // ── Kubernetes Network Planning API endpoints ──────────────────────
  // Primary concise endpoints
  post("/api/k8s/plan", handleNetworkPlan);
  get("/api/k8s/tiers", handleTiers);

  // Versioned short-form aliases
  post("/api/v1/k8s/plan", handleNetworkPlan);
  get("/api/v1/k8s/tiers", handleTiers);

  // Long-form descriptive endpoints (versioned)
  post("/api/v1/kubernetes/network-plan", handleNetworkPlan);
  get("/api/v1/kubernetes/tiers", handleTiers);

  // Long-form descriptive endpoints (without version prefix)
  post("/api/kubernetes/network-plan", handleNetworkPlan);
  get("/api/kubernetes/tiers", handleTiers);

  // Anything else under /api is a JSON 404, so clients (Terraform http data sources,
  // scripts) never receive the web app's index.html for a mistyped path or method.
  // Matched in any letter case, before static serving or Vite. (createApp() lowercases
  // API paths first, so /API/k8s/tiers is served by its route and never gets here.)
  app.use((req, res, next) => {
    if (!API_PATH.test(req.path)) return next();
    res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
  });

  return { server: httpServer, routes: registeredRoutes };
}
