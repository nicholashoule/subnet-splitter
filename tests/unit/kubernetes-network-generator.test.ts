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
        expect(plan.subnets.public).toHaveLength(8);
        expect(plan.subnets.private).toHaveLength(8);
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
        expect(plans[3].subnets.public).toHaveLength(8);
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
        expect(plans[3].subnets.private).toHaveLength(8);
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

    describe("Availability Zone Assignment", () => {
      it("should assign AWS-style AZs for EKS provider", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise",
          provider: "eks",
          vpcCidr: "10.0.0.0/16"
        });

        // Enterprise tier: 3 public + 3 private subnets
        expect(plan.subnets.public).toHaveLength(3);
        expect(plan.subnets.private).toHaveLength(3);

        // Check public subnets have AZ assignments
        expect(plan.subnets.public[0].availabilityZone).toBe("<region>-a");
        expect(plan.subnets.public[1].availabilityZone).toBe("<region>-b");
        expect(plan.subnets.public[2].availabilityZone).toBe("<region>-c");

        // Check private subnets have AZ assignments
        expect(plan.subnets.private[0].availabilityZone).toBe("<region>-a");
        expect(plan.subnets.private[1].availabilityZone).toBe("<region>-b");
        expect(plan.subnets.private[2].availabilityZone).toBe("<region>-c");
      });

      it("should assign GKE-style zones for GKE provider", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          provider: "gke",
          vpcCidr: "10.50.0.0/16"
        });

        // Professional tier: 2 public + 2 private subnets
        expect(plan.subnets.public).toHaveLength(2);
        expect(plan.subnets.private).toHaveLength(2);

        // Check zone assignments (GKE uses same format as AWS)
        expect(plan.subnets.public[0].availabilityZone).toBe("<region>-a");
        expect(plan.subnets.public[1].availabilityZone).toBe("<region>-b");
        expect(plan.subnets.private[0].availabilityZone).toBe("<region>-a");
        expect(plan.subnets.private[1].availabilityZone).toBe("<region>-b");
      });

      it("should assign numerical zones for generic Kubernetes", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise",
          provider: "kubernetes",
          vpcCidr: "192.168.0.0/16"
        });

        // Check zone assignments for generic provider
        expect(plan.subnets.public[0].availabilityZone).toBe("zone-1");
        expect(plan.subnets.public[1].availabilityZone).toBe("zone-2");
        expect(plan.subnets.public[2].availabilityZone).toBe("zone-3");
        expect(plan.subnets.private[0].availabilityZone).toBe("zone-1");
        expect(plan.subnets.private[1].availabilityZone).toBe("zone-2");
        expect(plan.subnets.private[2].availabilityZone).toBe("zone-3");
      });

      it("should round-robin AZs for hyperscale tier (8 subnets)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "hyperscale",
          provider: "eks",
          vpcCidr: "10.100.0.0/16"
        });

        // Hyperscale tier: 8 public + 8 private subnets
        expect(plan.subnets.public).toHaveLength(8);
        expect(plan.subnets.private).toHaveLength(8);

        // Check round-robin distribution (a-h for 8 subnets)
        const expectedAZs = ["a", "b", "c", "d", "e", "f", "g", "h"];
        plan.subnets.public.forEach((subnet, i) => {
          expect(subnet.availabilityZone).toBe(`<region>-${expectedAZs[i]}`);
        });
        plan.subnets.private.forEach((subnet, i) => {
          expect(subnet.availabilityZone).toBe(`<region>-${expectedAZs[i]}`);
        });
      });

      it("should ensure minimum 3 AZs for production tiers (enterprise)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise",
          provider: "eks"
        });

        // Count unique AZs
        const publicAZs = new Set(plan.subnets.public.map(s => s.availabilityZone));
        const privateAZs = new Set(plan.subnets.private.map(s => s.availabilityZone));

        // Enterprise should have 3 distinct AZs
        expect(publicAZs.size).toBe(3);
        expect(privateAZs.size).toBe(3);
      });

      it("should support dual-AZ for professional tier", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          provider: "eks"
        });

        // Count unique AZs
        const publicAZs = new Set(plan.subnets.public.map(s => s.availabilityZone));
        const privateAZs = new Set(plan.subnets.private.map(s => s.availabilityZone));

        // Professional should have 2 distinct AZs
        expect(publicAZs.size).toBe(2);
        expect(privateAZs.size).toBe(2);
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

  describe("Private IP Validation (Security Requirements)", () => {
    describe("RFC 1918 Private Ranges (REQUIRED for Kubernetes)", () => {
      it("should accept Class A private range (10.0.0.0/8)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          vpcCidr: "10.0.0.0/16"
        });

        expect(plan.vpc.cidr).toBe("10.0.0.0/16");
      });

      it("should accept Class B private range (172.16.0.0/12)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          vpcCidr: "172.16.0.0/16"
        });

        expect(plan.vpc.cidr).toBe("172.16.0.0/16");
      });

      it("should accept Class C private range (192.168.0.0/16)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          vpcCidr: "192.168.0.0/16"
        });

        expect(plan.vpc.cidr).toBe("192.168.0.0/16");
      });

      it("should accept various Class A private subnets", async () => {
        const subnets = ["10.1.0.0/16", "10.100.0.0/16", "10.255.0.0/16"];

        for (const subnet of subnets) {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: subnet
          });
          expect(plan.vpc.cidr).toBe(subnet);
        }
      });

      it("should accept various Class B private subnets (172.16-31.x.x)", async () => {
        const subnets = ["172.16.0.0/16", "172.20.0.0/16", "172.31.0.0/16"];

        for (const subnet of subnets) {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: subnet
          });
          expect(plan.vpc.cidr).toBe(subnet);
        }
      });

      it("should accept various Class C private subnets (192.168.x.x)", async () => {
        const subnets = ["192.168.0.0/16", "192.168.100.0/16", "192.168.200.0/16"];

        for (const subnet of subnets) {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: subnet
          });
          // CIDR is normalized to network address
          expect(plan.vpc.cidr).toBe("192.168.0.0/16");
        }
      });
    });

    describe("Public IP Rejection (Security Anti-Pattern)", () => {
      it("should reject public Class A ranges (1-9, 11-126)", async () => {
        const publicRanges = ["1.0.0.0/16", "8.0.0.0/16", "11.0.0.0/16", "126.0.0.0/16"];

        for (const range of publicRanges) {
          await expect(
            generateKubernetesNetworkPlan({
              deploymentSize: "professional",
              vpcCidr: range
            })
          ).rejects.toThrow(KubernetesNetworkGenerationError);
        }
      });

      it("should reject public Class B ranges (except 172.16-31)", async () => {
        const publicRanges = ["172.15.0.0/16", "172.32.0.0/16", "172.100.0.0/16"];

        for (const range of publicRanges) {
          await expect(
            generateKubernetesNetworkPlan({
              deploymentSize: "professional",
              vpcCidr: range
            })
          ).rejects.toThrow(KubernetesNetworkGenerationError);
        }
      });

      it("should reject public Class C ranges (except 192.168.0.0/16)", async () => {
        const publicRanges = ["192.167.0.0/16", "192.169.0.0/16", "200.0.0.0/16"];

        for (const range of publicRanges) {
          await expect(
            generateKubernetesNetworkPlan({
              deploymentSize: "professional",
              vpcCidr: range
            })
          ).rejects.toThrow(KubernetesNetworkGenerationError);
        }
      });

      it("should reject Class D multicast (224-239)", async () => {
        const multicastRanges = ["224.0.0.0/16", "230.0.0.0/16", "239.0.0.0/16"];

        for (const range of multicastRanges) {
          await expect(
            generateKubernetesNetworkPlan({
              deploymentSize: "professional",
              vpcCidr: range
            })
          ).rejects.toThrow(KubernetesNetworkGenerationError);
        }
      });

      it("should reject Class E reserved (240-255)", async () => {
        const reservedRanges = ["240.0.0.0/16", "250.0.0.0/16", "255.0.0.0/16"];

        for (const range of reservedRanges) {
          await expect(
            generateKubernetesNetworkPlan({
              deploymentSize: "professional",
              vpcCidr: range
            })
          ).rejects.toThrow(KubernetesNetworkGenerationError);
        }
      });

      it("should provide security guidance in error message", async () => {
        try {
          await generateKubernetesNetworkPlan({
            deploymentSize: "professional",
            vpcCidr: "8.8.8.0/24"
          });
          throw new Error("Should have thrown error");
        } catch (error) {
          expect(error).toBeInstanceOf(KubernetesNetworkGenerationError);
          const message = (error as Error).message;
          expect(message).toContain("private");
          expect(message).toContain("RFC 1918");
          expect(message).toContain("security");
        }
      });
    });

    describe("Generated VPCs Always Private", () => {
      it("should generate only private IPs when CIDR not specified", async () => {
        const plans = await Promise.all([
          generateKubernetesNetworkPlan({ deploymentSize: "standard" }),
          generateKubernetesNetworkPlan({ deploymentSize: "professional" }),
          generateKubernetesNetworkPlan({ deploymentSize: "enterprise" })
        ]);

        for (const plan of plans) {
          const firstOctet = parseInt(plan.vpc.cidr.split(".")[0], 10);
          expect([10, 172, 192]).toContain(firstOctet);
        }
      });
    });
  });
});
