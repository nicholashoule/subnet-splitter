/**
 * shared/kubernetes-schema.ts
 * 
 * Schema definitions for Kubernetes network planning API
 * Supports battle-tested configurations for EKS, GKE, AKS, and generic Kubernetes
 * 
 * EKS Pod Networking (Two Models):
 * 
 * Model 1 - AWS VPC CNI (Default):
 * - Pods share VPC subnet IPs with nodes (no separate pod CIDR)
 * - Each pod gets secondary IP from node's ENI
 * - High IP exhaustion risk for large clusters
 * - Our API generates a separate pod CIDR which requires Model 2 implementation (custom CNI or secondary VPC CIDR blocks)
 * 
 * Model 2 - Custom CNI or Secondary CIDR (Our API):
 * - Pods use separate CIDR range (this API's pods.cidr field)
 * - Does NOT consume VPC primary subnet IPs
 * - Requires custom CNI plugin (Calico, Cilium, Weave) OR secondary VPC CIDR blocks
 * - Recommended for clusters >1000 nodes or high pod density
 * 
 * Services:
 * - Always use separate virtual IP range (ClusterIP, internal routing only)
 * 
 * GKE Alias IP Model:
 * - Pods use alias IP ranges (automatic secondary ranges)
 * - Nodes use primary VPC subnet IPs
 * - Services use separate ClusterIP range
 * 
 * AKS CNI Overlay Model:
 * - Pods use overlay CIDR (separate from VPC)
 * - Nodes use VNet subnet IPs
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
  "hyperscale"     // Global Scale: 50-5000 nodes
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

/**
 * Normalize provider aliases to canonical form
 * - "k8s" -> "kubernetes"
 */
export function normalizeProvider(provider: Provider): "eks" | "gke" | "aks" | "kubernetes" {
  if (provider === "k8s") return "kubernetes";
  return provider;
}

/**
 * Request schema for generating Kubernetes network plans
 */
export const KubernetesNetworkPlanRequestSchema = z.object({
  deploymentSize: DeploymentSizeEnum.describe("Deployment tier: standard, professional, enterprise, hyperscale"),
  provider: ProviderEnum.optional().default("kubernetes").describe("Cloud provider: eks, gke, aks, or kubernetes"),
  region: z.string().optional().describe("Cloud region/location (e.g., us-east-1 for AWS, us-central1 for GCP, eastus for Azure)"),
  vpcCidr: z.string().optional().describe("Optional VPC CIDR (e.g., 10.0.0.0/16). If not provided, random RFC 1918 will be generated"),
  deploymentName: z.string().optional().describe("Optional deployment name for reference")
});
export type KubernetesNetworkPlanRequest = z.infer<typeof KubernetesNetworkPlanRequestSchema>;

/**
 * Provider-specific region examples and naming conventions
 * Each provider has different naming standards for regions and availability zones:
 * 
 * AWS (EKS):
 *   - Region format: {continent}-{direction}-{number} (e.g., us-east-1, eu-west-2)
 *   - AZ format: {region}{letter} (e.g., us-east-1a, us-east-1b) - NO hyphen before letter
 *   - Up to 6 AZs per region
 * 
 * GCP (GKE):
 *   - Region format: {continent}-{direction}{number} (e.g., us-central1, europe-west1) - NO hyphen before number
 *   - Zone format: {region}-{letter} (e.g., us-central1-a, us-central1-b) - hyphen before letter
 *   - Typically 3-4 zones per region
 * 
 * Azure (AKS):
 *   - Region format: lowercase concatenated (e.g., eastus, westeurope, northcentralus) - NO separators
 *   - AZ format: {region}-{number} (e.g., eastus-1, eastus-2) - numeric zones (1, 2, 3)
 *   - Maximum 3 zones per region
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
    format: "{region}-{letter} (e.g., us-central1-a, us-central1-b, europe-west1-c)"
  },
  aks: {
    regions: ["eastus", "eastus2", "westus", "westus2", "westus3", "centralus", "northcentralus", "southcentralus", "northeurope", "westeurope", "uksouth", "southeastasia", "australiaeast", "japaneast"],
    default: "eastus",
    format: "{region}-{zone} (e.g., eastus-1, eastus-2, westeurope-3)"
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
  name: z.string().describe("Subnet name (e.g., public-1, private-1a)"),
  type: z.enum(["public", "private"]).describe("Subnet type"),
  availabilityZone: z.string().optional().describe("Availability zone (for future multi-AZ support)")
});
export type SubnetConfig = z.infer<typeof SubnetConfigSchema>;

/**
 * Network range configuration (VPC, Pods, Services)
 */
export const NetworkRangeSchema = z.object({
  cidr: z.string().describe("CIDR notation (e.g., 10.0.0.0/16)"),
  description: z.string().describe("Network range purpose (VPC, Pods, Services)")
});
export type NetworkRange = z.infer<typeof NetworkRangeSchema>;

/**
 * Complete Kubernetes network plan
 */
export const KubernetesNetworkPlanSchema = z.object({
  deploymentSize: DeploymentSizeEnum.describe("Deployment tier used for generation"),
  provider: ProviderEnum.describe("Cloud provider"),
  region: z.string().optional().describe("Cloud region/location"),
  deploymentName: z.string().optional().describe("Reference name for this deployment"),
  vpc: z.object({
    cidr: z.string().describe("VPC CIDR block")
  }).describe("VPC configuration"),
  subnets: z.object({
    public: z.array(SubnetConfigSchema).describe("Public subnets for load balancers/ingress"),
    private: z.array(SubnetConfigSchema).describe("Private subnets for worker nodes")
  }).describe("Subnet allocation"),
  pods: z.object({
    cidr: z.string().describe("Pod network CIDR for CNI plugin (e.g., AWS VPC CNI, Calico)")
  }).describe("Pod IP range for container networking"),
  services: z.object({
    cidr: z.string().describe("Service ClusterIP range for internal DNS/service discovery. EKS: Must be RFC 1918, /24 to /12, set at creation only. Defaults: EKS uses 10.100.0.0/16 or 172.20.0.0/16, our API uses 10.2.0.0/16.")
  }).describe("Service IP range for Kubernetes ClusterIP services (immutable after cluster creation)"),
  metadata: z.object({
    generatedAt: z.string().describe("ISO 8601 timestamp"),
    version: z.string().describe("API version")
  }).describe("Generation metadata")
});
export type KubernetesNetworkPlan = z.infer<typeof KubernetesNetworkPlanSchema>;

/**
 * Configuration for each deployment size tier
 * Defines subnet count, sizing, and IP space allocation
 * 
 * Design Principles:
 * - Public subnets are for infrastructure (NAT, LB, Bastion) - need fewer IPs
 * - Private subnets are for compute (Nodes) - need more IPs
 * - Different sizes reflect real-world usage patterns
 */
export interface DeploymentTierConfig {
  publicSubnets: number;
  privateSubnets: number;
  publicSubnetSize: number;   // CIDR prefix for public subnets (e.g., 25 for /25)
  privateSubnetSize: number;  // CIDR prefix for private subnets (e.g., 20 for /20)
  podsPrefix: number;
  servicesPrefix: number;
  minVpcPrefix: number;       // Minimum VPC prefix required (e.g., 18 for /18)
  description: string;
}

export const DEPLOYMENT_TIER_CONFIGS: Record<DeploymentSize, DeploymentTierConfig> = {
  micro: {
    publicSubnets: 1,
    privateSubnets: 1,
    publicSubnetSize: 26,    // /26 = 64 addresses (plenty for 1 NAT + LB)
    privateSubnetSize: 25,   // /25 = 128 addresses (1 node + pods)
    podsPrefix: 20,          // /20 = 4,096 IPs (1-2 nodes × 110 pods + buffer)
    servicesPrefix: 16,      // /16 for services
    minVpcPrefix: 24,        // Minimum /24 VPC
    description: "Single Node: 1 node, minimal subnet allocation (proof of concept)"
  },
  standard: {
    publicSubnets: 1,
    privateSubnets: 1,
    publicSubnetSize: 25,    // /25 = 128 addresses
    privateSubnetSize: 24,   // /24 = 256 addresses (1-3 nodes + pods)
    podsPrefix: 16,          // /16 = 65,536 IPs (1-3 nodes × 110 pods, generous buffer)
    servicesPrefix: 16,      // /16 for services
    minVpcPrefix: 23,        // Minimum /23 VPC
    description: "Development/Testing: 1-3 nodes, minimal subnet allocation"
  },
  professional: {
    publicSubnets: 2,
    privateSubnets: 2,
    publicSubnetSize: 25,    // /25 = 128 addresses per public subnet
    privateSubnetSize: 23,   // /23 = 512 addresses per private subnet
    podsPrefix: 18,          // /18 = 16,384 IPs (10 nodes × 110 pods + 50% buffer)
    servicesPrefix: 16,
    minVpcPrefix: 21,        // Minimum /21 VPC
    description: "Small Production: 3-10 nodes, dual AZ ready"
  },
  enterprise: {
    publicSubnets: 3,
    privateSubnets: 3,
    publicSubnetSize: 24,    // /24 = 256 addresses per public subnet
    privateSubnetSize: 21,   // /21 = 2048 addresses per private subnet
    podsPrefix: 16,          // /16 = 65,536 IPs (50 nodes × 110 pods + 50% buffer) - IDEAL
    servicesPrefix: 16,
    minVpcPrefix: 18,        // Minimum /18 VPC
    description: "Large Production: 10-50 nodes, triple AZ ready with HA"
  },
  hyperscale: {
    publicSubnets: 3,        // 3 AZs (realistic for most regions)
    privateSubnets: 3,       // 3 AZs
    publicSubnetSize: 23,    // /23 = 512 addresses per public subnet (NAT, LB, Bastion)
    privateSubnetSize: 20,   // /20 = 4096 addresses per private subnet (high node density)
    podsPrefix: 13,          // /13 = 524,288 IPs (5000 nodes × 110 pods = 550K max, supports GKE/EKS/AKS limits)
    servicesPrefix: 16,      // /16 for 65K+ services
    minVpcPrefix: 18,        // Minimum /18 VPC (fits 3×/23 + 3×/20 = 13,824 IPs)
    description: "Global Scale: 50-5000 nodes, multi-region ready (EKS/GKE max)"
  }
};
