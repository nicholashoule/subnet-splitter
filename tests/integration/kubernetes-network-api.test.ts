/**
 * tests/integration/kubernetes-network-api.test.ts
 * 
 * End-to-end tests of the network plan generator behind /api/k8s/plan,
 * called directly (no HTTP). Covers all deployment tiers, providers, and
 * network generation scenarios. HTTP routing, error responses, and
 * JSON/YAML output are tested in api-endpoints.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  generateKubernetesNetworkPlan,
  getDeploymentTierInfo,
  KubernetesNetworkGenerationError
} from "@/lib/kubernetes-network-generator";
import { ipToNumber, parseCidr } from "@/lib/subnet-utils";

/** True when the CIDR lies entirely inside one RFC 1918 block */
function isRfc1918(cidr: string): boolean {
  const { network, prefix } = parseCidr(cidr);
  const last = network + 2 ** (32 - prefix) - 1;
  return ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].some((block) => {
    const b = parseCidr(block);
    return network >= b.network && last <= b.network + 2 ** (32 - b.prefix) - 1;
  });
}

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
      const tiers: Array<"micro" | "standard" | "professional" | "enterprise" | "hyperscale"> = [
        "micro",
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

    it("should generate plan for a hyperscale single-region cluster", async () => {
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
      expect(hyperscale.podsPrefix).toBe(13); // 524,288 IPs: 2,048 nodes at a /24 each (5,000 needs a /11 podsCidr)
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

  describe("Serializable Output", () => {
    // JSON and YAML responses over HTTP (?format=yaml) are tested in
    // api-endpoints.test.ts "Response Format Support"; this checks the plan itself.
    it("should be plain data that survives a JSON round trip unchanged", async () => {
      for (const provider of ["eks", "gke", "aks", "kubernetes"] as const) {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise",
          provider,
          vpcCidr: "10.100.0.0/16",
          deploymentName: "conversion-test"
        });

        // A Date, Map, Set, BigInt, NaN, undefined field or class instance would not survive this
        expect(JSON.parse(JSON.stringify(plan))).toStrictEqual(plan);
      }
    });
  });

  describe("Private IP Security Enforcement (API Level)", () => {
    describe("RFC 1918 Private Ranges Acceptance", () => {
      it("should accept a /16 in the Class A private range (10.0.0.0/8)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "10.200.0.0/16"
        });
        expect(plan.vpc.cidr).toBe("10.200.0.0/16");
      });

      it("should accept a /16 in the Class B private range (172.16.0.0/12)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          vpcCidr: "172.20.0.0/16"
        });
        expect(plan.vpc.cidr).toBe("172.20.0.0/16");
      });

      it("should reject a whole private block as the VPC: /16 is the largest VPC", async () => {
        for (const vpcCidr of ["10.0.0.0/8", "172.16.0.0/12"]) {
          await expect(generateKubernetesNetworkPlan({ deploymentSize: "standard", vpcCidr }))
            .rejects.toThrow(/too large.*\/16 or smaller/);
        }
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

          // Entirely inside 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16 (not just a matching first octet)
          expect(isRfc1918(plan.vpc.cidr), plan.vpc.cidr).toBe(true);
        }
      });
    });
  });

  describe("Subnet Allocation Correctness", () => {
    const tiers = ["micro", "standard", "professional", "enterprise", "hyperscale"] as const;
    // One representative VPC per RFC 1918 major block
    const vpcs = ["10.0.0.0/16", "172.16.0.0/16", "192.168.0.0/16"];

    const toRange = (cidr: string) => {
      const [ip, p] = cidr.split("/");
      const prefix = parseInt(p, 10);
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      const num = ipToNumber(ip);
      const network = (num & mask) >>> 0;
      const broadcast = (network | (~mask >>> 0)) >>> 0;
      return { num, network, broadcast };
    };

    for (const tier of tiers) {
      for (const vpc of vpcs) {
        it(`emits canonical, non-overlapping subnets within VPC for ${tier} @ ${vpc}`, async () => {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: tier,
            provider: "eks",
            vpcCidr: vpc
          });
          const all = [...plan.subnets.public, ...plan.subnets.private];
          const vpcRange = toRange(plan.vpc.cidr);

          const ranges = all.map((s) => {
            const info = toRange(s.cidr);
            // Canonical: address must equal its own network address (no host bits set)
            expect(info.num, `${s.name} ${s.cidr} is not a canonical network address`).toBe(info.network);
            // Contained within the VPC range
            expect(info.network).toBeGreaterThanOrEqual(vpcRange.network);
            expect(info.broadcast).toBeLessThanOrEqual(vpcRange.broadcast);
            return info;
          });

          // No pairwise overlaps between any two subnets
          for (let i = 0; i < ranges.length; i++) {
            for (let j = i + 1; j < ranges.length; j++) {
              const a = ranges[i];
              const b = ranges[j];
              const overlap = a.network <= b.broadcast && b.network <= a.broadcast;
              expect(overlap, `subnets ${all[i].cidr} and ${all[j].cidr} overlap`).toBe(false);
            }
          }
        });
      }
    }
  });
});
