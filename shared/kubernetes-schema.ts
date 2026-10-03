/**
 * shared/kubernetes-schema.ts
 *
 * Schema definitions for Kubernetes network planning API
 * Supports battle-tested configurations for EKS, GKE, AKS, and generic Kubernetes
 *
 * Every plan separates four kinds of address space, and no two ranges overlap:
 * - Nodes: private subnets inside the VPC
 * - Control plane: dedicated /28 subnets inside the VPC
 * - Pods: a range outside the VPC, in a different RFC 1918 block, or in
 *   100.64.0.0/10 (RFC 6598) when no RFC 1918 block has room
 * - Services: a ClusterIP range outside the VPC, in a third RFC 1918 block
 * Generated ranges keep to their own blocks; caller-supplied podsCidr and
 * servicesCidr only have to stay clear of the VPC, each other and reserved ranges.
 * Public subnets (load balancers, NAT) are also inside the VPC.
 *
 * Network modes:
 * - public (default): public subnets for internet-facing load balancers and NAT
 * - private: no public subnets. Dedicated internal load-balancer subnets instead,
 *   and egress outside the VPC layout (GKE Cloud NAT, an Azure NAT gateway, or for
 *   EKS a transit gateway to an egress VPC or VPC endpoints)
 *
 * Control plane: one network per cluster. A single /28 for GKE, AKS and generic
 * Kubernetes; for EKS one /27 split into the two /28 subnets (two AZs) that EKS
 * requires.
 *
 * EKS Pod Networking (Two Models):
 *
 * Model 1 - AWS VPC CNI (Default):
 * - Pods share VPC subnet IPs with nodes (no separate pod CIDR)
 * - Each pod gets secondary IP from node's ENI
 * - High IP exhaustion risk for large clusters
 * - Our API generates a separate pod CIDR which requires Model 2 implementation; under
 *   Model 1 it goes unused and the node subnets hold every pod (hyperscale's three /20s:
 *   108 nodes at 110 pods each)
 *
 * Model 2 - Overlay CNI (Our API):
 * - Pods use separate CIDR range (this API's pods.cidr field) as an overlay CNI's
 *   IP pool (Calico, Cilium in VXLAN/IP-in-IP mode)
 * - Does NOT consume VPC primary subnet IPs
 * - A generated pods.cidr in another RFC 1918 block can NOT be a VPC secondary CIDR:
 *   AWS refuses to associate a different RFC 1918 block (and secondary blocks must be
 *   /16-/28). VPC CNI custom networking needs a /16-to-/28 podsCidr AWS can associate:
 *   100.64.0.0/10 (recommended) or another range in the VPC's own RFC 1918 block.
 * - Recommended for clusters >1000 nodes or high pod density
 *
 * Services:
 * - Always use separate virtual IP range (ClusterIP, internal routing only)
 *
 * GKE Alias IP Model:
 * - Pods use alias IP ranges (secondary ranges on the node subnet)
 * - Nodes use primary subnet IPs; subnets are regional, so they carry no zone
 * - Services use separate ClusterIP range
 *
 * AKS CNI Overlay Model:
 * - Pods use overlay CIDR (separate from VNet); each node gets a fixed /24
 * - Nodes use VNet subnet IPs; subnets are regional, so they carry no zone
 * - Services use separate ClusterIP range
 */

import { z } from "zod";

/**
 * Deployment size tiers based on typical enterprise Kubernetes deployments
 */
export const DeploymentSizeEnum = z.enum([
  "micro",         // Single Node: 1 node (dev/poc)
  "standard",      // Dev/Test: 1-3 nodes
  "professional",  // Small Prod: 3-10 nodes
  "enterprise",    // Large Prod: 10-50 nodes
  "hyperscale"     // Global Scale: 50-5,000 nodes (default /13 pods range: 2,048 nodes at a /24 each)
]);
export type DeploymentSize = z.infer<typeof DeploymentSizeEnum>;

/**
 * Supported Kubernetes providers
 * - eks: AWS Elastic Kubernetes Service
 * - gke: Google Kubernetes Engine
 * - aks: Azure Kubernetes Service
 * - kubernetes/k8s: Generic self-hosted Kubernetes
 */
export const ProviderEnum = z.enum(["eks", "gke", "aks", "kubernetes", "k8s"]);
export type Provider = z.infer<typeof ProviderEnum>;
export type CanonicalProvider = "eks" | "gke" | "aks" | "kubernetes";

/**
 * Normalize provider aliases to canonical form
 * - "k8s" -> "kubernetes"
 */
export function normalizeProvider(provider: Provider): CanonicalProvider {
  if (provider === "k8s") return "kubernetes";
  return provider;
}

/**
 * Address ranges the generator never allocates to pods or services, for every
 * provider. A caller's VPC may overlap them; the plan then carries a warning.
 */
export const RESERVED_RANGES = [
  {
    cidr: "172.17.0.0/16",
    reason: "Docker's default bridge network; AWS also reserves it for some services (Cloud9, SageMaker)",
  },
] as const;

/**
 * Ranges a provider refuses for the cluster network, pods and services. The generator
 * never allocates them, and caller-supplied ranges that overlap them are rejected.
 * AKS: "CNI networking prerequisites" (also 169.254.0.0/16 and 192.0.2.0/24, which are
 * outside the private ranges this API accepts anyway).
 */
export const PROVIDER_RESERVED_RANGES: Partial<Record<CanonicalProvider, ReadonlyArray<{ cidr: string; reason: string }>>> = {
  aks: [
    { cidr: "172.30.0.0/16", reason: "reserved by AKS for service, pod, and cluster virtual network ranges" },
    { cidr: "172.31.0.0/16", reason: "reserved by AKS for service, pod, and cluster virtual network ranges" },
  ],
};

/** Control-plane subnets are /28: GKE's required master range size, AKS's minimum API server subnet, and above EKS's 6-address minimum */
export const CONTROL_PLANE_SUBNET_PREFIX = 28;

/**
 * public: public subnets for internet-facing load balancers and NAT.
 * private: no public subnets; internal load-balancer subnets, and egress via Cloud NAT,
 * a NAT gateway, or a transit gateway, none of which take space in this layout.
 */
export const NetworkModeEnum = z.enum(["public", "private"]);
export type NetworkMode = z.infer<typeof NetworkModeEnum>;

/**
 * Size limits for caller-supplied ranges.
 * - Pods: at least one /24 (GKE at its default density and AKS overlay give each node a /24)
 * - Services: /13 to /24, which suits EKS (/12 to /24) and AKS (smaller than /12);
 *   GKE caps a user-managed Services range at /16, so GKE allows /16 to /24
 */
export const PODS_PREFIX_LIMITS = { largest: 8, smallest: 24 } as const;
export const SERVICES_PREFIX_LIMITS = { largest: 13, smallest: 24 } as const;
export const PROVIDER_SERVICES_PREFIX_LIMITS: Partial<Record<CanonicalProvider, { largest: number; smallest: number }>> = {
  gke: { largest: 16, smallest: 24 },
};

/**
 * Largest VPC (VNet) any plan accepts: a /16. For EKS it is AWS's limit (VPC CIDR
 * blocks are /16 to /28); for GKE, AKS and generic Kubernetes it is this project's
 * standard (GCP subnets and Azure VNets may be larger).
 */
export const LARGEST_VPC_PREFIX = 16;
export const LARGEST_VPC_REASON: Record<CanonicalProvider, string> = {
  eks: "AWS VPC CIDR blocks are /16 to /28",
  gke: "plans are capped at a /16 VPC",
  aks: "plans are capped at a /16 VNet",
  kubernetes: "plans are capped at a /16 VPC",
};

/** Region and zone names: lowercase letters, digits and hyphens */
const LOCATION_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * An optional CIDR field. Surrounding whitespace is dropped, but a blank value is an
 * error: the generator treats an empty string as omitted, so "" or "   " (an unset
 * Terraform variable, say) would otherwise silently get a generated range.
 */
const optionalCidr = () =>
  z.string().trim().min(1, "Must not be blank; omit the field to have a range generated").max(18).optional();

/**
 * Request schema for generating Kubernetes network plans
 */
export const KubernetesNetworkPlanRequestSchema = z.object({
  deploymentSize: DeploymentSizeEnum.describe("Deployment tier: micro, standard, professional, enterprise, hyperscale"),
  provider: ProviderEnum.optional().default("kubernetes").describe("Cloud provider: eks, gke, aks, or kubernetes"),
  // Region is interpolated into zone names, so restrict it to the lowercase
  // alphanumeric-and-hyphen form every supported provider uses.
  region: z.string()
    .max(64)
    .regex(LOCATION_PATTERN, "Region must be lowercase letters, digits, and hyphens (e.g., us-east-1, us-central1, eastus)")
    .optional()
    .describe("Cloud region/location (e.g., us-east-1 for AWS, us-central1 for GCP, eastus for Azure)"),
  vpcCidr: optionalCidr().describe("Optional VPC CIDR (e.g., 10.0.0.0/16). If omitted, a random RFC 1918 /18 is generated; a blank value is rejected"),
  podsCidr: optionalCidr()
    .describe("Optional pod range, e.g. to keep several clusters from overlapping. RFC 1918 or 100.64.0.0/10, /8 to /24"),
  servicesCidr: optionalCidr()
    .describe("Optional service (ClusterIP) range. RFC 1918, /13 to /24 (GKE: /16 to /24)"),
  availabilityZones: z.array(
    z.string()
      .max(64)
      .regex(LOCATION_PATTERN, "Zone names must be lowercase letters, digits, and hyphens (e.g., us-east-1a)")
  )
    .min(1)
    .max(6)
    .refine((zones) => new Set(zones).size === zones.length, "availabilityZones must not repeat a zone")
    .optional()
    .describe("Optional zone names to assign round-robin (EKS and generic Kubernetes). Use the zones your account actually has, e.g. from data.aws_availability_zones"),
  networkMode: NetworkModeEnum.optional().default("public")
    .describe("public (default): public subnets for internet-facing LBs and NAT. private: no public subnets; internal load-balancer subnets, egress via Cloud NAT, NAT gateway, or transit gateway"),
  deploymentName: z.string().max(128).optional().describe("Optional deployment name for reference")
});
export type KubernetesNetworkPlanRequest = z.infer<typeof KubernetesNetworkPlanRequestSchema>;

/**
 * Provider-specific region examples and naming conventions
 *
 * AWS (EKS):
 *   - Region format: {continent}-{direction}-{number} (e.g., us-east-1, eu-west-2)
 *   - AZ format: {region}{letter} (e.g., us-east-1a). Which letters exist varies by
 *     region and account (ap-northeast-1 offers a, c, d to new accounts), so generated
 *     names are a starting point; pass availabilityZones for exact names.
 *   - EKS requires cluster subnets in at least two AZs
 *
 * GCP (GKE):
 *   - Region format: {continent}-{direction}{number} (e.g., us-central1, europe-west1)
 *   - Subnets are regional: no zone per subnet. Node pools choose zones (node_locations).
 *
 * Azure (AKS):
 *   - Region format: lowercase concatenated (e.g., eastus, westeurope)
 *   - Subnets are regional: no zone per subnet. Node pools choose zones 1, 2, 3.
 */
export const PROVIDER_REGION_EXAMPLES: Record<string, { regions: string[]; default: string; format: string }> = {
  eks: {
    regions: ["us-east-1", "us-east-2", "us-west-1", "us-west-2", "eu-west-1", "eu-west-2", "eu-central-1", "ap-southeast-1", "ap-northeast-1", "ap-south-1", "sa-east-1", "ca-central-1"],
    default: "us-east-1",
    format: "{region}{letter} (e.g., us-east-1a, us-east-1b, eu-west-1c)"
  },
  gke: {
    regions: ["us-central1", "us-east1", "us-east4", "us-west1", "us-west2", "europe-west1", "europe-west2", "europe-west4", "asia-east1", "asia-southeast1", "asia-northeast1", "australia-southeast1"],
    default: "us-central1",
    format: "Regional subnets (no zone per subnet); node pools choose zones such as us-central1-a"
  },
  aks: {
    regions: ["eastus", "eastus2", "westus", "westus2", "westus3", "centralus", "northcentralus", "southcentralus", "northeurope", "westeurope", "uksouth", "southeastasia", "australiaeast", "japaneast"],
    default: "eastus",
    format: "Regional subnets (no zone per subnet); node pools choose zones 1, 2, 3"
  },
  kubernetes: {
    regions: ["region-1", "datacenter-1", "zone-1"],
    default: "region-1",
    format: "zone-{n} (e.g., zone-1, zone-2)"
  }
};

/**
 * Subnet configuration for VPC
 */
export const SubnetConfigSchema = z.object({
  cidr: z.string().describe("Subnet CIDR notation (e.g., 10.0.0.0/24)"),
  name: z.string().describe("Subnet name (e.g., public-1, private-1, control-plane-1)"),
  type: z.enum(["public", "private", "load-balancer", "control-plane"]).describe("Subnet type"),
  availabilityZone: z.string().optional()
    .describe("Zone for this subnet (EKS and generic Kubernetes only; GKE and AKS subnets are regional)")
});
export type SubnetConfig = z.infer<typeof SubnetConfigSchema>;

/**
 * Complete Kubernetes network plan
 */
export const KubernetesNetworkPlanSchema = z.object({
  deploymentSize: DeploymentSizeEnum.describe("Deployment tier used for generation"),
  provider: ProviderEnum.describe("Cloud provider"),
  networkMode: NetworkModeEnum.describe("public or private (no public subnets)"),
  region: z.string().optional().describe("Cloud region/location"),
  deploymentName: z.string().optional().describe("Reference name for this deployment"),
  vpc: z.object({
    cidr: z.string().describe("VPC CIDR block")
  }).describe("VPC configuration"),
  subnets: z.object({
    public: z.array(SubnetConfigSchema).describe("Public subnets for internet-facing load balancers and NAT (empty in private mode)"),
    private: z.array(SubnetConfigSchema).describe("Private subnets for worker nodes"),
    loadBalancer: z.array(SubnetConfigSchema)
      .describe("Internal load-balancer subnets (private mode only; empty in public mode): GKE proxy-only subnet, AKS internal LB subnet, EKS internal-elb subnets per AZ"),
    controlPlane: z.array(SubnetConfigSchema)
      .describe("The control-plane network: one /28 (GKE master_ipv4_cidr_block, AKS API server subnet, self-hosted control-plane nodes), or for EKS one /27 split into two /28s in two AZs for vpc_config.subnet_ids")
  }).describe("Subnet allocation inside the VPC"),
  pods: z.object({
    cidr: z.string().describe("Pod network CIDR for the CNI plugin (overlay pool, GKE pod secondary range, or AKS overlay pod CIDR)")
  }).describe("Pod IP range for container networking"),
  services: z.object({
    cidr: z.string().describe("Service ClusterIP range. RFC 1918, /13 to /24 (GKE: /16 to /24), set at cluster creation only. A generated range sits in an RFC 1918 block used by neither the VPC nor the pods; a supplied servicesCidr only has to avoid them.")
  }).describe("Service IP range for Kubernetes ClusterIP services (immutable after cluster creation)"),
  warnings: z.array(z.string()).optional().describe("Non-fatal issues with the requested ranges (omitted when there are none)"),
  metadata: z.object({
    generatedAt: z.string().describe("ISO 8601 timestamp"),
    version: z.string().describe("Plan format and allocation rules version")
  }).describe("Generation metadata")
});
export type KubernetesNetworkPlan = z.infer<typeof KubernetesNetworkPlanSchema>;

/**
 * Configuration for each deployment size tier
 * Defines subnet count, sizing, and IP space allocation
 *
 * Design Principles:
 * - Public subnets are for infrastructure (NAT, LB, Bastion) - need fewer IPs.
 *   In private mode the same size is used for internal load-balancer subnets
 *   (/26 to /23: GKE's proxy-only minimum is /26, its recommendation /23)
 * - Private subnets are for compute (Nodes) - need more IPs
 * - Control-plane subnets are always /28 (CONTROL_PLANE_SUBNET_PREFIX)
 * - Pod ranges assume a /24 per node (GKE at 65-128 max pods, AKS overlay always)
 * - Service ranges are /20 (4,096 ClusterIPs, GKE's own default size); hyperscale
 *   uses /18 (16,384), above Kubernetes' tested limit of 10,000 services
 *
 * Counts here are the provider-neutral baseline; the generator raises them where a
 * provider requires it (EKS needs subnets in at least two AZs) and computes the
 * minimum VPC size from the actual layout (see getDeploymentTierInfo).
 */
export interface DeploymentTierConfig {
  publicSubnets: number;
  privateSubnets: number;
  publicSubnetSize: number;   // CIDR prefix for public subnets (e.g., 25 for /25)
  privateSubnetSize: number;  // CIDR prefix for private subnets (e.g., 20 for /20)
  podsPrefix: number;
  servicesPrefix: number;
  description: string;
}

/** A tier's layout for a specific provider and network mode, as the generator applies it */
export interface EffectiveTierConfig extends DeploymentTierConfig {
  networkMode: NetworkMode;
  loadBalancerSubnets: number;
  loadBalancerSubnetSize: number;
  controlPlaneSubnets: number;
  controlPlaneSubnetSize: number;
  minVpcPrefix: number;       // Smallest VPC (largest prefix) that fits every subnet
}

export const DEPLOYMENT_TIER_CONFIGS: Record<DeploymentSize, DeploymentTierConfig> = {
  micro: {
    publicSubnets: 1,
    privateSubnets: 1,
    publicSubnetSize: 26,    // /26 = 64 addresses (plenty for 1 NAT + LB)
    privateSubnetSize: 25,   // /25 = 128 addresses
    podsPrefix: 20,          // /20 = 4,096 IPs (16 nodes at a /24 each)
    servicesPrefix: 20,      // /20 = 4,096 ClusterIPs
    description: "Single Node: 1 node, minimal subnet allocation (proof of concept)"
  },
  standard: {
    publicSubnets: 1,
    privateSubnets: 1,
    publicSubnetSize: 25,    // /25 = 128 addresses
    privateSubnetSize: 24,   // /24 = 256 addresses
    podsPrefix: 16,          // /16 = 65,536 IPs (256 nodes at a /24 each)
    servicesPrefix: 20,
    description: "Development/Testing: 1-3 nodes, minimal subnet allocation"
  },
  professional: {
    publicSubnets: 2,
    privateSubnets: 2,
    publicSubnetSize: 25,    // /25 = 128 addresses per public subnet
    privateSubnetSize: 23,   // /23 = 512 addresses per private subnet
    podsPrefix: 18,          // /18 = 16,384 IPs (64 nodes at a /24 each)
    servicesPrefix: 20,
    description: "Small Production: 3-10 nodes, dual AZ ready"
  },
  enterprise: {
    publicSubnets: 3,
    privateSubnets: 3,
    publicSubnetSize: 24,    // /24 = 256 addresses per public subnet
    privateSubnetSize: 21,   // /21 = 2048 addresses per private subnet
    podsPrefix: 16,          // /16 = 65,536 IPs (256 nodes at a /24 each)
    servicesPrefix: 20,
    description: "Large Production: 10-50 nodes, triple AZ ready with HA"
  },
  hyperscale: {
    publicSubnets: 3,        // 3 AZs (realistic for most regions)
    privateSubnets: 3,       // 3 AZs
    publicSubnetSize: 23,    // /23 = 512 addresses per public subnet (NAT, LB, Bastion)
    privateSubnetSize: 20,   // /20 = 4096 addresses per private subnet (high node density)
    // /13 = 524,288 IPs, sized for GKE's 200K pods-per-cluster cap. GKE (65-128 max
    // pods) and AKS overlay (always) reserve a /24 per node, so /13 covers 2,048 nodes;
    // 5,000 nodes needs GKE max-pods-per-node <= 32 (/26 per node) or a /11 podsCidr.
    podsPrefix: 13,
    servicesPrefix: 18,      // /18 = 16,384 ClusterIPs
    description: "Global Scale: 50-5,000 nodes across 3 AZs. The /13 pod range holds 2,048 nodes at a /24 per node (AKS overlay; GKE at 65-128 max pods per node). 5,000 nodes needs GKE max pods per node of 32 or fewer, or a /11 podsCidr"
  }
};
