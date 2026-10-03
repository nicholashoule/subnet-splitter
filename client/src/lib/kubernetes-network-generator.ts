/**
 * client/src/lib/kubernetes-network-generator.ts
 *
 * Kubernetes network planning service
 * Generates IP ranges for EKS, GKE, AKS, and generic Kubernetes deployments
 * Supports multiple deployment sizes with battle-tested configurations
 *
 * Allocation rules (every tier, every provider):
 * - Nodes, control plane, and load-balancer subnets (public, or internal in private
 *   mode) are carved from the VPC first-fit: each takes the lowest offset aligned to
 *   its own size that is still free. Load-balancer subnets come first, then node
 *   subnets, then the control-plane network, which usually fills the alignment gap.
 * - The control plane is one network: a /28, or for EKS one /27 split into the two
 *   /28 subnets (two AZs) that EKS requires.
 * - Generated pods and services sit outside the VPC, each in its own RFC 1918 block:
 *   pods prefer 10.0.0.0/8 (most space), services prefer 192.168.0.0/16. Pods also keep
 *   out of a caller-supplied servicesCidr's block, and fall back to 100.64.0.0/10
 *   (RFC 6598, accepted for pods by EKS, GKE and AKS) when no RFC 1918 block has room.
 * - Generated ranges never touch RESERVED_RANGES or the provider's
 *   PROVIDER_RESERVED_RANGES; caller-supplied ranges overlapping the latter are rejected.
 * - Every range in the finished plan is checked to be canonical and disjoint.
 */

import type {
  DeploymentSize,
  Provider,
  CanonicalProvider,
  NetworkMode,
  KubernetesNetworkPlan,
  SubnetConfig,
  EffectiveTierConfig
} from "@shared/kubernetes-schema";
import {
  DEPLOYMENT_TIER_CONFIGS,
  DeploymentSizeEnum,
  PROVIDER_REGION_EXAMPLES,
  KubernetesNetworkPlanSchema,
  KubernetesNetworkPlanRequestSchema,
  RESERVED_RANGES,
  PROVIDER_RESERVED_RANGES,
  CONTROL_PLANE_SUBNET_PREFIX,
  PODS_PREFIX_LIMITS,
  SERVICES_PREFIX_LIMITS,
  PROVIDER_SERVICES_PREFIX_LIMITS,
  LARGEST_VPC_PREFIX,
  LARGEST_VPC_REASON,
  normalizeProvider
} from "@shared/kubernetes-schema";
import { numberToIp, parseCidr, prefixToMask } from "./subnet-utils";

/** Plan format and allocation rules version, reported in metadata.version */
export const PLAN_FORMAT_VERSION = "2.0";

export class KubernetesNetworkGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KubernetesNetworkGenerationError";
  }
}

// ── Address arithmetic ───────────────────────────────────────────────

/** An aligned address range: network number and prefix length */
interface Block {
  network: number;
  prefix: number;
}

const blockSize = (prefix: number): number => Math.pow(2, 32 - prefix);
const lastAddress = (b: Block): number => b.network + blockSize(b.prefix) - 1;
const toCidr = (b: Block): string => `${numberToIp(b.network)}/${b.prefix}`;
const overlaps = (a: Block, b: Block): boolean => a.network <= lastAddress(b) && b.network <= lastAddress(a);
const contains = (outer: Block, inner: Block): boolean =>
  inner.prefix >= outer.prefix && ((inner.network & prefixToMask(outer.prefix)) >>> 0) === outer.network;
/** Smallest prefix whose block holds the given number of addresses */
const prefixForSize = (addresses: number): number => 32 - Math.ceil(Math.log2(addresses));

/** RFC 1918 private address blocks */
const RFC1918_BLOCKS = {
  10: { network: 0x0a000000, prefix: 8 },   // 10.0.0.0/8
  172: { network: 0xac100000, prefix: 12 }, // 172.16.0.0/12
  192: { network: 0xc0a80000, prefix: 16 }, // 192.168.0.0/16
} as const;
type Rfc1918Name = keyof typeof RFC1918_BLOCKS;
const RFC1918_NAMES = [10, 172, 192] as const;

/** RFC 6598 shared address space: caller-supplied pods, and generated pods when RFC 1918 is full */
const RFC6598_BLOCK: Block = { network: 0x64400000, prefix: 10 }; // 100.64.0.0/10

interface ReservedRange extends Block {
  cidr: string;
  reason: string;
}
const toReserved = (r: { cidr: string; reason: string }): ReservedRange => ({ ...parseCidr(r.cidr), cidr: r.cidr, reason: r.reason });

/** Reserved for every provider: avoided, and a VPC overlapping them gets a warning */
const RESERVED: ReservedRange[] = RESERVED_RANGES.map(toReserved);
/** Refused by one provider: avoided, and caller ranges overlapping them are rejected */
const providerReserved = (provider: CanonicalProvider): ReservedRange[] =>
  (PROVIDER_RESERVED_RANGES[provider] ?? []).map(toReserved);
/** Everything the generator must not allocate for this provider */
const reservedFor = (provider: CanonicalProvider): ReservedRange[] => [...RESERVED, ...providerReserved(provider)];

/** Pods prefer the largest block; services the smallest, keeping them compact */
const PODS_BLOCK_ORDER: Rfc1918Name[] = [10, 172, 192];
const SERVICES_BLOCK_ORDER: Rfc1918Name[] = [192, 172, 10];

/** The RFC 1918 block that fully contains the range, if any */
function rfc1918BlockOf(b: Block): Rfc1918Name | undefined {
  return RFC1918_NAMES.find((name) => contains(RFC1918_BLOCKS[name], b));
}

/** Lowest slot of the given size inside `within` that overlaps nothing in `avoid` */
function firstFreeSlot(within: Block, prefix: number, avoid: Block[]): Block | undefined {
  if (prefix < within.prefix) return undefined;
  const size = blockSize(prefix);
  for (let network = within.network; network + size - 1 <= lastAddress(within);) {
    const candidate = { network, prefix };
    const clash = avoid.find((a) => overlaps(a, candidate));
    if (!clash) return candidate;
    // Jump past the clash to the next aligned slot
    network = Math.max(network + size, Math.ceil((lastAddress(clash) + 1) / size) * size);
  }
  return undefined;
}

// ── Tier layout ──────────────────────────────────────────────────────

interface SubnetLayout {
  public: number[];       // Offsets from the VPC network address
  loadBalancer: number[];
  private: number[];
  controlPlane: number[];
  addressesNeeded: number;
}

type LayoutCounts = Pick<EffectiveTierConfig,
  "publicSubnets" | "loadBalancerSubnets" | "privateSubnets" | "controlPlaneSubnets" |
  "publicSubnetSize" | "loadBalancerSubnetSize" | "privateSubnetSize" | "controlPlaneSubnetSize">;

/**
 * Place every subnet first-fit: lowest free offset aligned to the subnet's size.
 * Load-balancer subnets (public or internal) fill the start of the VPC, node subnets
 * follow at their own alignment, and the control-plane network drops into the gap
 * left between them. The control plane is placed as one aligned block and then split,
 * so EKS's two /28s always form a single /27.
 */
function layoutSubnets(cfg: LayoutCounts): SubnetLayout {
  const used: Array<[number, number]> = []; // [start, end) offsets
  const place = (prefix: number): number => {
    const size = blockSize(prefix);
    let offset = 0;
    for (;;) {
      const clash = used.find(([start, end]) => offset < end && start < offset + size);
      if (!clash) {
        used.push([offset, offset + size]);
        return offset;
      }
      offset = Math.ceil(clash[1] / size) * size;
    }
  };
  const repeat = (count: number, prefix: number) => Array.from({ length: count }, () => place(prefix));

  const publicOffsets = repeat(cfg.publicSubnets, cfg.publicSubnetSize);
  const loadBalancerOffsets = repeat(cfg.loadBalancerSubnets, cfg.loadBalancerSubnetSize);
  const privateOffsets = repeat(cfg.privateSubnets, cfg.privateSubnetSize);
  const controlPlaneBlock = place(cfg.controlPlaneSubnetSize - Math.ceil(Math.log2(cfg.controlPlaneSubnets)));
  const controlPlaneOffsets = Array.from({ length: cfg.controlPlaneSubnets },
    (_, i) => controlPlaneBlock + i * blockSize(cfg.controlPlaneSubnetSize));
  return {
    public: publicOffsets,
    loadBalancer: loadBalancerOffsets,
    private: privateOffsets,
    controlPlane: controlPlaneOffsets,
    addressesNeeded: Math.max(...used.map(([, end]) => end)),
  };
}

/**
 * A tier's layout for one provider and network mode.
 * - EKS: cluster subnets must span at least two AZs, and ALBs (internet-facing or
 *   internal) need subnets in two AZs, so node and load-balancer subnets get at least
 *   two. The control plane is exactly two /28s (one /27): EKS's minimum, and AWS
 *   advises naming only two subnets so you control where its interfaces land.
 * - GKE, AKS: subnets are regional, so one control-plane range and, in private mode,
 *   one internal load-balancer subnet (GKE: the region's single proxy-only subnet).
 * - Generic: one control-plane subnet, so a floating API server address
 *   (keepalived, kube-vip) can move between control-plane nodes.
 * - Private mode: no public subnets; load-balancer subnets take their place at the
 *   tier's public subnet size (/26 to /23, within GKE's proxy-only limits).
 */
export function getTierConfig(
  size: DeploymentSize,
  provider: Provider = "kubernetes",
  networkMode: NetworkMode = "public"
): EffectiveTierConfig {
  const base = DEPLOYMENT_TIER_CONFIGS[size];
  if (!base) {
    throw new KubernetesNetworkGenerationError(`Unknown deployment size: ${size}`);
  }
  const canonical = normalizeProvider(provider);
  const regional = canonical === "gke" || canonical === "aks";
  const minPerType = canonical === "eks" ? 2 : 1;
  const edgeSubnets = regional && networkMode === "private" ? 1 : Math.max(minPerType, base.publicSubnets);

  const counts: LayoutCounts = {
    publicSubnets: networkMode === "public" ? edgeSubnets : 0,
    loadBalancerSubnets: networkMode === "private" ? edgeSubnets : 0,
    privateSubnets: Math.max(minPerType, base.privateSubnets),
    controlPlaneSubnets: canonical === "eks" ? 2 : 1,
    publicSubnetSize: base.publicSubnetSize,
    loadBalancerSubnetSize: base.publicSubnetSize,
    privateSubnetSize: base.privateSubnetSize,
    controlPlaneSubnetSize: CONTROL_PLANE_SUBNET_PREFIX,
  };
  return {
    networkMode,
    publicSubnets: counts.publicSubnets,
    loadBalancerSubnets: counts.loadBalancerSubnets,
    privateSubnets: counts.privateSubnets,
    controlPlaneSubnets: counts.controlPlaneSubnets,
    publicSubnetSize: counts.publicSubnetSize,
    loadBalancerSubnetSize: counts.loadBalancerSubnetSize,
    privateSubnetSize: counts.privateSubnetSize,
    controlPlaneSubnetSize: counts.controlPlaneSubnetSize,
    podsPrefix: base.podsPrefix,
    servicesPrefix: base.servicesPrefix,
    minVpcPrefix: prefixForSize(layoutSubnets(counts).addressesNeeded),
    description: base.description,
  };
}

// ── Zones ────────────────────────────────────────────────────────────

/** Zone name per subnet, round-robin. GKE and AKS subnets are regional: no zone. */
function zoneNames(
  provider: CanonicalProvider,
  region: string,
  count: number,
  override?: string[]
): Array<string | undefined> {
  if (provider === "gke" || provider === "aks") return Array(count).fill(undefined);
  const zones = override ?? (provider === "eks"
    ? ["a", "b", "c", "d", "e", "f"].map((letter) => `${region}${letter}`)
    : ["zone-1", "zone-2", "zone-3"]);
  return Array.from({ length: count }, (_, i) => zones[i % zones.length]);
}

/** Provider names as error messages show them */
const PROVIDER_NAMES: Record<CanonicalProvider, string> = { eks: "EKS", gke: "GKE", aks: "AKS", kubernetes: "generic Kubernetes" };

// ── VPC, pod, and service ranges ─────────────────────────────────────

function parseRange(field: string, cidr: string): Block {
  try {
    return parseCidr(cidr);
  } catch (error) {
    throw new KubernetesNetworkGenerationError(
      `Invalid ${field} "${cidr}": ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/** Parse the VPC CIDR and verify the entire range is private RFC 1918 space */
function parseVpc(vpcCidr: string): Block {
  const vpc = parseRange("VPC CIDR", vpcCidr);
  if (!rfc1918BlockOf(vpc)) {
    throw new KubernetesNetworkGenerationError(
      `VPC CIDR "${vpcCidr}" uses public IP space. The entire range must fall within a private RFC 1918 block: ` +
      `10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16. ` +
      `Public IPs expose nodes to the internet (critical security risk). ` +
      `Use private subnets for Kubernetes nodes and public subnets only for load balancers/ingress controllers.`
    );
  }
  return vpc;
}

/**
 * Random /18 (16,384 addresses, enough for every tier and provider) inside a
 * randomly chosen RFC 1918 block, aligned and clear of the provider's reserved ranges.
 */
function randomVpc(reserved: ReservedRange[]): Block {
  const block = RFC1918_BLOCKS[RFC1918_NAMES[Math.floor(Math.random() * RFC1918_NAMES.length)]];
  const slots = Array.from({ length: Math.pow(2, 18 - block.prefix) }, (_, i) => ({
    network: block.network + i * blockSize(18),
    prefix: 18,
  })).filter((slot) => !reserved.some((r) => overlaps(r, slot)));
  return slots[Math.floor(Math.random() * slots.length)];
}

/** Validate a caller-supplied pod or service range */
function parseOverride(
  field: "podsCidr" | "servicesCidr",
  cidr: string,
  allowed: Block[],
  allowedText: string,
  limits: { largest: number; smallest: number },
  reserved: ReservedRange[]
): Block {
  const range = parseRange(field, cidr);
  if (!allowed.some((a) => contains(a, range))) {
    throw new KubernetesNetworkGenerationError(`${field} "${cidr}" must fall entirely within ${allowedText}.`);
  }
  if (range.prefix < limits.largest || range.prefix > limits.smallest) {
    throw new KubernetesNetworkGenerationError(
      `${field} "${cidr}" must be between /${limits.largest} and /${limits.smallest}; got /${range.prefix}.`
    );
  }
  const clash = reserved.find((r) => overlaps(r, range));
  if (clash) {
    throw new KubernetesNetworkGenerationError(`${field} "${cidr}" overlaps ${clash.cidr} (${clash.reason}).`);
  }
  return range;
}

/** First free slot of the given size across the candidate blocks, in order */
function allocateRange(kind: string, prefix: number, candidates: Block[], avoid: Block[]): Block {
  for (const block of candidates) {
    const slot = firstFreeSlot(block, prefix, avoid);
    if (slot) return slot;
  }
  throw new KubernetesNetworkGenerationError(
    `No free /${prefix} ${kind} range is left outside the VPC in ${candidates.map(toCidr).join(", ")}. Pass ${kind}Cidr explicitly.`
  );
}

/**
 * Guard: subnets inside the VPC, pods and services outside it and clear of reserved
 * ranges, and no two ranges overlapping. A failure here is a bug, not bad input.
 */
function assertSeparated(vpc: Block, subnets: SubnetConfig[], pods: Block, services: Block, reserved: ReservedRange[]): void {
  const ranges = [
    ...subnets.map((s) => ({ name: `subnet ${s.name}`, block: parseCidr(s.cidr), insideVpc: true })),
    { name: "pods", block: pods, insideVpc: false },
    { name: "services", block: services, insideVpc: false },
  ];
  for (const r of ranges) {
    if (r.insideVpc ? !contains(vpc, r.block) : overlaps(vpc, r.block)) {
      throw new Error(`Allocation bug: ${r.name} ${toCidr(r.block)} is ${r.insideVpc ? "outside" : "inside"} the VPC ${toCidr(vpc)}`);
    }
    if (!r.insideVpc && reserved.some((range) => overlaps(range, r.block))) {
      throw new Error(`Allocation bug: ${r.name} ${toCidr(r.block)} overlaps a reserved range`);
    }
  }
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (overlaps(ranges[i].block, ranges[j].block)) {
        throw new Error(`Allocation bug: ${ranges[i].name} overlaps ${ranges[j].name}`);
      }
    }
  }
}

// ── Plan generation ──────────────────────────────────────────────────

/**
 * Build a complete Kubernetes network plan. Deterministic for a given request
 * when vpcCidr is supplied (apart from metadata.generatedAt).
 */
export function buildKubernetesNetworkPlan(request: unknown, now: Date = new Date()): KubernetesNetworkPlan {
  const req = KubernetesNetworkPlanRequestSchema.parse(request);
  const provider = normalizeProvider(req.provider);
  const tier = getTierConfig(req.deploymentSize, provider, req.networkMode);
  const region = req.region || (PROVIDER_REGION_EXAMPLES[provider] || PROVIDER_REGION_EXAMPLES.kubernetes).default;

  if (req.availabilityZones && (provider === "gke" || provider === "aks")) {
    throw new KubernetesNetworkGenerationError(
      `availabilityZones applies to EKS and generic Kubernetes only: ${PROVIDER_NAMES[provider]} subnets are regional, and node pools choose their zones.`
    );
  }
  if (provider === "eks" && req.availabilityZones && req.availabilityZones.length < 2) {
    throw new KubernetesNetworkGenerationError("EKS needs subnets in at least two availability zones; pass two or more availabilityZones.");
  }

  // VPC: caller's (must be private) or a random /18
  const reserved = reservedFor(provider);
  const vpc = req.vpcCidr ? parseVpc(req.vpcCidr) : randomVpc(reserved);
  const vpcBlock = rfc1918BlockOf(vpc)!;
  if (vpc.prefix < LARGEST_VPC_PREFIX) {
    throw new KubernetesNetworkGenerationError(
      `VPC ${toCidr(vpc)} is too large for ${PROVIDER_NAMES[provider]}: ${LARGEST_VPC_REASON[provider]}. Use a /${LARGEST_VPC_PREFIX} or smaller (larger prefix number).`
    );
  }
  const refused = providerReserved(provider).find((r) => overlaps(r, vpc));
  if (refused) {
    throw new KubernetesNetworkGenerationError(
      `VPC ${toCidr(vpc)} overlaps ${refused.cidr}, ${refused.reason}, so ${PROVIDER_NAMES[provider]} rejects it. Choose a VPC outside it.`
    );
  }

  // Nodes, control plane, and public subnets inside the VPC
  const layout = layoutSubnets(tier);
  if (layout.addressesNeeded > blockSize(vpc.prefix)) {
    throw new KubernetesNetworkGenerationError(
      `VPC ${toCidr(vpc)} is too small for the ${PROVIDER_NAMES[provider]} ${req.deploymentSize} tier: its subnets need ` +
      `${layout.addressesNeeded} addresses (a /${tier.minVpcPrefix} or larger), but a /${vpc.prefix} provides ` +
      `${blockSize(vpc.prefix)}. Use a larger VPC CIDR (smaller prefix number).`
    );
  }
  const makeSubnets = (type: SubnetConfig["type"], prefix: number, offsets: number[]): SubnetConfig[] => {
    const zones = zoneNames(provider, region, offsets.length, req.availabilityZones);
    return offsets.map((offset, i) => ({
      cidr: toCidr({ network: vpc.network + offset, prefix }),
      name: `${type}-${i + 1}`,
      type,
      ...(zones[i] ? { availabilityZone: zones[i] } : {}),
    }));
  };
  const publicSubnets = makeSubnets("public", tier.publicSubnetSize, layout.public);
  const privateSubnets = makeSubnets("private", tier.privateSubnetSize, layout.private);
  const loadBalancerSubnets = makeSubnets("load-balancer", tier.loadBalancerSubnetSize, layout.loadBalancer);
  const controlPlaneSubnets = makeSubnets("control-plane", tier.controlPlaneSubnetSize, layout.controlPlane);

  // Pods and services: outside the VPC, each in its own block unless overridden
  const podsOverride = req.podsCidr
    ? parseOverride("podsCidr", req.podsCidr, [...Object.values(RFC1918_BLOCKS), RFC6598_BLOCK],
      "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, or 100.64.0.0/10", PODS_PREFIX_LIMITS, reserved)
    : undefined;
  const servicesOverride = req.servicesCidr
    ? parseOverride("servicesCidr", req.servicesCidr, Object.values(RFC1918_BLOCKS),
      "10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16",
      PROVIDER_SERVICES_PREFIX_LIMITS[provider] ?? SERVICES_PREFIX_LIMITS, reserved)
    : undefined;
  for (const [field, range] of [["podsCidr", podsOverride], ["servicesCidr", servicesOverride]] as const) {
    if (range && overlaps(range, vpc)) {
      throw new KubernetesNetworkGenerationError(`${field} ${toCidr(range)} overlaps the VPC ${toCidr(vpc)}.`);
    }
  }
  if (podsOverride && servicesOverride && overlaps(podsOverride, servicesOverride)) {
    throw new KubernetesNetworkGenerationError(
      `podsCidr ${toCidr(podsOverride)} overlaps servicesCidr ${toCidr(servicesOverride)}.`
    );
  }

  // Generated pods: an RFC 1918 block other than the VPC's and the caller's services
  // block, then RFC 6598 (AKS hyperscale on a 10.x VNet needs it: every /13 left in
  // 172.16.0.0/12 holds 172.17.0.0/16 or the AKS-reserved 172.30-31.0.0/16)
  const servicesBlock = servicesOverride ? rfc1918BlockOf(servicesOverride) : undefined;
  const pods = podsOverride ?? allocateRange(
    "pods",
    tier.podsPrefix,
    [...PODS_BLOCK_ORDER.filter((b) => b !== vpcBlock && b !== servicesBlock).map((b) => RFC1918_BLOCKS[b]), RFC6598_BLOCK],
    [vpc, ...reserved, ...(servicesOverride ? [servicesOverride] : [])]
  );
  const podsBlock = rfc1918BlockOf(pods);
  const services = servicesOverride ?? allocateRange(
    "services",
    tier.servicesPrefix,
    SERVICES_BLOCK_ORDER.filter((b) => b !== vpcBlock && b !== podsBlock).map((b) => RFC1918_BLOCKS[b]),
    [vpc, pods, ...reserved]
  );

  assertSeparated(vpc, [...publicSubnets, ...loadBalancerSubnets, ...privateSubnets, ...controlPlaneSubnets], pods, services, reserved);

  // A caller's VPC may overlap a range reserved for every provider; allowed but flagged
  // (provider-reserved overlaps were rejected above)
  const warnings = RESERVED.filter((r) => overlaps(r, vpc)).map((r) =>
    `VPC ${toCidr(vpc)} overlaps ${r.cidr} (${r.reason}). Prefer a VPC outside it.`
  );

  const plan: KubernetesNetworkPlan = {
    deploymentSize: req.deploymentSize,
    provider,
    networkMode: req.networkMode,
    region,
    deploymentName: req.deploymentName,
    vpc: { cidr: toCidr(vpc) },
    subnets: {
      public: publicSubnets,
      private: privateSubnets,
      loadBalancer: loadBalancerSubnets,
      controlPlane: controlPlaneSubnets,
    },
    pods: { cidr: toCidr(pods) },
    services: { cidr: toCidr(services) },
    ...(warnings.length ? { warnings } : {}),
    metadata: {
      generatedAt: now.toISOString(),
      version: PLAN_FORMAT_VERSION,
    },
  };

  // Validate output
  return KubernetesNetworkPlanSchema.parse(plan);
}

/**
 * Generate a complete Kubernetes network plan
 */
export async function generateKubernetesNetworkPlan(request: unknown): Promise<KubernetesNetworkPlan> {
  return buildKubernetesNetworkPlan(request);
}

/**
 * Get information about deployment tiers as the generator applies them for a
 * provider (defaults to generic Kubernetes)
 */
export function getDeploymentTierInfo(
  size?: DeploymentSize,
  provider: Provider = "kubernetes",
  networkMode: NetworkMode = "public"
): Record<string, unknown> {
  if (size) {
    return { size, ...getTierConfig(size, provider, networkMode) };
  }
  return Object.fromEntries(DeploymentSizeEnum.options.map((tier) => [tier, getTierConfig(tier, provider, networkMode)]));
}
