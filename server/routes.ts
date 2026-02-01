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

import type { Express } from "express";
import type { Server } from "http";
import { generateKubernetesNetworkPlan, getDeploymentTierInfo, KubernetesNetworkGenerationError } from "../client/src/lib/kubernetes-network-generator";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Kubernetes Network Planning API
  app.post("/api/kubernetes/network-plan", async (req, res) => {
    try {
      const plan = await generateKubernetesNetworkPlan(req.body);
      res.json(plan);
    } catch (error) {
      if (error instanceof KubernetesNetworkGenerationError) {
        return res.status(400).json({
          error: error.message,
          code: "NETWORK_GENERATION_ERROR"
        });
      }
      if (error instanceof SyntaxError || (error as any).code === "INVALID_REQUEST") {
        return res.status(400).json({
          error: error instanceof Error ? error.message : "Invalid request",
          code: "INVALID_REQUEST"
        });
      }
      console.error("Kubernetes network plan error:", error);
      return res.status(500).json({
        error: "Failed to generate network plan",
        code: "INTERNAL_ERROR"
      });
    }
  });

  // Get deployment tier information
  app.get("/api/kubernetes/tiers", (req, res) => {
    try {
      const tierInfo = getDeploymentTierInfo();
      res.json(tierInfo);
    } catch (error) {
      console.error("Error fetching tier info:", error);
      res.status(500).json({
        error: "Failed to fetch tier information",
        code: "INTERNAL_ERROR"
      });
    }
  });

  return httpServer;
}
