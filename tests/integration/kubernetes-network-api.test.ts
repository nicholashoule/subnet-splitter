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

      // Realistic hyperscale: 3 AZs (most cloud regions have 3-6 AZs)
      expect(plan.subnets.public).toHaveLength(3);
      expect(plan.subnets.private).toHaveLength(3);
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

      const micro = tierInfo.micro as any;
      const standard = tierInfo.standard as any;
      const professional = tierInfo.professional as any;
      const enterprise = tierInfo.enterprise as any;
      const hyperscale = tierInfo.hyperscale as any;

      // Subnets should increase
      expect(standard.publicSubnets).toBe(1);
      expect(professional.publicSubnets).toBe(2);
      expect(enterprise.publicSubnets).toBe(3);
      // Realistic hyperscale: 3 AZs (same as enterprise, but larger subnet sizes)
      expect(hyperscale.publicSubnets).toBe(3);

      // Pod CIDR progression: micro (/20) -> professional (/18) -> enterprise (/16) -> hyperscale (/13)
      expect(micro.podsPrefix).toBe(20); // 4,096 IPs for 1-2 nodes
      expect(professional.podsPrefix).toBe(18); // 16,384 IPs for 10 nodes
      expect(enterprise.podsPrefix).toBe(16); // 65,536 IPs (IDEAL)
      expect(hyperscale.podsPrefix).toBe(13); // 524,288 IPs (supports 5000 nodes at 110 pods/node)
      // Larger tiers have more IP space (smaller prefix number)
      expect(professional.podsPrefix).toBeLessThan(micro.podsPrefix);
      expect(enterprise.podsPrefix).toBeLessThan(professional.podsPrefix);
      expect(hyperscale.podsPrefix).toBeLessThan(enterprise.podsPrefix);
    });
  });

  describe("Public and Private Subnets Coverage", () => {
    it("should generate both public and private subnets for professional tier", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "professional",
        provider: "eks",
        vpcCidr: "10.0.0.0/16"
      });

      // Verify public subnets exist
      expect(plan.subnets.public).toHaveLength(2);
      plan.subnets.public.forEach((subnet) => {
        expect(subnet.type).toBe("public");
        expect(subnet.name).toMatch(/^public-/);
        expect(subnet.cidr).toMatch(/^10\.0\.\d+\.\d+\/\d+$/);
      });

      // Verify private subnets exist
      expect(plan.subnets.private).toHaveLength(2);
      plan.subnets.private.forEach((subnet) => {
        expect(subnet.type).toBe("private");
        expect(subnet.name).toMatch(/^private-/);
        expect(subnet.cidr).toMatch(/^10\.0\.\d+\.\d+\/\d+$/);
      });

      // Total subnets should be 4 (2 public + 2 private)
      const totalSubnets = plan.subnets.public.length + plan.subnets.private.length;
      expect(totalSubnets).toBe(4);
    });

    it("should generate multiple private subnets for enterprise tier (HA-ready)", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "enterprise",
        provider: "eks",
        vpcCidr: "10.0.0.0/16"
      });

      // Enterprise has 3 public and 3 private for multi-AZ
      expect(plan.subnets.public).toHaveLength(3);
      expect(plan.subnets.private).toHaveLength(3);

      // Verify all subnets have correct types and names
      plan.subnets.public.forEach((subnet, i) => {
        expect(subnet.type).toBe("public");
        expect(subnet.name).toBe(`public-${i + 1}`);
      });
      plan.subnets.private.forEach((subnet, i) => {
        expect(subnet.type).toBe("private");
        expect(subnet.name).toBe(`private-${i + 1}`);
      });
    });

    it("should generate hyperscale with 3 AZs (realistic for most cloud regions)", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "hyperscale",
        provider: "eks"
      });

      // Realistic hyperscale: 3 public + 3 private subnets
      expect(plan.subnets.public).toHaveLength(3);
      expect(plan.subnets.private).toHaveLength(3);

      // All subnets should be properly named
      plan.subnets.public.forEach((s, i) => {
        expect(s.name).toBe(`public-${i + 1}`);
      });
      plan.subnets.private.forEach((s, i) => {
        expect(s.name).toBe(`private-${i + 1}`);
      });
    });
  });

  describe("Output Format Support (JSON/YAML)", () => {
    it("should generate valid JSON format for network plan", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "professional",
        provider: "eks",
        vpcCidr: "10.0.0.0/16",
        deploymentName: "test-cluster"
      });

      // Verify can be JSON stringified
      const jsonStr = JSON.stringify(plan, null, 2);
      expect(jsonStr).toBeTruthy();

      // Verify can be parsed back
      const parsed = JSON.parse(jsonStr);
      expect(parsed.deploymentSize).toBe("professional");
      expect(parsed.subnets.public).toHaveLength(2);
      expect(parsed.subnets.private).toHaveLength(2);
    });

    it("should output all subnet details in JSON format", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "professional",
        provider: "eks",
        vpcCidr: "10.50.0.0/16"
      });

      const jsonStr = JSON.stringify(plan, null, 2);
      const parsed = JSON.parse(jsonStr);

      // Verify public subnets are included
      expect(parsed.subnets.public).toBeDefined();
      expect(Array.isArray(parsed.subnets.public)).toBe(true);
      parsed.subnets.public.forEach((subnet: any) => {
        expect(subnet).toHaveProperty("cidr");
        expect(subnet).toHaveProperty("name");
        expect(subnet).toHaveProperty("type");
        expect(subnet.type).toBe("public");
      });

      // Verify private subnets are included
      expect(parsed.subnets.private).toBeDefined();
      expect(Array.isArray(parsed.subnets.private)).toBe(true);
      parsed.subnets.private.forEach((subnet: any) => {
        expect(subnet).toHaveProperty("cidr");
        expect(subnet).toHaveProperty("name");
        expect(subnet).toHaveProperty("type");
        expect(subnet.type).toBe("private");
      });
    });

    it("should support YAML serialization of network plans", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "standard",
        provider: "gke",
        vpcCidr: "172.16.0.0/16"
      });

      // Verify structure is compatible with YAML
      const jsonStr = JSON.stringify(plan);
      const obj = JSON.parse(jsonStr);

      // Check key YAML-compatible fields
      expect(obj).toHaveProperty("deploymentSize");
      expect(obj).toHaveProperty("provider");
      expect(obj).toHaveProperty("vpc");
      expect(obj).toHaveProperty("subnets");
      expect(obj).toHaveProperty("pods");
      expect(obj).toHaveProperty("services");
      expect(obj).toHaveProperty("metadata");

      // Verify nested structure
      expect(obj.vpc).toHaveProperty("cidr");
      expect(obj.subnets).toHaveProperty("public");
      expect(obj.subnets).toHaveProperty("private");
      expect(obj.pods).toHaveProperty("cidr");
      expect(obj.services).toHaveProperty("cidr");
    });

    it("should include all subnet details for YAML/JSON export", async () => {
      const plan = await generateKubernetesNetworkPlan({
        deploymentSize: "professional",
        provider: "kubernetes",
        vpcCidr: "192.168.0.0/16",
        deploymentName: "self-hosted-prod"
      });

      // All data should be serializable
      const data = {
        deploymentSize: plan.deploymentSize,
        provider: plan.provider,
        deploymentName: plan.deploymentName,
        vpc: plan.vpc,
        subnets: plan.subnets,
        pods: plan.pods,
        services: plan.services,
        metadata: plan.metadata
      };

      // Verify can stringify
      expect(() => JSON.stringify(data)).not.toThrow();

      const json = JSON.stringify(data);
      const restored = JSON.parse(json);

      // Verify subnets are fully included
      expect(restored.subnets.public.length).toBeGreaterThan(0);
      expect(restored.subnets.private.length).toBeGreaterThan(0);
    });

    it("should maintain data integrity when converting between JSON formats", async () => {
      const original = await generateKubernetesNetworkPlan({
        deploymentSize: "enterprise",
        provider: "eks",
        vpcCidr: "10.100.0.0/16",
        deploymentName: "conversion-test"
      });

      // Convert to JSON and back
      const jsonStr = JSON.stringify(original);
      const restored = JSON.parse(jsonStr);

      // Verify integrity
      expect(restored.deploymentSize).toBe(original.deploymentSize);
      expect(restored.provider).toBe(original.provider);
      expect(restored.deploymentName).toBe(original.deploymentName);
      expect(restored.vpc.cidr).toBe(original.vpc.cidr);
      expect(restored.subnets.public).toEqual(original.subnets.public);
      expect(restored.subnets.private).toEqual(original.subnets.private);
      expect(restored.pods.cidr).toBe(original.pods.cidr);
      expect(restored.services.cidr).toBe(original.services.cidr);
    });
  });

  describe("Private IP Security Enforcement (API Level)", () => {
    describe("RFC 1918 Private Ranges Acceptance", () => {
      it("should accept Class A private range (10.0.0.0/8)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "10.0.0.0/8"
        });
        expect(plan.vpc.cidr).toBe("10.0.0.0/8");
      });

      it("should accept Class B private range (172.16.0.0/12)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          vpcCidr: "172.16.0.0/12"
        });
        expect(plan.vpc.cidr).toBe("172.16.0.0/12");
      });

      it("should accept Class C private range (192.168.0.0/16)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise",
          vpcCidr: "192.168.0.0/16"
        });
        expect(plan.vpc.cidr).toBe("192.168.0.0/16");
      });

      it("should accept any subnet within Class A private range", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "10.100.0.0/16"
        });
        expect(plan.vpc.cidr).toBe("10.100.0.0/16");
      });

      it("should accept any subnet within Class B private range", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          vpcCidr: "172.20.0.0/16"
        });
        expect(plan.vpc.cidr).toBe("172.20.0.0/16");
      });

      it("should accept any subnet within Class C private range", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          vpcCidr: "192.168.100.0/16"
        });
        // CIDR normalized to network address
        expect(plan.vpc.cidr).toBe("192.168.0.0/16");
      });

      it("should accept standard subnets within private ranges", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          vpcCidr: "10.50.0.0/16"
        });
        expect(plan.vpc.cidr).toBe("10.50.0.0/16");
      });
    });

    describe("Public IP Rejection (Security Anti-Pattern)", () => {
      it("should reject public Class A IP ranges", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: "8.8.8.0/16"
          })
        ).rejects.toThrow();
      });

      it("should reject public Class B IP ranges", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: "professional",
            vpcCidr: "172.100.0.0/16"
          })
        ).rejects.toThrow();
      });

      it("should reject public Class C IP ranges", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: "enterprise",
            vpcCidr: "203.0.113.0/24"
          })
        ).rejects.toThrow();
      });

      it("should reject multicast Class D ranges", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: "224.0.0.0/4"
          })
        ).rejects.toThrow();
      });

      it("should reject reserved Class E ranges", async () => {
        await expect(
          generateKubernetesNetworkPlan({
            deploymentSize: "professional",
            vpcCidr: "240.0.0.0/4"
          })
        ).rejects.toThrow();
      });

      it("should include security guidance in error message for public IP", async () => {
        try {
          await generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: "1.1.1.0/16"
          });
          throw new Error("Should have thrown an error");
        } catch (error: any) {
          expect(error.message).toContain("RFC 1918");
          expect(error.message).toContain("private");
        }
      });
    });

    describe("Auto-generated VPCs Always Private", () => {
      it("should auto-generate only private RFC 1918 CIDRs", async () => {
        // Run multiple times to ensure all generated CIDRs are private
        for (let i = 0; i < 10; i++) {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: "standard"
            // No vpcCidr specified - uses auto-generation
          });

          const firstOctet = parseInt(plan.vpc.cidr.split(".")[0], 10);

          // Check if in private ranges
          const isPrivate =
            firstOctet === 10 ||
            (firstOctet === 172 && parseInt(plan.vpc.cidr.split(".")[1], 10) >= 16) ||
            (firstOctet === 192 && parseInt(plan.vpc.cidr.split(".")[1], 10) === 168);

          expect(isPrivate).toBe(true);
        }
      });
    });
  });
});
