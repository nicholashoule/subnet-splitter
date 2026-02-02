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
  KubernetesNetworkPlanRequestSchema,
  normalizeProvider
} from "@shared/kubernetes-schema";
import { ipToNumber, numberToIp, calculateSubnet } from "./subnet-utils";

export class KubernetesNetworkGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KubernetesNetworkGenerationError";
  }
}

/**
 * Check if an IP address is in a private RFC 1918 range
 * Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 * @returns true if IP is private, false if public
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const first = parseInt(parts[0], 10);
  const second = parseInt(parts[1], 10);

  // Class A private: 10.0.0.0/8
  if (first === 10) return true;

  // Class B private: 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (first === 172 && second >= 16 && second <= 31) return true;

  // Class C private: 192.168.0.0/16
  if (first === 192 && second === 168) return true;

  return false;
}

/**
 * Validate that a CIDR uses private IP space (RFC 1918)
 * Kubernetes deployments MUST use private IPs for security
 * Public IPs expose the cluster to the internet (security anti-pattern)
 */
function validatePrivateCIDR(cidr: string): void {
  try {
    const ipPart = cidr.split("/")[0];
    if (!isPrivateIP(ipPart)) {
      throw new KubernetesNetworkGenerationError(
        `VPC CIDR "${cidr}" uses public IP space. Kubernetes deployments MUST use private RFC 1918 ranges: ` +
        `10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16. ` +
        `Public IPs expose nodes to the internet (critical security risk). ` +
        `Use private subnets for Kubernetes nodes and public subnets only for load balancers/ingress controllers.`
      );
    }
  } catch (error) {
    if (error instanceof KubernetesNetworkGenerationError) throw error;
    throw new KubernetesNetworkGenerationError(`Invalid CIDR format: ${cidr}`);
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
 * Validates that CIDR uses private RFC 1918 IP space
 */
function normalizeVpcCidr(vpcCidr: string): string {
  try {
    // Validate it's a private CIDR first (security requirement)
    validatePrivateCIDR(vpcCidr);
    
    // Then normalize to network address
    const subnet = calculateSubnet(vpcCidr);
    return subnet.cidr;
  } catch (error) {
    if (error instanceof KubernetesNetworkGenerationError) throw error;
    throw new KubernetesNetworkGenerationError(
      `Invalid VPC CIDR "${vpcCidr}": ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get availability zone assignments for subnets
 * AWS/GKE/AKS best practices recommend minimum 3 AZs for production
 * @param subnetCount Total number of subnets to distribute
 * @param provider Cloud provider (affects AZ naming)
 * @returns Array of AZ identifiers
 */
function getAvailabilityZones(subnetCount: number, provider: Provider): string[] {
  const azs: string[] = [];
  
  // AWS availability zones: us-east-1a, us-east-1b, us-east-1c, etc.
  // GKE zones: us-central1-a, us-central1-b, us-central1-c, etc.
  // AKS zones: 1, 2, 3 (numerical zones)
  
  if (provider === "eks") {
    // AWS EKS - use letter suffixes (a, b, c, d, e, f, g, h)
    const azLetters = ["a", "b", "c", "d", "e", "f", "g", "h"];
    for (let i = 0; i < subnetCount; i++) {
      const letter = azLetters[i % azLetters.length];
      azs.push(`<region>-${letter}`);
    }
  } else if (provider === "gke") {
    // GKE - use letter suffixes for zones
    const zoneLetters = ["a", "b", "c", "d", "e", "f", "g", "h"];
    for (let i = 0; i < subnetCount; i++) {
      const letter = zoneLetters[i % zoneLetters.length];
      azs.push(`<region>-${letter}`);
    }
  } else {
    // Generic Kubernetes or AKS - use numerical zones
    const maxZones = 3; // Standard for most cloud providers
    for (let i = 0; i < subnetCount; i++) {
      const zone = (i % maxZones) + 1;
      azs.push(`zone-${zone}`);
    }
  }
  
  return azs;
}

/**
 * Split a VPC CIDR into subnets for the given deployment tier
 * Automatically distributes subnets across availability zones
 * @param offset Number of subnets to skip (for private subnets to start after public)
 */
function generateSubnets(
  vpcCidr: string,
  config: DeploymentTierConfig,
  subnetType: "public" | "private",
  provider: Provider,
  offset: number = 0
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
  
  // Get availability zone assignments
  const azs = getAvailabilityZones(subnetCount, provider);
  
  // Generate subnets with AZ distribution (starting after offset)
  for (let i = 0; i < subnetCount; i++) {
    const subnetStart = vpcNum + ((offset + i) * subnetAddresses);
    const subnetIp = numberToIp(subnetStart);
    
    subnets.push({
      cidr: `${subnetIp}/${config.subnetSize}`,
      name: `${subnetType}-${i + 1}`,
      type: subnetType,
      availabilityZone: azs[i]
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

  // Generate public and private subnets with AZ distribution
  // Normalize provider alias (e.g., "k8s" -> "kubernetes")
  const provider = normalizeProvider(validatedRequest.provider);
  const publicSubnets = generateSubnets(vpcCidr, tierConfig, "public", provider);
  // Private subnets start AFTER public subnets to prevent overlap
  const privateSubnets = generateSubnets(vpcCidr, tierConfig, "private", provider, tierConfig.publicSubnets);

  // Calculate total subnets used for offset
  const totalSubnets = publicSubnets.length + privateSubnets.length;

  // Generate Pod and Services CIDR blocks (non-overlapping with VPC)
  // These are typically in different RFC 1918 ranges or secondary VPC CIDR
  const podsCidr = generateNextCidr(vpcCidr, totalSubnets, tierConfig.subnetSize, tierConfig.podsPrefix);
  const servicesCidr = generateNextCidr(podsCidr, 1, tierConfig.podsPrefix, tierConfig.servicesPrefix);

  // Build the network plan
  const plan: KubernetesNetworkPlan = {
    deploymentSize: validatedRequest.deploymentSize,
    provider: provider,  // Use normalized provider
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
