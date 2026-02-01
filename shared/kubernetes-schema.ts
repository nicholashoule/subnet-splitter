/**
 * shared/kubernetes-schema.ts
 * 
 * Schema definitions for Kubernetes network planning API
 * Supports battle-tested configurations for EKS, GKE, and generic Kubernetes
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
 */
export const ProviderEnum = z.enum(["eks", "gke", "kubernetes"]);
export type Provider = z.infer<typeof ProviderEnum>;

/**
 * Request schema for generating Kubernetes network plans
 */
export const KubernetesNetworkPlanRequestSchema = z.object({
  deploymentSize: DeploymentSizeEnum.describe("Deployment tier: standard, professional, enterprise, hyperscale"),
  provider: ProviderEnum.optional().default("kubernetes").describe("Cloud provider: eks, gke, or kubernetes"),
  vpcCidr: z.string().optional().describe("Optional VPC CIDR (e.g., 10.0.0.0/16). If not provided, random RFC 1918 will be generated"),
  deploymentName: z.string().optional().describe("Optional deployment name for reference")
});
export type KubernetesNetworkPlanRequest = z.infer<typeof KubernetesNetworkPlanRequestSchema>;

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
    cidr: z.string().describe("Service ClusterIP range for internal DNS/service discovery")
  }).describe("Service IP range"),
  metadata: z.object({
    generatedAt: z.string().describe("ISO 8601 timestamp"),
    version: z.string().describe("API version")
  }).describe("Generation metadata")
});
export type KubernetesNetworkPlan = z.infer<typeof KubernetesNetworkPlanSchema>;

/**
 * Configuration for each deployment size tier
 * Defines subnet count, sizing, and IP space allocation
 */
export interface DeploymentTierConfig {
  publicSubnets: number;
  privateSubnets: number;
  subnetSize: number; // CIDR prefix (e.g., 24 for /24)
  podsPrefix: number;
  servicesPrefix: number;
  description: string;
}

export const DEPLOYMENT_TIER_CONFIGS: Record<DeploymentSize, DeploymentTierConfig> = {
  micro: {
    publicSubnets: 1,
    privateSubnets: 1,
    subnetSize: 25,      // /25 = 128 addresses per subnet
    podsPrefix: 18,      // /18 for small clusters
    servicesPrefix: 16,  // /16 for services
    description: "Single Node: 1 node, minimal subnet allocation (proof of concept)"
  },
  standard: {
    publicSubnets: 1,
    privateSubnets: 1,
    subnetSize: 24,      // /24 = 256 addresses per subnet
    podsPrefix: 16,      // /16 for pods
    servicesPrefix: 16,  // /16 for services
    description: "Development/Testing: 1-3 nodes, minimal subnet allocation"
  },
  professional: {
    publicSubnets: 2,
    privateSubnets: 2,
    subnetSize: 23,      // /23 = 512 addresses per subnet (better for HA)
    podsPrefix: 16,
    servicesPrefix: 16,
    description: "Small Production: 3-10 nodes, dual AZ ready"
  },
  enterprise: {
    publicSubnets: 3,
    privateSubnets: 3,
    subnetSize: 23,      // /23 subnets
    podsPrefix: 16,
    servicesPrefix: 16,
    description: "Large Production: 10-50 nodes, triple AZ ready with HA"
  },
  hyperscale: {
    publicSubnets: 8,
    privateSubnets: 8,
    subnetSize: 20,      // /20 = 4096 addresses per subnet (large workloads)
    podsPrefix: 13,      // /13 for massive pod IP space (5000+ nodes)
    servicesPrefix: 16,
    description: "Global Scale: 50-5000 nodes, multi-region ready (EKS/GKE max)"
  }
};
