/**
 * tests/unit/ip-calculation-compliance.test.ts
 *
 * Compliance validation tests for IP calculations against documented formulas
 * from EKS_COMPLIANCE_AUDIT.md, GKE_COMPLIANCE_AUDIT.md, AKS_COMPLIANCE_AUDIT.md,
 * and IP_ALLOCATION_CROSS_REFERENCE.md
 *
 * These tests check the tier layouts the generator applies (getTierConfig and real
 * plans) against each provider's documented address rules: usable addresses per
 * subnet, pod ranges per node, Service range sizes, and VPC size.
 */

import { describe, it, expect } from "vitest";
import {
  generateKubernetesNetworkPlan,
  getTierConfig,
  KubernetesNetworkGenerationError,
} from "@/lib/kubernetes-network-generator";
import { DEPLOYMENT_TIER_CONFIGS } from "@shared/kubernetes-schema";

/**
 * IP Calculation Helper Functions
 * Based on documented formulas from compliance audit files
 */

// Convert CIDR to IP range for overlap testing
function cidrToRange(cidr: string): { start: number; end: number } {
  const [ip, prefix] = cidr.split("/");
  const octets = ip.split(".").map(Number);
  const start =
    (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
  const size = Math.pow(2, 32 - parseInt(prefix, 10));
  return { start, end: start + size - 1 };
}

// Addresses each cloud keeps in every subnet: AWS (VPC user guide, subnet sizing) and
// Azure (virtual network FAQ) reserve 5; Google Cloud reserves 4
const RESERVED_PER_SUBNET = { eks: 5, aks: 5, gke: 4 } as const;
type CloudProvider = keyof typeof RESERVED_PER_SUBNET;
const CLOUD_PROVIDERS = Object.keys(RESERVED_PER_SUBNET) as CloudProvider[];

/** Usable addresses (one per node) in a subnet of the given prefix */
function usableAddresses(prefix: number, provider: CloudProvider): number {
  return Math.pow(2, 32 - prefix) - RESERVED_PER_SUBNET[provider];
}

/**
 * GKE per-node pod range (GKE_COMPLIANCE_AUDIT.md): M = 31 - ceil(log2(Q)) for Q max
 * pods per node, so each node takes 2^(32 - M) addresses (a /24 for 65-128 pods)
 */
function gkeNodeRangeBits(maxPodsPerNode: number): number {
  return 32 - (31 - Math.ceil(Math.log2(maxPodsPerNode)));
}

/** Nodes that fit in a GKE pod range: MN = 2^(HD - HM) */
function gkeMaxNodes(podPrefix: number, maxPodsPerNode: number): number {
  return Math.pow(2, (32 - podPrefix) - gkeNodeRangeBits(maxPodsPerNode));
}

// Calculate total IP addresses from prefix
function calculateTotalAddresses(prefix: number): number {
  return Math.pow(2, 32 - prefix);
}

describe("IP Calculation Compliance Validation", () => {
  describe("Tier Configuration Verification", () => {
    describe("Documented Tier Configurations Match Implementation", () => {
      // getTierConfig() is the layout the generator applies (generic provider here);
      // minVpcPrefix is computed from that layout, control-plane /28s included.
      it("should have micro tier with correct configuration", () => {
        const config = getTierConfig("micro");
        expect(config.publicSubnets).toBe(1);
        expect(config.privateSubnets).toBe(1);
        expect(config.controlPlaneSubnets).toBe(1);
        expect(config.publicSubnetSize).toBe(26); // /26 = 64 addresses (for NAT, LB)
        expect(config.privateSubnetSize).toBe(25); // /25 = 128 addresses (for nodes)
        expect(config.controlPlaneSubnetSize).toBe(28); // /28 = 16 addresses
        expect(config.podsPrefix).toBe(20); // /20 = 4,096 IPs (16 nodes at a /24 each)
        expect(config.servicesPrefix).toBe(20); // /20 = 4,096 ClusterIPs
        expect(config.minVpcPrefix).toBe(24); // /24 minimum VPC
      });

      it("should have standard tier with correct configuration", () => {
        const config = getTierConfig("standard");
        expect(config.publicSubnets).toBe(1);
        expect(config.privateSubnets).toBe(1);
        expect(config.controlPlaneSubnets).toBe(1);
        expect(config.publicSubnetSize).toBe(25); // /25 = 128 addresses
        expect(config.privateSubnetSize).toBe(24); // /24 = 256 addresses
        expect(config.podsPrefix).toBe(16); // /16 for pods
        expect(config.servicesPrefix).toBe(20);
        expect(config.minVpcPrefix).toBe(23); // /23 minimum VPC
      });

      it("should have professional tier with correct configuration", () => {
        const config = getTierConfig("professional");
        expect(config.publicSubnets).toBe(2);
        expect(config.privateSubnets).toBe(2);
        expect(config.controlPlaneSubnets).toBe(1); // one control-plane network
        expect(config.publicSubnetSize).toBe(25); // /25 = 128 addresses (for NAT, LB)
        expect(config.privateSubnetSize).toBe(23); // /23 = 512 addresses (for nodes)
        expect(config.podsPrefix).toBe(18); // /18 = 16,384 IPs (64 nodes at a /24 each)
        expect(config.servicesPrefix).toBe(20);
        expect(config.minVpcPrefix).toBe(21); // /21 minimum VPC
      });

      it("should have enterprise tier with correct configuration", () => {
        const config = getTierConfig("enterprise");
        expect(config.publicSubnets).toBe(3);
        expect(config.privateSubnets).toBe(3);
        expect(config.controlPlaneSubnets).toBe(1); // one control-plane network
        expect(config.publicSubnetSize).toBe(24); // /24 = 256 addresses
        expect(config.privateSubnetSize).toBe(21); // /21 = 2,048 addresses
        expect(config.podsPrefix).toBe(16);
        expect(config.servicesPrefix).toBe(20);
        // 3 x /21 node subnets aligned after the public /24s end at 8,192 addresses: a /19
        expect(config.minVpcPrefix).toBe(19);
      });

      it("should have hyperscale tier with correct configuration", () => {
        const config = getTierConfig("hyperscale");
        // Realistic hyperscale: 3 AZs (most cloud regions have 3-6 AZs)
        expect(config.publicSubnets).toBe(3);
        expect(config.privateSubnets).toBe(3);
        expect(config.controlPlaneSubnets).toBe(1); // one control-plane network
        expect(config.publicSubnetSize).toBe(23); // /23 = 512 addresses (for NAT, LB)
        expect(config.privateSubnetSize).toBe(20); // /20 = 4,096 addresses (for nodes)
        expect(config.podsPrefix).toBe(13); // /13 = 2,048 nodes at a /24 each
        expect(config.servicesPrefix).toBe(18); // /18 = 16,384 ClusterIPs (> 10,000 tested limit)
        expect(config.minVpcPrefix).toBe(18); // /18 minimum VPC
      });

      it("should give EKS at least two subnets of every type in every tier", () => {
        for (const size of ["micro", "standard", "professional", "enterprise", "hyperscale"] as const) {
          const config = getTierConfig(size, "eks");
          expect(config.publicSubnets).toBeGreaterThanOrEqual(2);
          expect(config.privateSubnets).toBeGreaterThanOrEqual(2);
          expect(config.controlPlaneSubnets).toBe(2); // EKS minimum: one /27 across two AZs
        }
        // Two AZs cost a larger VPC for the single-AZ tiers
        expect(getTierConfig("micro", "eks").minVpcPrefix).toBe(23);
        expect(getTierConfig("standard", "eks").minVpcPrefix).toBe(22);
      });

      it("should give GKE and AKS a single regional control-plane range", () => {
        for (const provider of ["gke", "aks"] as const) {
          for (const size of ["micro", "standard", "professional", "enterprise", "hyperscale"] as const) {
            expect(getTierConfig(size, provider).controlPlaneSubnets).toBe(1);
          }
        }
      });
    });
  });

  describe("Node Subnet Capacity", () => {
    // Node subnet prefix of each tier, and the most nodes one subnet must hold
    // (hyperscale spreads 5,000 nodes over 3 subnets on EKS and AKS)
    const NODE_SUBNETS = {
      micro: { prefix: 25, nodesPerSubnet: 1 },
      standard: { prefix: 24, nodesPerSubnet: 3 },
      professional: { prefix: 23, nodesPerSubnet: 10 },
      enterprise: { prefix: 21, nodesPerSubnet: 50 },
      hyperscale: { prefix: 20, nodesPerSubnet: 1667 },
    } as const;

    for (const [tier, { prefix, nodesPerSubnet }] of Object.entries(NODE_SUBNETS)) {
      it(`gives each ${tier} node subnet a /${prefix} with room for its nodes on EKS, AKS and GKE`, () => {
        for (const provider of CLOUD_PROVIDERS) {
          const config = getTierConfig(tier as keyof typeof NODE_SUBNETS, provider);
          expect(config.privateSubnetSize, provider).toBe(prefix);
          expect(usableAddresses(config.privateSubnetSize, provider), provider).toBeGreaterThanOrEqual(nodesPerSubnet);
        }
      });
    }

    it("counts 5 reserved addresses per subnet for AWS and Azure, 4 for Google Cloud", () => {
      expect(usableAddresses(20, "eks")).toBe(4091);
      expect(usableAddresses(20, "aks")).toBe(4091);
      expect(usableAddresses(20, "gke")).toBe(4092);
      expect(usableAddresses(24, "aks")).toBe(251); // Microsoft: a /24 leaves 251 usable
      expect(usableAddresses(25, "eks")).toBe(123);
    });
  });

  describe("GKE Pod CIDR Formula Validation", () => {
    /**
     * From GKE_COMPLIANCE_AUDIT.md Section 2:
     * M = 31 - ceil(log2(Q))  where Q = max pods per node
     * HM = 32 - M
     * HD = 32 - DS (pod subnet prefix)
     * MN = 2^(HD - HM) (max nodes)
     * MP = MN * Q (max pods)
     */
    describe("GKE Node Capacity from Pod CIDR (110 pods per node: a /24 each)", () => {
      it("derives a /24 per node at 65-128 max pods, and a /26 at 32", () => {
        expect(gkeNodeRangeBits(110)).toBe(8);
        expect(gkeNodeRangeBits(65)).toBe(8);
        expect(gkeNodeRangeBits(128)).toBe(8);
        expect(gkeNodeRangeBits(32)).toBe(6);
      });

      it("holds 2,048 nodes in the hyperscale /13 pod range", () => {
        expect(gkeMaxNodes(getTierConfig("hyperscale", "gke").podsPrefix, 110)).toBe(2048);
      });

      it("holds 256 nodes in the enterprise /16 pod range", () => {
        expect(gkeMaxNodes(getTierConfig("enterprise", "gke").podsPrefix, 110)).toBe(256);
      });

      it("holds 16 nodes in the micro /20 pod range", () => {
        expect(gkeMaxNodes(getTierConfig("micro", "gke").podsPrefix, 110)).toBe(16);
      });
    });

    describe("GKE Max Pods (nodes x max pods per node)", () => {
      it("gives hyperscale 225,280 pods at 110 per node", () => {
        expect(gkeMaxNodes(getTierConfig("hyperscale", "gke").podsPrefix, 110) * 110).toBe(225280);
      });

      it("gives enterprise 28,160 pods at 110 per node, above its 50-node x 110 need", () => {
        const pods = gkeMaxNodes(getTierConfig("enterprise", "gke").podsPrefix, 110) * 110;
        expect(pods).toBe(28160);
        expect(pods).toBeGreaterThanOrEqual(50 * 110);
      });
    });

    describe("GKE Autopilot (32 pods per node: a /26 each)", () => {
      it("holds 8,192 nodes and 262,144 pods in the hyperscale /13 pod range", () => {
        const nodes = gkeMaxNodes(getTierConfig("hyperscale", "gke").podsPrefix, 32);
        expect(nodes).toBe(8192);
        expect(nodes * 32).toBe(262144);
        // So Autopilot reaches 5,000 nodes in the default /13; Standard at 110 pods does not
        expect(nodes).toBeGreaterThanOrEqual(5000);
      });
    });
  });

  describe("Service CIDR Validation", () => {
    /**
     * From all compliance audits:
     * - AWS/GKE/AKS minimum: /20 (4,096 services); GKE's own default is a /20
     * - Our implementation: /20 for every tier except hyperscale, which gets /18
     *   (16,384 > Kubernetes' tested limit of 10,000 services per cluster)
     * - Allowed overrides: /13 to /24 (EKS allows /12-/24, AKS requires smaller than /12)
     */
    describe("Service CIDR Sizing", () => {
      it("should provide at least /20 equivalent capacity for all tiers", () => {
        const minServicesRecommended = Math.pow(2, 32 - 20); // 4,096

        Object.entries(DEPLOYMENT_TIER_CONFIGS).forEach(([tier, config]) => {
          const serviceCapacity = calculateTotalAddresses(config.servicesPrefix);
          expect(serviceCapacity).toBeGreaterThanOrEqual(minServicesRecommended);
        });
      });

      it("should right-size service CIDRs: /20, or /18 for hyperscale", () => {
        Object.entries(DEPLOYMENT_TIER_CONFIGS).forEach(([tier, config]) => {
          expect(config.servicesPrefix).toBe(tier === "hyperscale" ? 18 : 20);
          // Within every provider's limits
          expect(config.servicesPrefix).toBeGreaterThanOrEqual(13);
          expect(config.servicesPrefix).toBeLessThanOrEqual(24);
        });
        expect(calculateTotalAddresses(DEPLOYMENT_TIER_CONFIGS.hyperscale.servicesPrefix)).toBeGreaterThan(10000);
      });
    });
  });

  describe("Pod CIDR Space Validation", () => {
    /**
     * From IP_ALLOCATION_CROSS_REFERENCE.md:
     * Pod space must accommodate: nodes * pods_per_node
     */
    describe("Pod Space Capacity", () => {
      it("should size the hyperscale /13 pod range for 2,048 nodes at a /24 per node (not 5,000)", () => {
        const config = DEPLOYMENT_TIER_CONFIGS["hyperscale"];
        const podAddresses = calculateTotalAddresses(config.podsPrefix);
        const addressesPerNode = calculateTotalAddresses(24); // /24 per node (AKS overlay, GKE at 65-128 max pods)

        // /13 = 524,288 addresses = 2,048 node blocks
        expect(podAddresses).toBe(524288);
        expect(podAddresses / addressesPerNode).toBe(2048);

        // The tier's 5,000-node ceiling does not fit: it needs 5,000 * 256 = 1,280,000 addresses
        const requiredFor5000Nodes = 5000 * addressesPerNode;
        expect(podAddresses).toBeLessThan(requiredFor5000Nodes);
        // ...so it needs a /11 (2,097,152); a /12 (1,048,576) is still short
        expect(calculateTotalAddresses(12)).toBeLessThan(requiredFor5000Nodes);
        expect(calculateTotalAddresses(11)).toBeGreaterThanOrEqual(requiredFor5000Nodes);
      });

      it("should accept a /11 podsCidr override for a 5,000-node hyperscale cluster", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "hyperscale",
          vpcCidr: "10.0.0.0/18",
          podsCidr: "100.64.0.0/11",
        });

        expect(plan.pods.cidr).toBe("100.64.0.0/11");
        expect(calculateTotalAddresses(11) / calculateTotalAddresses(24)).toBeGreaterThanOrEqual(5000);
      });

      it("should have sufficient pod space for enterprise tier (50 nodes, 110 pods)", () => {
        const config = DEPLOYMENT_TIER_CONFIGS["enterprise"];
        const podAddresses = calculateTotalAddresses(config.podsPrefix);
        const maxNodes = 50;
        const podsPerNode = 110;
        const requiredPodIPs = maxNodes * podsPerNode; // 5,500

        // /16 = 65,536 addresses
        expect(podAddresses).toBe(65536);
        expect(podAddresses).toBeGreaterThanOrEqual(requiredPodIPs);
      });

      it("should have sufficient pod space for professional tier (10 nodes, 110 pods)", () => {
        const config = DEPLOYMENT_TIER_CONFIGS["professional"];
        const podAddresses = calculateTotalAddresses(config.podsPrefix);
        const maxNodes = 10;
        const podsPerNode = 110;
        const requiredPodIPs = maxNodes * podsPerNode; // 1,100

        // /18 = 16,384 addresses (right-sized per formula)
        expect(podAddresses).toBe(16384);
        expect(podAddresses).toBeGreaterThanOrEqual(requiredPodIPs);
      });
    });
  });

  describe("Availability Zone Distribution Validation", () => {
    /**
     * From all compliance audits:
     * - Professional: 2 AZs (dual-AZ ready)
     * - Enterprise: 3 AZs (triple-AZ ready)
     * - Hyperscale: 3 AZs (most regions have at least 3)
     */
    describe("AZ Count by Tier", () => {
      it("should generate dual-AZ for professional tier", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "professional",
          provider: "eks",
          vpcCidr: "10.0.0.0/16",
        });

        const uniqueAZs = new Set(
          plan.subnets.private.map((s) => s.availabilityZone)
        );
        expect(uniqueAZs.size).toBe(2);
      });

      it("should generate triple-AZ for enterprise tier", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise",
          provider: "eks",
          vpcCidr: "10.0.0.0/16",
        });

        const uniqueAZs = new Set(
          plan.subnets.private.map((s) => s.availabilityZone)
        );
        expect(uniqueAZs.size).toBe(3);
      });

      it("should generate 3-AZ for hyperscale tier (realistic for most regions)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "hyperscale",
          provider: "eks",
          vpcCidr: "10.0.0.0/18", // Realistic hyperscale: /18 VPC (user example)
        });

        const uniqueAZs = new Set(
          plan.subnets.private.map((s) => s.availabilityZone)
        );
        // Realistic hyperscale: 3 AZs (most cloud regions have 3-6 AZs)
        expect(uniqueAZs.size).toBe(3);
      });
    });
  });

  describe("Subnet Overlap Prevention", () => {
    /**
     * From all compliance audits:
     * - Public and private subnets must NOT overlap
     * - Calculation: Private subnets start AFTER public subnets
     */
    describe("Non-Overlapping Subnets", () => {
      // Updated VPC sizes to match realistic tier configurations with minVpcPrefix
      const tierVpcMap = {
        micro: "10.0.0.0/24",       // /24 min for micro
        standard: "10.0.0.0/23",    // /23 min for standard
        professional: "10.0.0.0/21", // /21 min for professional
        enterprise: "10.0.0.0/18",  // /18 min for enterprise
        hyperscale: "10.0.0.0/18",  // /18 min for hyperscale (realistic)
      } as const;

      (Object.keys(tierVpcMap) as (keyof typeof tierVpcMap)[]).forEach((tier) => {
        it(`should generate non-overlapping subnets for ${tier} tier`, async () => {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: tier,
            vpcCidr: tierVpcMap[tier],
          });

          const allSubnets = [
            ...plan.subnets.public,
            ...plan.subnets.private,
          ];

          // Check all pairs of subnets for overlap
          for (let i = 0; i < allSubnets.length; i++) {
            for (let j = i + 1; j < allSubnets.length; j++) {
              const range1 = cidrToRange(allSubnets[i].cidr);
              const range2 = cidrToRange(allSubnets[j].cidr);

              const overlaps =
                range1.start <= range2.end && range1.end >= range2.start;

              expect(overlaps).toBe(false);
            }
          }
        });
      });
    });

    describe("Subnets Within VPC CIDR", () => {
      // Updated VPC sizes to match realistic tier configurations with minVpcPrefix
      const tierVpcMap = {
        micro: "10.0.0.0/24",       // /24 min for micro
        standard: "10.0.0.0/23",    // /23 min for standard
        professional: "10.0.0.0/21", // /21 min for professional
        enterprise: "10.0.0.0/18",  // /18 min for enterprise
        hyperscale: "10.0.0.0/18",  // /18 min for hyperscale (realistic)
      } as const;

      (Object.keys(tierVpcMap) as (keyof typeof tierVpcMap)[]).forEach((tier) => {
        it(`should generate subnets within VPC CIDR for ${tier} tier`, async () => {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: tier,
            vpcCidr: tierVpcMap[tier],
          });

          const vpcRange = cidrToRange(plan.vpc.cidr);
          const allSubnets = [
            ...plan.subnets.public,
            ...plan.subnets.private,
          ];

          allSubnets.forEach((subnet) => {
            const subnetRange = cidrToRange(subnet.cidr);
            expect(subnetRange.start).toBeGreaterThanOrEqual(vpcRange.start);
            expect(subnetRange.end).toBeLessThanOrEqual(vpcRange.end);
          });
        });
      });
    });

    describe("Hyperscale VPC Size Requirement", () => {
      /**
       * UPDATED: Realistic hyperscale tier now uses /18 VPC
       * - 3 public + 3 private = 6 subnets (realistic for most cloud regions)
       * - Public subnets: /23 = 512 addresses each (1,536 total)
       * - Private subnets: /20 = 4,096 addresses each (12,288 total)
       * - Total needed: 13,824 addresses
       * - /18 VPC has 16,384 addresses (sufficient, matches user example)
       */
      it("fits a hyperscale plan in a /18 VPC for every provider and network mode", async () => {
        for (const provider of ["eks", "gke", "aks", "kubernetes"] as const) {
          for (const networkMode of ["public", "private"] as const) {
            const plan = await generateKubernetesNetworkPlan({
              deploymentSize: "hyperscale", provider, networkMode, vpcCidr: "10.0.0.0/18",
            });
            expect(plan.vpc.cidr).toBe("10.0.0.0/18");
            expect(getTierConfig("hyperscale", provider, networkMode).minVpcPrefix).toBeGreaterThanOrEqual(18);
          }
        }
      });

      it("should report a minimum VPC prefix that is exact for every tier and provider", async () => {
        // The reported minimum must fit, and one prefix smaller (half the space) must not
        for (const provider of ["eks", "gke", "aks", "kubernetes"] as const) {
          for (const size of ["micro", "standard", "professional", "enterprise", "hyperscale"] as const) {
            const { minVpcPrefix } = getTierConfig(size, provider);
            await expect(generateKubernetesNetworkPlan({
              deploymentSize: size, provider, vpcCidr: `10.0.0.0/${minVpcPrefix}`,
            })).resolves.toBeDefined();
            await expect(generateKubernetesNetworkPlan({
              deploymentSize: size, provider, vpcCidr: `10.0.0.0/${minVpcPrefix + 1}`,
            })).rejects.toThrow(/too small/);
          }
        }
      });
    });
  });

  describe("EKS-Specific Compliance", () => {
    /**
     * From EKS_COMPLIANCE_AUDIT.md:
     * - VPC CNI: Pods and Nodes share VPC CIDR (IP exhaustion risk)
     * - Hyperscale uses /20 private subnets (4,096 IPs) for high pod density
     * - IP Prefix Delegation requires Nitro instances
     */
    describe("EKS Subnet Sizing for VPC CNI", () => {
      it("should have /20 private subnets for hyperscale (high pod density support)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "hyperscale",
          provider: "eks",
          vpcCidr: "10.0.0.0/18", // Realistic hyperscale: /18 VPC
        });

        plan.subnets.private.forEach((subnet) => {
          const prefix = parseInt(subnet.cidr.split("/")[1], 10);
          expect(prefix).toBe(20); // /20 = 4,096 IPs per subnet (realistic)
        });
      });

      it("gives each hyperscale EKS node subnet 4,091 usable addresses (AWS reserves 5)", () => {
        const config = getTierConfig("hyperscale", "eks");
        expect(usableAddresses(config.privateSubnetSize, "eks")).toBe(4091);
        // Three /20 node subnets: 12,273 usable addresses for nodes (and VPC CNI pods)
        expect(config.privateSubnets * usableAddresses(config.privateSubnetSize, "eks")).toBe(12273);
      });
    });

    describe("EKS Availability Zone Assignment", () => {
      it("should use AWS-style AZ naming for EKS", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise",
          provider: "eks",
          vpcCidr: "10.0.0.0/16",
        });

        // EKS AZs use format: {region}{letter} (e.g., us-east-1a)
        plan.subnets.public.forEach((subnet) => {
          expect(subnet.availabilityZone).toMatch(/^us-east-1[a-h]$/);
        });
      });
    });
  });

  describe("GKE-Specific Compliance", () => {
    /**
     * From GKE_COMPLIANCE_AUDIT.md:
     * - Alias IP ranges: Pods use separate secondary ranges
     * - Each node gets /24 alias range (256 addresses)
     * - Google manages alias IP allocation
     */
    describe("GKE Zone Assignment", () => {
      it("should not assign zones to GKE subnets (GCP subnets are regional)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise",
          provider: "gke",
          vpcCidr: "10.0.0.0/16",
        });

        // Zones belong to node pools (node_locations), not subnets
        [...plan.subnets.public, ...plan.subnets.private, ...plan.subnets.controlPlane].forEach((subnet) => {
          expect(subnet).not.toHaveProperty("availabilityZone");
        });
      });
    });

  });

  describe("AKS-Specific Compliance", () => {
    /**
     * From AKS_COMPLIANCE_AUDIT.md:
     * - CNI Overlay: Pods use overlay CIDR (separate from VNet)
     * - Max 200,000 pods per cluster
     * - Max 5,000 nodes per cluster
     * - Max 1,000 nodes per node pool (need 5 pools for 5,000 nodes)
     */
    describe("AKS Zone Assignment", () => {
      it("should not assign zones to AKS subnets (Azure subnets are regional)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "enterprise",
          provider: "aks",
          vpcCidr: "10.0.0.0/16",
        });

        // Zones (1, 2, 3) belong to node pools, not subnets
        [...plan.subnets.public, ...plan.subnets.private, ...plan.subnets.controlPlane].forEach((subnet) => {
          expect(subnet).not.toHaveProperty("availabilityZone");
        });
      });
    });

    describe("AKS CNI Overlay Capacity", () => {
      it("should hold 2,048 overlay nodes in the /13 pod CIDR (a /24 per node)", () => {
        const config = DEPLOYMENT_TIER_CONFIGS["hyperscale"];
        const podAddresses = calculateTotalAddresses(config.podsPrefix);

        // AKS overlay always reserves a /24 per node: /13 = 524,288 addresses = 2,048 nodes
        expect(podAddresses).toBe(524288);
        const overlayNodes = podAddresses / calculateTotalAddresses(24);
        expect(overlayNodes).toBe(2048);
        // That is below AKS's 5,000-node cluster maximum; a 5,000-node cluster needs a /11 podsCidr
        expect(overlayNodes).toBeLessThan(5000);
        // At 110 pods per node, 2,048 nodes still reach AKS's 200,000 pods-per-cluster cap
        expect(overlayNodes * 110).toBeGreaterThanOrEqual(200000);
      });

      it("gives hyperscale AKS node subnets room for 5,000 nodes (Azure reserves 5 per subnet)", () => {
        const config = getTierConfig("hyperscale", "aks");
        expect(usableAddresses(config.privateSubnetSize, "aks")).toBe(4091);
        // Three /20 node subnets (one per node pool group): 12,273 node addresses
        expect(config.privateSubnets * usableAddresses(config.privateSubnetSize, "aks")).toBeGreaterThanOrEqual(5000);
      });
    });
  });

  describe("RFC 1918 Compliance", () => {
    /**
     * From all compliance audits:
     * - All VPC CIDRs MUST use private RFC 1918 ranges
     * - Public IPs are rejected with security guidance
     */
    describe("RFC 1918 Range Validation", () => {
      it("should accept all Class A private ranges (10.x.x.x)", async () => {
        const ranges = ["10.0.0.0/16", "10.100.0.0/16", "10.255.0.0/16"];
        for (const range of ranges) {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: range,
          });
          expect(plan.vpc.cidr).toBe(range);
        }
      });

      it("should accept all Class B private ranges (172.16-31.x.x)", async () => {
        const ranges = ["172.16.0.0/16", "172.20.0.0/16", "172.31.0.0/16"];
        for (const range of ranges) {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: "standard",
            vpcCidr: range,
          });
          expect(plan.vpc.cidr).toBe(range);
        }
      });

      it("should accept Class C private range (192.168.x.x)", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "standard",
          vpcCidr: "192.168.0.0/16",
        });
        expect(plan.vpc.cidr).toBe("192.168.0.0/16");
      });

      it("should reject public IP ranges with security error", async () => {
        const publicRanges = ["8.8.8.0/24", "1.1.1.0/24", "200.0.0.0/16"];
        for (const range of publicRanges) {
          await expect(
            generateKubernetesNetworkPlan({
              deploymentSize: "standard",
              vpcCidr: range,
            })
          ).rejects.toThrow(KubernetesNetworkGenerationError);
        }
      });
    });
  });

  describe("Cross-Provider IP Consumption Comparison", () => {
    /**
     * From IP_ALLOCATION_CROSS_REFERENCE.md:
     * - EKS: Pods and Nodes share VPC CIDR (HIGH IP exhaustion risk)
     * - GKE: Pods use alias ranges (LOW risk, Google manages)
     * - AKS: Pods use overlay CIDR (NO risk, completely separate)
     */
    describe("Provider-Specific Network Plans", () => {
      const providers = ["eks", "gke", "aks", "kubernetes"] as const;

      providers.forEach((provider) => {
        it(`should generate valid network plan for ${provider}`, async () => {
          const plan = await generateKubernetesNetworkPlan({
            deploymentSize: "hyperscale",
            provider,
            vpcCidr: "10.0.0.0/18", // Realistic hyperscale: /18 VPC
          });

          expect(plan.provider).toBe(provider === "kubernetes" ? "kubernetes" : provider);
          expect(plan.subnets.public).toHaveLength(3); // 3 AZs for hyperscale
          expect(plan.subnets.private).toHaveLength(3);
          expect(plan.pods.cidr).toBeDefined();
          expect(plan.services.cidr).toBeDefined();
        });
      });
    });

    describe("IP Space Summary for Hyperscale (5,000 nodes)", () => {
      it("should calculate correct VPC/VNet IP consumption", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "hyperscale",
          vpcCidr: "10.0.0.0/18", // Realistic hyperscale: /18 VPC
        });

        // Realistic hyperscale: 3 AZs with differentiated subnet sizes
        // Total public subnet IPs: 3 * 2^(32-23) = 3 * 512 = 1,536
        // Total private subnet IPs: 3 * 2^(32-20) = 3 * 4,096 = 12,288
        const publicIPs = plan.subnets.public.reduce((sum, s) => {
          const prefix = parseInt(s.cidr.split("/")[1], 10);
          return sum + Math.pow(2, 32 - prefix);
        }, 0);

        const privateIPs = plan.subnets.private.reduce((sum, s) => {
          const prefix = parseInt(s.cidr.split("/")[1], 10);
          return sum + Math.pow(2, 32 - prefix);
        }, 0);

        expect(publicIPs).toBe(1536);  // 3 * 512 (/23 subnets)
        expect(privateIPs).toBe(12288); // 3 * 4096 (/20 subnets)
      });

      it("should calculate correct Pod CIDR capacity", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "hyperscale",
          vpcCidr: "10.0.0.0/18", // Realistic hyperscale: /18 VPC
        });

        const podPrefix = parseInt(plan.pods.cidr.split("/")[1], 10);
        const podCapacity = Math.pow(2, 32 - podPrefix);

        // /13 = 524,288 pod IPs: 2,048 nodes at a /24 each (AKS overlay, GKE at 65-128 max pods)
        expect(podCapacity).toBe(524288);
      });

      it("should calculate correct Service CIDR capacity", async () => {
        const plan = await generateKubernetesNetworkPlan({
          deploymentSize: "hyperscale",
          vpcCidr: "10.0.0.0/18", // Realistic hyperscale: /18 VPC
        });

        const servicePrefix = parseInt(plan.services.cidr.split("/")[1], 10);
        const serviceCapacity = Math.pow(2, 32 - servicePrefix);

        // /18 = 16,384 service IPs (above Kubernetes' tested limit of 10,000 services)
        expect(serviceCapacity).toBe(16384);
      });
    });
  });
});
