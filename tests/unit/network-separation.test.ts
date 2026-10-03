/**
 * tests/unit/network-separation.test.ts
 *
 * Property tests for the allocation rules every plan must satisfy, for every tier
 * and provider:
 * - Nodes, control plane, and public subnets inside the VPC; pods and services
 *   outside it, each in its own block (RFC 1918, or 100.64.0.0/10 for pods when no
 *   RFC 1918 block has room)
 * - No two ranges overlap, and every CIDR is canonical
 * - Generated pod and service ranges avoid reserved ranges (172.17.0.0/16, and for
 *   AKS 172.30.0.0/16 and 172.31.0.0/16, which AKS also refuses for the VNet)
 * - EKS spreads every subnet type across at least two AZs; GKE and AKS subnets
 *   are regional (no zone)
 * - The control plane is one network (EKS: one /27 split across two AZs)
 * - Private mode has no public subnets, only internal load-balancer subnets
 * Plus caller overrides (podsCidr, servicesCidr, availabilityZones) and warnings.
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildKubernetesNetworkPlan,
  getDeploymentTierInfo,
  getTierConfig,
  KubernetesNetworkGenerationError
} from "@/lib/kubernetes-network-generator";
import { parseCidr, numberToIp } from "@/lib/subnet-utils";
import type { KubernetesNetworkPlan } from "@shared/kubernetes-schema";

const TIERS = ["micro", "standard", "professional", "enterprise", "hyperscale"] as const;
const PROVIDERS = ["eks", "gke", "aks", "kubernetes"] as const;
const MODES = ["public", "private"] as const;
const PROVIDER_NAMES = { eks: "EKS", gke: "GKE", aks: "AKS", kubernetes: "generic Kubernetes" } as const;
const RFC1918 = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
const RFC6598 = "100.64.0.0/10";
// Microsoft, "CNI networking prerequisites": AKS rejects pod, service, and cluster
// virtual network ranges overlapping these
const AKS_RESERVED = ["172.30.0.0/16", "172.31.0.0/16"];

const range = (cidr: string) => {
  const { network, prefix } = parseCidr(cidr);
  return { start: network, end: network + 2 ** (32 - prefix) - 1, prefix };
};
const overlaps = (a: string, b: string) => {
  const x = range(a), y = range(b);
  return x.start <= y.end && y.start <= x.end;
};
const within = (outer: string, inner: string) => {
  const o = range(outer), i = range(inner);
  return i.start >= o.start && i.end <= o.end;
};
const blockOf = (cidr: string) => [...RFC1918, RFC6598].find((b) => within(b, cidr));
const canonical = (cidr: string) => {
  const { network, prefix } = parseCidr(cidr);
  return `${numberToIp(network)}/${prefix}` === cidr;
};

/** Assert every separation invariant on a plan */
function assertSeparated(plan: KubernetesNetworkPlan) {
  const subnets = [...plan.subnets.public, ...plan.subnets.loadBalancer, ...plan.subnets.private, ...plan.subnets.controlPlane];
  const all = [...subnets.map((s) => s.cidr), plan.pods.cidr, plan.services.cidr];

  for (const cidr of [plan.vpc.cidr, ...all]) expect(canonical(cidr), cidr).toBe(true);
  for (const s of subnets) expect(within(plan.vpc.cidr, s.cidr), `${s.name} inside VPC`).toBe(true);
  for (const r of [plan.pods.cidr, plan.services.cidr]) {
    expect(overlaps(plan.vpc.cidr, r), `${r} outside VPC`).toBe(false);
    expect(overlaps("172.17.0.0/16", r), `${r} avoids 172.17.0.0/16`).toBe(false);
  }
  if (plan.provider === "aks") {
    for (const r of [plan.vpc.cidr, plan.pods.cidr, plan.services.cidr]) {
      for (const reserved of AKS_RESERVED) expect(overlaps(reserved, r), `${r} avoids ${reserved} (AKS)`).toBe(false);
    }
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      expect(overlaps(all[i], all[j]), `${all[i]} vs ${all[j]}`).toBe(false);
    }
  }
  for (const s of plan.subnets.controlPlane) {
    expect(s.cidr.endsWith("/28")).toBe(true);
    expect(s.type).toBe("control-plane");
  }
}

describe("Network separation (every tier x provider)", () => {
  const vpcs = ["10.20.0.0/16", "172.20.0.0/16", "192.168.0.0/16"];

  for (const provider of PROVIDERS) {
    for (const size of TIERS) {
      for (const networkMode of MODES) {
        it(`${provider} ${size} ${networkMode}: pods, services, nodes, and control plane are separated`, () => {
          for (const vpcCidr of vpcs) {
            const plan = buildKubernetesNetworkPlan({ deploymentSize: size, provider, networkMode, vpcCidr });
            expect(plan.networkMode).toBe(networkMode);
            assertSeparated(plan);

            // VPC, pods, and services each occupy a different block
            const blocks = [blockOf(plan.vpc.cidr), blockOf(plan.pods.cidr), blockOf(plan.services.cidr)];
            expect(new Set(blocks).size).toBe(3);

            // Counts match the published tier layout for this provider
            const tier = getTierConfig(size, provider, networkMode);
            expect(plan.subnets.public).toHaveLength(tier.publicSubnets);
            expect(plan.subnets.loadBalancer).toHaveLength(tier.loadBalancerSubnets);
            expect(plan.subnets.private).toHaveLength(tier.privateSubnets);
            expect(plan.subnets.controlPlane).toHaveLength(tier.controlPlaneSubnets);
            expect(plan.pods.cidr.endsWith(`/${tier.podsPrefix}`)).toBe(true);
            expect(plan.services.cidr.endsWith(`/${tier.servicesPrefix}`)).toBe(true);
          }
        });
      }
    }
  }

  it("generates only private /18 VPCs clear of reserved ranges, at the edges of every block", () => {
    // Drive randomVpc's two Math.random calls (block, then slot) through the first,
    // middle and last slot of each RFC 1918 block, for every provider
    const spy = vi.spyOn(Math, "random");
    try {
      for (const provider of PROVIDERS) {
        for (let block = 0; block < 3; block++) {
          for (const slot of [0, 0.5, 0.999999]) {
            spy.mockReturnValueOnce((block + 0.5) / 3).mockReturnValueOnce(slot);
            const plan = buildKubernetesNetworkPlan({ deploymentSize: "micro", provider });
            expect(plan.vpc.cidr.endsWith("/18")).toBe(true);
            expect(RFC1918.some((b) => within(b, plan.vpc.cidr)), `${provider} ${plan.vpc.cidr} is RFC 1918`).toBe(true);
            expect(blockOf(plan.vpc.cidr)).toBe(RFC1918[block]);
            assertSeparated(plan);
            expect(plan.warnings, plan.vpc.cidr).toBeUndefined();
          }
        }
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("holds for 2,000 random auto-generated VPCs", () => {
    for (let i = 0; i < 2000; i++) {
      const plan = buildKubernetesNetworkPlan({
        deploymentSize: TIERS[i % TIERS.length],
        provider: PROVIDERS[i % PROVIDERS.length],
        networkMode: MODES[Math.floor(i / 20) % MODES.length],
      });
      assertSeparated(plan);
      expect(plan.vpc.cidr.endsWith("/18")).toBe(true);
      expect(RFC1918.some((block) => within(block, plan.vpc.cidr)), plan.vpc.cidr).toBe(true);
      expect(overlaps(plan.vpc.cidr, "172.17.0.0/16")).toBe(false);
      expect(plan.warnings).toBeUndefined();
    }
  });
});

describe("Control plane is one network", () => {
  for (const networkMode of MODES) {
    it(`gives GKE, AKS, and generic a single /28 (${networkMode})`, () => {
      for (const provider of ["gke", "aks", "kubernetes"] as const) {
        for (const size of TIERS) {
          const { controlPlane } = buildKubernetesNetworkPlan({ deploymentSize: size, provider, networkMode, vpcCidr: "10.0.0.0/16" }).subnets;
          expect(controlPlane).toHaveLength(1);
          expect(controlPlane[0].cidr.endsWith("/28")).toBe(true);
        }
      }
    });

    it(`gives EKS one /27 split into two /28s in two AZs (${networkMode})`, () => {
      for (const size of TIERS) {
        const { controlPlane } = buildKubernetesNetworkPlan({ deploymentSize: size, provider: "eks", networkMode, vpcCidr: "10.0.0.0/16" }).subnets;
        expect(controlPlane).toHaveLength(2);
        const [first, second] = controlPlane.map((s) => range(s.cidr));
        expect(first.start % 32).toBe(0);         // the pair starts on a /27 boundary
        expect(second.start).toBe(first.end + 1); // and is contiguous
        expect(new Set(controlPlane.map((s) => s.availabilityZone)).size).toBe(2);
      }
    });
  }
});

describe("Private network mode", () => {
  const privatePlan = (provider: (typeof PROVIDERS)[number], size: (typeof TIERS)[number] = "enterprise") =>
    buildKubernetesNetworkPlan({ deploymentSize: size, provider, networkMode: "private", vpcCidr: "10.0.0.0/16" });

  it("has no public subnets for any provider or tier", () => {
    for (const provider of PROVIDERS) {
      for (const size of TIERS) {
        const plan = privatePlan(provider, size);
        expect(plan.subnets.public).toEqual([]);
        expect(plan.subnets.loadBalancer.length).toBeGreaterThan(0);
        for (const s of plan.subnets.loadBalancer) expect(s.type).toBe("load-balancer");
      }
    }
  });

  it("gives GKE one regional proxy-only-sized subnet (/26 to /23)", () => {
    for (const size of TIERS) {
      const lb = privatePlan("gke", size).subnets.loadBalancer;
      expect(lb).toHaveLength(1); // one active proxy-only subnet per region and network
      expect(lb[0]).not.toHaveProperty("availabilityZone");
      const prefix = range(lb[0].cidr).prefix;
      expect(prefix).toBeGreaterThanOrEqual(23);
      expect(prefix).toBeLessThanOrEqual(26);
    }
  });

  it("gives AKS one regional internal load-balancer subnet", () => {
    const lb = privatePlan("aks").subnets.loadBalancer;
    expect(lb).toHaveLength(1);
    expect(lb[0]).not.toHaveProperty("availabilityZone");
  });

  it("gives EKS internal load-balancer subnets in at least two AZs (ALB requirement)", () => {
    for (const size of TIERS) {
      const lb = privatePlan("eks", size).subnets.loadBalancer;
      expect(new Set(lb.map((s) => s.availabilityZone)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("leaves loadBalancer empty in public mode", () => {
    for (const provider of PROVIDERS) {
      expect(buildKubernetesNetworkPlan({ deploymentSize: "micro", provider, vpcCidr: "10.0.0.0/16" }).subnets.loadBalancer).toEqual([]);
    }
  });

  it("publishes private-mode tier layouts", () => {
    const tiers = getDeploymentTierInfo(undefined, "gke", "private") as Record<string, { publicSubnets: number; loadBalancerSubnets: number; networkMode: string }>;
    for (const size of TIERS) {
      expect(tiers[size].networkMode).toBe("private");
      expect(tiers[size].publicSubnets).toBe(0);
      expect(tiers[size].loadBalancerSubnets).toBe(1);
    }
  });

  it("rejects an unknown network mode", () => {
    expect(() => buildKubernetesNetworkPlan({ deploymentSize: "micro", networkMode: "isolated" })).toThrow();
  });
});

describe("Zones", () => {
  it("EKS spreads node, public, and control-plane subnets across at least two AZs in every tier", () => {
    for (const size of TIERS) {
      const plan = buildKubernetesNetworkPlan({ deploymentSize: size, provider: "eks", vpcCidr: "10.0.0.0/16" });
      for (const subnets of [plan.subnets.public, plan.subnets.private, plan.subnets.controlPlane]) {
        expect(new Set(subnets.map((s) => s.availabilityZone)).size).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("EKS micro gets two of each subnet type in us-east-1a and us-east-1b", () => {
    const plan = buildKubernetesNetworkPlan({ deploymentSize: "micro", provider: "eks", vpcCidr: "10.0.0.0/23" });
    expect(plan.subnets.public.map((s) => s.availabilityZone)).toEqual(["us-east-1a", "us-east-1b"]);
    expect(plan.subnets.private.map((s) => s.availabilityZone)).toEqual(["us-east-1a", "us-east-1b"]);
    expect(plan.subnets.controlPlane.map((s) => s.availabilityZone)).toEqual(["us-east-1a", "us-east-1b"]);
  });

  it("GKE and AKS subnets carry no zone (subnets are regional)", () => {
    for (const provider of ["gke", "aks"] as const) {
      for (const size of TIERS) {
        const plan = buildKubernetesNetworkPlan({ deploymentSize: size, provider, vpcCidr: "10.0.0.0/16" });
        for (const s of [...plan.subnets.public, ...plan.subnets.private, ...plan.subnets.controlPlane]) {
          expect(s).not.toHaveProperty("availabilityZone");
        }
      }
    }
  });

  it("uses caller-supplied availabilityZones round-robin", () => {
    const plan = buildKubernetesNetworkPlan({
      deploymentSize: "enterprise",
      provider: "eks",
      region: "ap-northeast-1",
      vpcCidr: "10.0.0.0/16",
      availabilityZones: ["ap-northeast-1a", "ap-northeast-1c", "ap-northeast-1d"],
    });
    expect(plan.subnets.private.map((s) => s.availabilityZone))
      .toEqual(["ap-northeast-1a", "ap-northeast-1c", "ap-northeast-1d"]);
  });

  it("rejects one zone for EKS, any zones for GKE/AKS, and repeated zones", () => {
    expect(() => buildKubernetesNetworkPlan({
      deploymentSize: "micro", provider: "eks", vpcCidr: "10.0.0.0/16", availabilityZones: ["us-east-1a"],
    })).toThrow(/at least two availability zones/);
    for (const provider of ["gke", "aks"] as const) {
      expect(() => buildKubernetesNetworkPlan({
        deploymentSize: "micro", provider, vpcCidr: "10.0.0.0/16", availabilityZones: ["zone-a", "zone-b"],
      })).toThrow(/regional/);
    }
    expect(() => buildKubernetesNetworkPlan({
      deploymentSize: "micro", provider: "eks", availabilityZones: ["us-east-1a", "us-east-1a"],
    })).toThrow(/must not repeat/);
  });
});

describe("Reserved ranges and warnings", () => {
  it("moves hyperscale pods off 172.17.0.0/16 for a 10.x VPC", () => {
    const plan = buildKubernetesNetworkPlan({ deploymentSize: "hyperscale", vpcCidr: "10.0.0.0/16" });
    expect(plan.pods.cidr).toBe("172.24.0.0/13");
  });

  it("warns, without failing, when the VPC overlaps 172.17.0.0/16", () => {
    const plan = buildKubernetesNetworkPlan({ deploymentSize: "micro", vpcCidr: "172.17.0.0/24" });
    expect(plan.warnings).toEqual([expect.stringContaining("overlaps 172.17.0.0/16")]);
    assertSeparated(plan);
  });

  it("omits warnings when there are none", () => {
    const plan = buildKubernetesNetworkPlan({ deploymentSize: "micro", vpcCidr: "10.0.0.0/24" });
    expect(plan).not.toHaveProperty("warnings");
  });
});

describe("Pod and service overrides", () => {
  it("honors podsCidr and servicesCidr", () => {
    const plan = buildKubernetesNetworkPlan({
      deploymentSize: "enterprise", vpcCidr: "10.0.0.0/16",
      podsCidr: "100.64.0.0/16", servicesCidr: "172.20.0.0/20",
    });
    expect(plan.pods.cidr).toBe("100.64.0.0/16");
    expect(plan.services.cidr).toBe("172.20.0.0/20");
    assertSeparated(plan);
  });

  it("keeps a generated range clear of the other override", () => {
    // Pods override sits in 192.168, where services would normally go
    const plan = buildKubernetesNetworkPlan({ deploymentSize: "micro", vpcCidr: "10.0.0.0/24", podsCidr: "192.168.0.0/20" });
    expect(blockOf(plan.services.cidr)).toBe("172.16.0.0/12");
    assertSeparated(plan);

    // Services override in 172.16: generated pods must avoid it
    const plan2 = buildKubernetesNetworkPlan({ deploymentSize: "standard", vpcCidr: "10.0.0.0/23", servicesCidr: "172.16.0.0/20" });
    expect(overlaps(plan2.pods.cidr, "172.16.0.0/20")).toBe(false);
    assertSeparated(plan2);
  });

  it("lets several clusters share a network without overlapping", () => {
    const clusters = [0, 1, 2].map((i) => buildKubernetesNetworkPlan({
      deploymentSize: "professional",
      provider: "gke",
      vpcCidr: `10.${i}.0.0/16`,
      podsCidr: `172.16.${i * 64}.0/18`,
      servicesCidr: `192.168.${i * 16}.0/20`,
    }));
    const ranges = clusters.flatMap((p) => [p.vpc.cidr, p.pods.cidr, p.services.cidr]);
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        expect(overlaps(ranges[i], ranges[j]), `${ranges[i]} vs ${ranges[j]}`).toBe(false);
      }
    }
  });

  const reject = (overrides: Record<string, string>, message: RegExp) =>
    expect(() => buildKubernetesNetworkPlan({ deploymentSize: "micro", vpcCidr: "10.0.0.0/24", ...overrides }))
      .toThrow(message);

  it("rejects overrides that overlap the VPC, each other, or a reserved range", () => {
    reject({ podsCidr: "10.0.0.0/16" }, /overlaps the VPC/);
    reject({ servicesCidr: "10.0.0.0/20" }, /overlaps the VPC/);
    reject({ podsCidr: "172.20.0.0/16", servicesCidr: "172.20.0.0/20" }, /overlaps servicesCidr/);
    reject({ podsCidr: "172.17.0.0/16" }, /172\.17\.0\.0\/16/);
  });

  it("rejects overrides outside the allowed ranges or sizes", () => {
    reject({ podsCidr: "8.8.0.0/16" }, /must fall entirely within/);
    reject({ servicesCidr: "100.64.0.0/20" }, /must fall entirely within/); // services must be RFC 1918 (EKS)
    reject({ servicesCidr: "192.168.0.0/12" }, /must fall entirely within/);
    reject({ servicesCidr: "172.16.0.0/12" }, /between \/13 and \/24/);
    reject({ servicesCidr: "192.168.0.0/25" }, /between \/13 and \/24/);
    reject({ podsCidr: "192.168.0.0/25" }, /between \/8 and \/24/);
    reject({ podsCidr: "not-a-cidr" }, /Invalid podsCidr/);
  });

  it("raises KubernetesNetworkGenerationError (a 400) for bad overrides", () => {
    expect(() => buildKubernetesNetworkPlan({ deploymentSize: "micro", podsCidr: "8.8.0.0/16" }))
      .toThrow(KubernetesNetworkGenerationError);
  });
});

describe("VPC sizing", () => {
  it("names the minimum VPC when the VPC is too small", () => {
    expect(() => buildKubernetesNetworkPlan({ deploymentSize: "micro", provider: "eks", vpcCidr: "10.0.0.0/24" }))
      .toThrow(/a \/23 or larger/);
  });

  it("publishes provider-specific tier layouts", () => {
    const eks = getDeploymentTierInfo(undefined, "eks") as Record<string, { publicSubnets: number; minVpcPrefix: number }>;
    expect(eks.micro.publicSubnets).toBe(2);
    expect(eks.micro.minVpcPrefix).toBe(23);
    const generic = getDeploymentTierInfo() as Record<string, { publicSubnets: number; minVpcPrefix: number }>;
    expect(generic.micro.publicSubnets).toBe(1);
    expect(generic.micro.minVpcPrefix).toBe(24);
  });
});

describe("Provider address rules", () => {
  it("gives AKS hyperscale on a 10.x VNet pods from 100.64.0.0/10, clear of the AKS-reserved ranges", () => {
    // Every /13 left in 172.16.0.0/12 holds 172.17.0.0/16 or 172.30-31.0.0/16
    const aks = buildKubernetesNetworkPlan({ deploymentSize: "hyperscale", provider: "aks", vpcCidr: "10.0.0.0/16" });
    expect(aks.pods.cidr).toBe("100.64.0.0/13");
    assertSeparated(aks);

    // Other providers keep the RFC 1918 range
    const eks = buildKubernetesNetworkPlan({ deploymentSize: "hyperscale", provider: "eks", vpcCidr: "10.0.0.0/16" });
    expect(eks.pods.cidr).toBe("172.24.0.0/13");
  });

  it("rejects AKS VNets, pod and service ranges in 172.30.0.0/16 or 172.31.0.0/16", () => {
    const aks = { deploymentSize: "micro", provider: "aks" } as const;
    expect(() => buildKubernetesNetworkPlan({ ...aks, vpcCidr: "172.31.0.0/16" })).toThrow(/172\.31\.0\.0\/16.*AKS rejects it/);
    expect(() => buildKubernetesNetworkPlan({ ...aks, vpcCidr: "172.30.128.0/17" })).toThrow(/172\.30\.0\.0\/16.*AKS rejects it/);
    expect(() => buildKubernetesNetworkPlan({ ...aks, vpcCidr: "10.0.0.0/16", podsCidr: "172.30.0.0/16" })).toThrow(/overlaps 172\.30\.0\.0\/16/);
    expect(() => buildKubernetesNetworkPlan({ ...aks, vpcCidr: "10.0.0.0/16", servicesCidr: "172.31.0.0/20" })).toThrow(/overlaps 172\.31\.0\.0\/16/);

    // The rule is AKS-specific
    expect(buildKubernetesNetworkPlan({ deploymentSize: "micro", provider: "eks", vpcCidr: "172.31.0.0/16" }).vpc.cidr).toBe("172.31.0.0/16");
  });

  it("caps GKE servicesCidr at /16, Google's largest user-managed Services range", () => {
    const base = { deploymentSize: "micro", vpcCidr: "10.0.0.0/16" } as const;
    expect(() => buildKubernetesNetworkPlan({ ...base, provider: "gke", servicesCidr: "172.24.0.0/13" })).toThrow(/between \/16 and \/24; got \/13/);
    expect(buildKubernetesNetworkPlan({ ...base, provider: "gke", servicesCidr: "172.20.0.0/16" }).services.cidr).toBe("172.20.0.0/16");
    expect(buildKubernetesNetworkPlan({ ...base, provider: "eks", servicesCidr: "172.24.0.0/13" }).services.cidr).toBe("172.24.0.0/13");
  });

  it("caps every provider's VPC at /16 (AWS's limit for EKS, the project standard elsewhere)", () => {
    for (const provider of PROVIDERS) {
      for (const vpcCidr of ["10.0.0.0/8", "172.16.0.0/12", "10.0.0.0/15"]) {
        expect(() => buildKubernetesNetworkPlan({ deploymentSize: "micro", provider, vpcCidr }), `${provider} ${vpcCidr}`)
          .toThrow(new RegExp(`too large for ${PROVIDER_NAMES[provider]}:.*/16 or smaller`));
      }
      expect(buildKubernetesNetworkPlan({ deploymentSize: "micro", provider, vpcCidr: "10.0.0.0/16" }).vpc.cidr).toBe("10.0.0.0/16");
    }
    expect(() => buildKubernetesNetworkPlan({ deploymentSize: "micro", provider: "eks", vpcCidr: "10.0.0.0/8" })).toThrow(/AWS VPC CIDR blocks are \/16 to \/28/);
    expect(() => buildKubernetesNetworkPlan({ deploymentSize: "micro", provider: "aks", vpcCidr: "10.0.0.0/8" })).toThrow(/plans are capped at a \/16 VNet/);
  });

  it("keeps generated pods out of a caller servicesCidr's RFC 1918 block", () => {
    const plan = buildKubernetesNetworkPlan({ deploymentSize: "enterprise", provider: "eks", vpcCidr: "10.0.0.0/16", servicesCidr: "172.20.0.0/16" });
    expect(blockOf(plan.pods.cidr)).not.toBe(blockOf(plan.services.cidr));
    expect(blockOf(plan.pods.cidr)).not.toBe(blockOf(plan.vpc.cidr));
    assertSeparated(plan);
  });
});
