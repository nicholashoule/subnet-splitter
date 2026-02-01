/**
 * client/src/lib/kubernetes-network-generator.ts
 * 
 * Kubernetes network planning service
 * Generates IP ranges for EKS, GKE, and generic Kubernetes deployments
 * Supports multiple deployment sizes with battle-tested configurations
 */

import type {
  DeploymentSize,
  Provider,
  KubernetesNetworkPlan,
  KubernetesNetworkPlanRequest,
  SubnetConfig,
  DeploymentTierConfig
} from "@shared/kubernetes-schema";
import {
  DEPLOYMENT_TIER_CONFIGS,
  KubernetesNetworkPlanSchema,
  KubernetesNetworkPlanRequestSchema
} from "@shared/kubernetes-schema";
import { ipToNumber, numberToIp, calculateSubnet } from "./subnet-utils";

export class KubernetesNetworkGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KubernetesNetworkGenerationError";
  }
}

/**
 * Generate a random RFC 1918 private address space
 * Returns one of: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 */
function generateRandomRFC1918VPC(): string {
  const rfc1918Ranges = [
    { base: 10, prefix: 8 },
    { base: 172, prefix: 12 },
    { base: 192, prefix: 16 }
  ];

  const range = rfc1918Ranges[Math.floor(Math.random() * rfc1918Ranges.length)];
  
  if (range.prefix === 8) {
    const secondOctet = Math.floor(Math.random() * 256);
    return `${range.base}.${secondOctet}.0.0/16`;
  } else if (range.prefix === 12) {
    // 172.16.0.0 - 172.31.255.255
    const secondOctet = 16 + Math.floor(Math.random() * 16);
    return `172.${secondOctet}.0.0/16`;
  } else {
    // 192.168.0.0 - 192.168.255.255
    const thirdOctet = Math.floor(Math.random() * 256);
    return `192.168.${thirdOctet}.0/16`;
  }
}

/**
 * Calculate the network address from a CIDR
 * Ensures we're working with proper subnet boundaries
 */
function normalizeVpcCidr(vpcCidr: string): string {
  try {
    const subnet = calculateSubnet(vpcCidr);
    return subnet.cidr;
  } catch (error) {
    throw new KubernetesNetworkGenerationError(
      `Invalid VPC CIDR "${vpcCidr}": ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Split a VPC CIDR into subnets for the given deployment tier
 */
function generateSubnets(
  vpcCidr: string,
  config: DeploymentTierConfig,
  subnetType: "public" | "private"
): SubnetConfig[] {
  const vpcNum = ipToNumber(vpcCidr.split("/")[0]);
  const vpcPrefix = parseInt(vpcCidr.split("/")[1], 10);
  
  if (vpcPrefix >= config.subnetSize) {
    throw new KubernetesNetworkGenerationError(
      `VPC prefix /${vpcPrefix} is too small. Cannot split into /${config.subnetSize} subnets`
    );
  }

  const subnets: SubnetConfig[] = [];
  const subnetCount = subnetType === "public" 
    ? config.publicSubnets 
    : config.privateSubnets;

  // Calculate step size in IP addresses
  const subnetAddresses = Math.pow(2, 32 - config.subnetSize);
  
  // Generate subnets
  for (let i = 0; i < subnetCount; i++) {
    const subnetStart = vpcNum + (i * subnetAddresses);
    const subnetIp = numberToIp(subnetStart);
    
    subnets.push({
      cidr: `${subnetIp}/${config.subnetSize}`,
      name: `${subnetType}-${i + 1}`,
      type: subnetType,
      availabilityZone: undefined // Multi-AZ support in future
    });
  }

  return subnets;
}

/**
 * Generate the next available CIDR block after VPC subnets
 */
function generateNextCidr(vpcCidr: string, subnetCount: number, subnetSize: number, prefix: number): string {
  const vpcNum = ipToNumber(vpcCidr.split("/")[0]);
  const subnetAddresses = Math.pow(2, 32 - subnetSize);
  
  // Start after all subnets
  const nextStart = vpcNum + (subnetCount * subnetAddresses);
  const nextIp = numberToIp(nextStart);
  
  return `${nextIp}/${prefix}`;
}

/**
 * Generate a complete Kubernetes network plan
 */
export async function generateKubernetesNetworkPlan(
  request: unknown
): Promise<KubernetesNetworkPlan> {
  // Validate input
  const validatedRequest = KubernetesNetworkPlanRequestSchema.parse(request);

  // Get VPC CIDR (generate if not provided)
  const vpcCidr = validatedRequest.vpcCidr 
    ? normalizeVpcCidr(validatedRequest.vpcCidr)
    : generateRandomRFC1918VPC();

  // Get deployment tier config
  const tierConfig = DEPLOYMENT_TIER_CONFIGS[validatedRequest.deploymentSize];
  if (!tierConfig) {
    throw new KubernetesNetworkGenerationError(
      `Unknown deployment size: ${validatedRequest.deploymentSize}`
    );
  }

  // Generate public and private subnets
  const publicSubnets = generateSubnets(vpcCidr, tierConfig, "public");
  const privateSubnets = generateSubnets(vpcCidr, tierConfig, "private");

  // Calculate total subnets used for offset
  const totalSubnets = publicSubnets.length + privateSubnets.length;

  // Generate Pod and Services CIDR blocks (non-overlapping with VPC)
  // These are typically in different RFC 1918 ranges or secondary VPC CIDR
  const podsCidr = generateNextCidr(vpcCidr, totalSubnets, tierConfig.subnetSize, tierConfig.podsPrefix);
  const servicesCidr = generateNextCidr(podsCidr, 1, tierConfig.podsPrefix, tierConfig.servicesPrefix);

  // Build the network plan
  const plan: KubernetesNetworkPlan = {
    deploymentSize: validatedRequest.deploymentSize,
    provider: validatedRequest.provider,
    deploymentName: validatedRequest.deploymentName,
    vpc: {
      cidr: vpcCidr
    },
    subnets: {
      public: publicSubnets,
      private: privateSubnets
    },
    pods: {
      cidr: podsCidr
    },
    services: {
      cidr: servicesCidr
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      version: "1.0"
    }
  };

  // Validate output
  return KubernetesNetworkPlanSchema.parse(plan);
}

/**
 * Get information about deployment tiers
 */
export function getDeploymentTierInfo(size?: DeploymentSize): Record<string, unknown> {
  if (size) {
    const config = DEPLOYMENT_TIER_CONFIGS[size];
    if (!config) {
      throw new KubernetesNetworkGenerationError(`Unknown deployment size: ${size}`);
    }
    return {
      size,
      ...config
    };
  }

  // Return all tiers
  const tiers: Record<string, unknown> = {};
  for (const [tierName, config] of Object.entries(DEPLOYMENT_TIER_CONFIGS)) {
    tiers[tierName] = config;
  }
  return tiers;
}
