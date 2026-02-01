/**
 * tests/integration/kubernetes-network-api.test.ts
 * 
 * Integration tests for Kubernetes network planning API
 * Tests all deployment tiers, providers, and network generation scenarios
 */

import { describe, it, expect } from "vitest";
import {
  generateKubernetesNetworkPlan,
  getDeploymentTierInfo,
  KubernetesNetworkGenerationError
} from "@/lib/kubernetes-network-generator";

describe("Kubernetes Network Planning API Integration", () => {
  describe("API Workflow", () => {
    it("should handle complete workflow: get tiers -> generate plan", async () => {
      // Step 1: Get available tiers
      const tiers = getDeploymentTierInfo();
      expect(tiers).toHaveProperty("professional");

      // Step 2: Generate network plan using professional tier
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "professional",
        provider: "eks",
        vpcCidr: "10.0.0.0/16",
        deploymentName: "production-cluster"
      });

      expect(plan.deploymentSize).toBe("professional");
      expect(plan.provider).toBe("eks");
      expect(plan.deploymentName).toBe("production-cluster");
      expect(plan.vpc.cidr).toBe("10.0.0.0/16");
      expect(plan.subnets.public).toHaveLength(2);
      expect(plan.subnets.private).toHaveLength(2);
    });
  });

  describe("Deployment Tiers Coverage", () => {
    it("should handle all deployment tier sizes", async () => {
      const tiers: Array<"standard" | "professional" | "enterprise" | "hyperscale"> = [
        "standard",
        "professional",
        "enterprise",
        "hyperscale"
      ];

      for (const tier of tiers) {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: tier
        });

        expect(plan.deploymentSize).toBe(tier);
        expect(plan.provider).toBe("kubernetes"); // default
        expect(plan.vpc.cidr).toBeDefined();
        expect(plan.subnets.public.length).toBeGreaterThan(0);
        expect(plan.subnets.private.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Multiple Providers", () => {
    it("should support EKS, GKE, and generic Kubernetes", async () => {
      const providers: Array<"eks" | "gke" | "kubernetes"> = ["eks", "gke", "kubernetes"];

      for (const provider of providers) {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          provider
        });

        expect(plan.provider).toBe(provider);
      }
    });
  });

  describe("Real-world Scenarios", () => {
    it("should generate plan for production EKS cluster", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "enterprise",
        provider: "eks",
        vpcCidr: "10.100.0.0/16",
        deploymentName: "prod-us-east-1"
      });

      expect(plan).toMatchObject({
        deploymentSize: "enterprise",
        provider: "eks",
        deploymentName: "prod-us-east-1",
        vpc: { cidr: "10.100.0.0/16" }
      });

      // Enterprise should have HA-ready subnets
      expect(plan.subnets.public).toHaveLength(3);
      expect(plan.subnets.private).toHaveLength(3);
    });

    it("should generate plan for dev/test GKE cluster", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "standard",
        provider: "gke",
        deploymentName: "dev-gke-test"
      });

      expect(plan).toMatchObject({
        deploymentSize: "standard",
        provider: "gke",
        deploymentName: "dev-gke-test"
      });

      // Standard should be minimal
      expect(plan.subnets.public).toHaveLength(1);
      expect(plan.subnets.private).toHaveLength(1);
    });

    it("should generate plan for hyperscale multi-region setup", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "hyperscale",
        provider: "kubernetes",
        vpcCidr: "10.0.0.0/16",
        deploymentName: "global-k8s-cluster"
      });

      expect(plan).toMatchObject({
        deploymentSize: "hyperscale",
        provider: "kubernetes",
        deploymentName: "global-k8s-cluster"
      });

      // Hyperscale should have maximum subnet allocation (8 per tier)
      expect(plan.subnets.public).toHaveLength(8);
      expect(plan.subnets.private).toHaveLength(8);
    });
  });

  describe("Error Cases", () => {
    it("should reject invalid deployment size", async () => {
      await expect(
        generateKubernetesNetworkPlan({
          deploymentSize: "invalid" as any
        })
      ).rejects.toThrow();
    });

    it("should reject invalid provider", async () => {
      await expect(
        generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          provider: "invalid" as any
        })
      ).rejects.toThrow();
    });

    it("should reject invalid CIDR", async () => {
      await expect(
        generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "not-a-valid-cidr"
        })
      ).rejects.toThrow(KubernetesNetworkGenerationError);
    });
  });

  describe("Tier Information Endpoint", () => {
    it("should provide information about all tiers", () => {
      const tierInfo = getDeploymentTierInfo();

      expect(tierInfo).toHaveProperty("standard");
      expect(tierInfo).toHaveProperty("professional");
      expect(tierInfo).toHaveProperty("enterprise");
      expect(tierInfo).toHaveProperty("hyperscale");
    });

    it("should show tier progression", () => {
      const tierInfo = getDeploymentTierInfo();

      const standard = tierInfo.standard as any;
      const professional = tierInfo.professional as any;
      const enterprise = tierInfo.enterprise as any;
      const hyperscale = tierInfo.hyperscale as any;

      // Subnets should increase
      expect(standard.publicSubnets).toBe(1);
      expect(professional.publicSubnets).toBe(2);
      expect(enterprise.publicSubnets).toBe(3);
      expect(hyperscale.publicSubnets).toBe(8);

      // Hyperscale gets more pod space
      expect(hyperscale.podsPrefix).toBeLessThan(standard.podsPrefix);
    });
  });
});
