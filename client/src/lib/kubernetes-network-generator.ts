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
  PROVIDER_REGION_EXAMPLES,
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
 * @returns true if IP is private, false if public or invalid
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const octets = parts.map(p => parseInt(p, 10));

  // Validate all octets are numbers in range 0-255
  if (octets.some(o => Number.isNaN(o) || o < 0 || o > 255)) return false;

  const [first, second] = octets;

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
 * @param region Optional region (uses provider default if not specified)
 * @returns Array of AZ identifiers
 */
function getAvailabilityZones(subnetCount: number, provider: Provider, region?: string): string[] {
  const azs: string[] = [];
  const normalizedProvider = normalizeProvider(provider);
  
  // Get region from parameter or use provider default
  const providerConfig = PROVIDER_REGION_EXAMPLES[normalizedProvider] || PROVIDER_REGION_EXAMPLES.kubernetes;
  const effectiveRegion = region || providerConfig.default;
  
  if (normalizedProvider === "eks") {
    // AWS EKS - use letter suffixes (a, b, c, d, e, f)
    const azLetters = ["a", "b", "c", "d", "e", "f"];
    for (let i = 0; i < subnetCount; i++) {
      const letter = azLetters[i % azLetters.length];
      azs.push(`${effectiveRegion}${letter}`);
    }
  } else if (normalizedProvider === "gke") {
    // GKE - use letter suffixes for zones
    const zoneLetters = ["a", "b", "c", "d", "e", "f"];
    for (let i = 0; i < subnetCount; i++) {
      const letter = zoneLetters[i % zoneLetters.length];
      azs.push(`${effectiveRegion}-${letter}`);
    }
  } else if (normalizedProvider === "aks") {
    // AKS - use numerical zones
    for (let i = 0; i < subnetCount; i++) {
      const zone = (i % 3) + 1;
      azs.push(`${effectiveRegion}-${zone}`);
    }
  } else {
    // Generic Kubernetes - use numerical zones
    for (let i = 0; i < subnetCount; i++) {
      const zone = (i % 3) + 1;
      azs.push(`zone-${zone}`);
    }
  }
  
  return azs;
}

/**
 * Split a VPC CIDR into subnets for the given deployment tier
 * Automatically distributes subnets across availability zones
 * Uses differentiated sizing: public subnets are smaller than private
 * @param offset Starting byte offset for subnet placement
 * @param region Optional region for AZ naming
 */
function generateSubnets(
  vpcCidr: string,
  config: DeploymentTierConfig,
  subnetType: "public" | "private",
  provider: Provider,
  offset: number = 0,
  region?: string
): SubnetConfig[] {
  const vpcNum = ipToNumber(vpcCidr.split("/")[0]);
  const vpcPrefix = parseInt(vpcCidr.split("/")[1], 10);
  
  // Use differentiated subnet sizes: public subnets are smaller than private
  const subnetSize = subnetType === "public" 
    ? config.publicSubnetSize 
    : config.privateSubnetSize;
  
  if (vpcPrefix >= subnetSize) {
    throw new KubernetesNetworkGenerationError(
      `VPC prefix /${vpcPrefix} is too small. Cannot split into /${subnetSize} ${subnetType} subnets`
    );
  }

  const subnets: SubnetConfig[] = [];
  const subnetCount = subnetType === "public" 
    ? config.publicSubnets 
    : config.privateSubnets;

  // Calculate step size in IP addresses for this subnet type
  const subnetAddresses = Math.pow(2, 32 - subnetSize);
  
  // Get availability zone assignments
  const azs = getAvailabilityZones(subnetCount, provider, region);
  
  // Generate subnets with AZ distribution (starting after offset)
  for (let i = 0; i < subnetCount; i++) {
    const subnetStart = vpcNum + offset + (i * subnetAddresses);
    const subnetIp = numberToIp(subnetStart);
    
    subnets.push({
      cidr: `${subnetIp}/${subnetSize}`,
      name: `${subnetType}-${i + 1}`,
      type: subnetType,
      availabilityZone: azs[i]
    });
  }

  return subnets;
}

/**
 * Calculate total IP addresses used by a set of subnets
 */
function calculateTotalSubnetBytes(subnetCount: number, subnetSize: number): number {
  return subnetCount * Math.pow(2, 32 - subnetSize);
}

/**
 * Generate the next available CIDR block after a given offset
 */
function generateCidrAtOffset(vpcCidr: string, byteOffset: number, prefix: number): string {
  const vpcNum = ipToNumber(vpcCidr.split("/")[0]);
  const nextStart = vpcNum + byteOffset;
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

  // Normalize provider alias (e.g., "k8s" -> "kubernetes")
  const provider = normalizeProvider(validatedRequest.provider);
  
  // Get region (use provider default if not specified)
  const providerConfig = PROVIDER_REGION_EXAMPLES[provider] || PROVIDER_REGION_EXAMPLES.kubernetes;
  const region = validatedRequest.region || providerConfig.default;
  
  // Generate public subnets (start at VPC base)
  const publicSubnets = generateSubnets(vpcCidr, tierConfig, "public", provider, 0, region);
  
  // Calculate byte offset for private subnets (after all public subnets)
  const publicBytesUsed = calculateTotalSubnetBytes(tierConfig.publicSubnets, tierConfig.publicSubnetSize);
  
  // Generate private subnets (start after public subnets)
  const privateSubnets = generateSubnets(vpcCidr, tierConfig, "private", provider, publicBytesUsed, region);
  
  // Calculate total bytes used by all subnets
  const privateBytesUsed = calculateTotalSubnetBytes(tierConfig.privateSubnets, tierConfig.privateSubnetSize);
  const totalSubnetBytes = publicBytesUsed + privateBytesUsed;

  // Generate Pod and Services CIDR blocks (non-overlapping with VPC subnets)
  // These are typically in different RFC 1918 ranges or secondary VPC CIDR
  const podsCidr = generateCidrAtOffset(vpcCidr, totalSubnetBytes, tierConfig.podsPrefix);
  
  // Services CIDR starts after pods CIDR
  const podBytes = Math.pow(2, 32 - tierConfig.podsPrefix);
  const servicesCidr = generateCidrAtOffset(vpcCidr, totalSubnetBytes + podBytes, tierConfig.servicesPrefix);

  // Build the network plan
  const plan: KubernetesNetworkPlan = {
    deploymentSize: validatedRequest.deploymentSize,
    provider: provider,  // Use normalized provider
    region: region,      // Include region in response
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
