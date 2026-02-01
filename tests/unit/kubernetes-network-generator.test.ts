/**
 * tests/unit/kubernetes-network-generator.test.ts
 * 
 * Unit tests for Kubernetes network generator functions
 * Tests network generation logic, validation, and edge cases
 */

import { describe, it, expect } from "vitest";
import {
  generateKubernetesNetworkPlan,
  getDeploymentTierInfo,
  KubernetesNetworkGenerationError
} from "@/lib/kubernetes-network-generator";

describe("Kubernetes Network Generator", () => {
  describe("generateKubernetesNetworkPlan", () => {
    describe("Deployment Tier Configurations", () => {
      it("should generate valid plan for standard tier", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard"
        });

        expect(plan.deploymentSize).toBe("standard");
        expect(plan.subnets.public).toHaveLength(1);
        expect(plan.subnets.private).toHaveLength(1);
      });

      it("should generate valid plan for professional tier", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional"
        });

        expect(plan.deploymentSize).toBe("professional");
        expect(plan.subnets.public).toHaveLength(2);
        expect(plan.subnets.private).toHaveLength(2);
      });

      it("should generate valid plan for enterprise tier", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise"
        });

        expect(plan.deploymentSize).toBe("enterprise");
        expect(plan.subnets.public).toHaveLength(3);
        expect(plan.subnets.private).toHaveLength(3);
      });

      it("should generate valid plan for hyperscale tier", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "hyperscale"
        });

        expect(plan.deploymentSize).toBe("hyperscale");
        expect(plan.subnets.public).toHaveLength(4);
        expect(plan.subnets.private).toHaveLength(4);
      });
    });

    describe("VPC CIDR Generation", () => {
      it("should generate random RFC 1918 VPC if not provided", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard"
        });

        const vpc = plan.vpc.cidr;
        const firstOctet = parseInt(vpc.split(".")[0], 10);

        // Should be RFC 1918: 10, 172, or 192
        expect([10, 172, 192]).toContain(firstOctet);
      });

      it("should accept custom VPC CIDR", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "10.5.0.0/16"
        });

        expect(plan.vpc.cidr).toBe("10.5.0.0/16");
      });

      it("should normalize VPC CIDR to network address", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "10.5.50.100/16"
        });

        expect(plan.vpc.cidr).toBe("10.5.0.0/16");
      });

      it("should throw error for invalid VPC CIDR", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: "invalid-cidr"
          })
        ).rejects.toThrow(KubernetesNetworkGenerationError);
      });

      it("should throw error for malformed CIDR", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: "10.0.0.0/33" // Invalid prefix
          })
        ).rejects.toThrow(KubernetesNetworkGenerationError);
      });
    });

    describe("Subnet Generation", () => {
      it("should generate correct number of public subnets", async () => {
        const plans = await Promise.all([
          generateKubernetesNetworkPlan({ deploymentSize: "standard" }),
          generateKubernetesNetworkPlan({ deploymentSize: "professional" }),
          generateKubernetesNetworkPlan({ deploymentSize: "enterprise" }),
          generateKubernetesNetworkPlan({ deploymentSize: "hyperscale" })
        ]);

        expect(plans[0].subnets.public).toHaveLength(1);
        expect(plans[1].subnets.public).toHaveLength(2);
        expect(plans[2].subnets.public).toHaveLength(3);
        expect(plans[3].subnets.public).toHaveLength(4);
      });

      it("should generate correct number of private subnets", async () => {
        const plans = await Promise.all([
          generateKubernetesNetworkPlan({ deploymentSize: "standard" }),
          generateKubernetesNetworkPlan({ deploymentSize: "professional" }),
          generateKubernetesNetworkPlan({ deploymentSize: "enterprise" }),
          generateKubernetesNetworkPlan({ deploymentSize: "hyperscale" })
        ]);

        expect(plans[0].subnets.private).toHaveLength(1);
        expect(plans[1].subnets.private).toHaveLength(2);
        expect(plans[2].subnets.private).toHaveLength(3);
        expect(plans[3].subnets.private).toHaveLength(4);
      });

      it("should name subnets correctly", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional"
        });

        const publicNames = plan.subnets.public.map(s => s.name);
        const privateNames = plan.subnets.private.map(s => s.name);

        expect(publicNames).toContain("public-1");
        expect(publicNames).toContain("public-2");
        expect(privateNames).toContain("private-1");
        expect(privateNames).toContain("private-2");
      });

      it("should assign correct subnet types", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional"
        });

        plan.subnets.public.forEach(subnet => {
          expect(subnet.type).toBe("public");
        });

        plan.subnets.private.forEach(subnet => {
          expect(subnet.type).toBe("private");
        });
      });
    });

    describe("Pod and Services CIDR", () => {
      it("should generate separate pod CIDR", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "10.0.0.0/16"
        });

        expect(plan.pods.cidr).toBeDefined();
        expect(plan.pods.cidr).not.toBe(plan.vpc.cidr);
      });

      it("should generate separate services CIDR", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "10.0.0.0/16"
        });

        expect(plan.services.cidr).toBeDefined();
        expect(plan.services.cidr).not.toBe(plan.vpc.cidr);
        expect(plan.services.cidr).not.toBe(plan.pods.cidr);
      });

      it("should have proper CIDR prefixes for different tiers", async () => {
        const standard = await generateKubernetesNetworkPlan({
          deploymentSize: "standard"
        });
        const hyperscale = await generateKubernetesNetworkPlan({
          deploymentSize: "hyperscale"
        });

        // Hyperscale should have larger pod space (/15 vs /16)
        const standardPodsPrefix = parseInt(standard.pods.cidr.split("/")[1], 10);
        const hyperscalePodsPrefix = parseInt(hyperscale.pods.cidr.split("/")[1], 10);

        expect(hyperscalePodsPrefix).toBeLessThan(standardPodsPrefix);
      });
    });

    describe("Provider Support", () => {
      it("should support EKS provider", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          provider: "eks"
        });

        expect(plan.provider).toBe("eks");
      });

      it("should support GKE provider", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          provider: "gke"
        });

        expect(plan.provider).toBe("gke");
      });

      it("should support generic Kubernetes provider", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          provider: "kubernetes"
        });

        expect(plan.provider).toBe("kubernetes");
      });

      it("should default to kubernetes provider", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard"
        });

        expect(plan.provider).toBe("kubernetes");
      });
    });

    describe("Metadata", () => {
      it("should include generation timestamp", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard"
        });

        expect(plan.metadata.generatedAt).toBeDefined();
        expect(plan.metadata.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it("should include API version", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard"
        });

        expect(plan.metadata.version).toBe("1.0");
      });

      it("should include deployment name when provided", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          deploymentName: "my-cluster"
        });

        expect(plan.deploymentName).toBe("my-cluster");
      });

      it("should not include deployment name if not provided", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard"
        });

        expect(plan.deploymentName).toBeUndefined();
      });
    });

    describe("Error Handling", () => {
      it("should throw error for invalid deployment size", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: "unknown" as any
          })
        ).rejects.toThrow();
      });

      it("should throw error for invalid provider", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            provider: "invalid" as any
          })
        ).rejects.toThrow();
      });

      it("should throw error for missing deployment size", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: null as any
          })
        ).rejects.toThrow();
      });
    });

    describe("RFC 1918 Support", () => {
      it("should support Class A private range", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "10.100.0.0/16"
        });

        expect(plan.vpc.cidr).toBe("10.100.0.0/16");
      });

      it("should support Class B private range", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "172.25.0.0/16"
        });

        expect(plan.vpc.cidr).toBe("172.25.0.0/16");
      });

      it("should support Class C private range", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "192.168.50.0/16"
        });

        // CIDR is normalized to network address
        expect(plan.vpc.cidr).toBe("192.168.0.0/16");
      });
    });
  });

  describe("getDeploymentTierInfo", () => {
    it("should return all tier information", () => {
      const tiers = getDeploymentTierInfo();

      expect(tiers).toHaveProperty("standard");
      expect(tiers).toHaveProperty("professional");
      expect(tiers).toHaveProperty("enterprise");
      expect(tiers).toHaveProperty("hyperscale");
    });

    it("should include tier configuration", () => {
      const tiers = getDeploymentTierInfo();

      expect(tiers.standard).toMatchObject({
        publicSubnets: expect.any(Number),
        privateSubnets: expect.any(Number),
        subnetSize: expect.any(Number),
        podsPrefix: expect.any(Number),
        servicesPrefix: expect.any(Number),
        description: expect.any(String)
      });
    });

    it("should show increasing subnet counts for larger tiers", () => {
      const tiers = getDeploymentTierInfo();

      const standardPublic = (tiers.standard as any).publicSubnets;
      const professionalPublic = (tiers.professional as any).publicSubnets;
      const enterprisePublic = (tiers.enterprise as any).publicSubnets;
      const hyperscalePublic = (tiers.hyperscale as any).publicSubnets;

      expect(standardPublic).toBeLessThanOrEqual(professionalPublic);
      expect(professionalPublic).toBeLessThanOrEqual(enterprisePublic);
      expect(enterprisePublic).toBeLessThanOrEqual(hyperscalePublic);
    });

    it("should throw error for unknown tier", () => {
      expect(() => {
        getDeploymentTierInfo("unknown" as any);
      }).toThrow(KubernetesNetworkGenerationError);
    });
  });

  describe("Reproducibility", () => {
    it("should produce same results for same inputs", async () => {
      const input = {
        deploymentSize: "professional" as const,
        vpcCidr: "10.0.0.0/16",
        provider: "eks" as const,
        deploymentName: "test"
      };

      const plan1 = await generateKubernetesNetworkPlan(input);
      const plan2 = await generateKubernetesNetworkPlan(input);

      // Same inputs should produce identical outputs (except timestamps might differ slightly)
      expect(plan1.vpc).toEqual(plan2.vpc);
      expect(plan1.subnets).toEqual(plan2.subnets);
      expect(plan1.pods).toEqual(plan2.pods);
      expect(plan1.services).toEqual(plan2.services);
    });

    it("should produce different VPC CIDRs for random generation", async () => {
      const plans = await Promise.all([
        generateKubernetesNetworkPlan({ deploymentSize: "standard" }),
        generateKubernetesNetworkPlan({ deploymentSize: "standard" }),
        generateKubernetesNetworkPlan({ deploymentSize: "standard" })
      ]);

      const vpcs = plans.map(p => p.vpc.cidr);

      // It's statistically very unlikely to get the same VPC CIDR twice
      expect(new Set(vpcs).size).toBeGreaterThan(1);
    });
  });
});
