/**
 * client/src/lib/subnet-utils.ts
 * 
 * Core subnet calculation utilities. All calculations are pure functions
 * operating on IP addresses and CIDR notation.
 * 
 * Core functions:
 * - calculateSubnet: Parse CIDR and compute subnet details
 * - splitSubnet: Split a subnet into two smaller subnets
 * - ipToNumber / numberToIp: IP address conversion
 * - prefixToMask / maskToPrefix: Prefix/mask conversion
 * 
 * Validation:
 * - Memory limits to prevent tree explosion
 * - Strict CIDR format validation
 * - Error handling with SubnetCalculationError
 */

import type { SubnetInfo } from "@shared/schema";
import { SUBNET_CALCULATOR_LIMITS } from "@shared/schema";

// Error class for subnet calculation errors
export class SubnetCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubnetCalculationError";
  }
}

export function ipToNumber(ip: string): number {
  const octets = ip.split('.');
  if (octets.length !== 4) {
    throw new SubnetCalculationError(`Invalid IP format: ${ip}`);
  }
  
  let result = 0;
  for (const octet of octets) {
    const num = parseInt(octet, 10);
    if (isNaN(num) || num < 0 || num > 255) {
      throw new SubnetCalculationError(`Invalid IP octet: ${octet}`);
    }
    result = ((result << 8) + num) >>> 0;
  }
  
  return result;
}

export function numberToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ].join('.');
}

export function prefixToMask(prefix: number): number {
  if (prefix < 0 || prefix > 32) {
    throw new SubnetCalculationError(`Invalid prefix length: ${prefix}. Must be between 0 and 32.`);
  }
  if (prefix === 0) return 0;
  if (prefix === 32) return 0xffffffff;
  return (~0 << (32 - prefix)) >>> 0;
}

export function maskToPrefix(mask: number): number {
  let prefix = 0;
  let m = mask;
  while (m & 0x80000000) {
    prefix++;
    m = (m << 1) >>> 0;
  }
  return prefix;
}

export function calculateSubnet(cidr: string, id?: string): SubnetInfo {
  try {
    const parts = cidr.split('/');
    if (parts.length !== 2) {
      throw new SubnetCalculationError(`Invalid CIDR format: ${cidr}`);
    }
    
    const [ipStr, prefixStr] = parts;
    const prefix = parseInt(prefixStr, 10);
    
    if (isNaN(prefix)) {
      throw new SubnetCalculationError(`Invalid prefix: ${prefixStr}`);
    }
    
    const ip = ipToNumber(ipStr);
    const mask = prefixToMask(prefix);
  
  const networkAddress = (ip & mask) >>> 0;
  const broadcastAddress = (networkAddress | (~mask >>> 0)) >>> 0;
  
  const totalHosts = Math.pow(2, 32 - prefix);
  const usableHosts = prefix <= 30 ? totalHosts - 2 : (prefix === 31 ? 2 : 1);
  
  let firstHost: string;
  let lastHost: string;
  
  if (prefix === 32) {
    firstHost = numberToIp(networkAddress);
    lastHost = numberToIp(networkAddress);
  } else if (prefix === 31) {
    firstHost = numberToIp(networkAddress);
    lastHost = numberToIp(broadcastAddress);
  } else {
    firstHost = numberToIp(networkAddress + 1);
    lastHost = numberToIp(broadcastAddress - 1);
  }
  
    const wildcardMask = (~mask >>> 0);
    
    return {
      id: id || crypto.randomUUID(),
      cidr: `${numberToIp(networkAddress)}/${prefix}`,
      networkAddress: numberToIp(networkAddress),
      broadcastAddress: numberToIp(broadcastAddress),
      firstHost,
      lastHost,
      totalHosts,
      usableHosts,
      subnetMask: numberToIp(mask),
      wildcardMask: numberToIp(wildcardMask),
      prefix,
      canSplit: prefix < 32,
      children: undefined,
      isExpanded: false
    };
  } catch (error) {
    if (error instanceof SubnetCalculationError) {
      throw error;
    }
    throw new SubnetCalculationError(`Failed to calculate subnet for ${cidr}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function countSubnetNodes(subnet: SubnetInfo): number {
  let count = 1;
  if (subnet.children) {
    for (const child of subnet.children) {
      count += countSubnetNodes(child);
    }
  }
  return count;
}

export function splitSubnet(subnet: SubnetInfo, currentTreeSize: number = 1): SubnetInfo[] {
  if (!subnet.canSplit) {
    throw new SubnetCalculationError("Cannot split a /32 subnet.");
  }
  
  // Enforce tree size limit to prevent memory exhaustion
  if (currentTreeSize >= SUBNET_CALCULATOR_LIMITS.MAX_TREE_NODES) {
    throw new SubnetCalculationError(`Tree size limit (${SUBNET_CALCULATOR_LIMITS.MAX_TREE_NODES} nodes) exceeded. Cannot split further.`);
  }
  
  const newPrefix = subnet.prefix + 1;
  const networkNum = ipToNumber(subnet.networkAddress);
  const subnetSize = Math.pow(2, 32 - newPrefix);
  
  const firstSubnet = calculateSubnet(`${numberToIp(networkNum)}/${newPrefix}`);
  const secondSubnet = calculateSubnet(`${numberToIp(networkNum + subnetSize)}/${newPrefix}`);
  
  return [firstSubnet, secondSubnet];
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function getSubnetClass(cidr: string | SubnetInfo): string {
  // Extract the first octet from CIDR or SubnetInfo
  let firstOctet: number;
  
  if (typeof cidr === 'string') {
    const ipPart = cidr.split('/')[0];
    firstOctet = parseInt(ipPart.split('.')[0], 10);
  } else if (cidr && cidr.networkAddress) {
    // It's a SubnetInfo object with networkAddress
    const ipPart = cidr.networkAddress;
    firstOctet = parseInt(ipPart.split('.')[0], 10);
  } else {
    // Fallback for invalid input
    return 'Unknown';
  }
  
  if (firstOctet >= 1 && firstOctet <= 126) return 'A';
  if (firstOctet >= 128 && firstOctet <= 191) return 'B';
  if (firstOctet >= 192 && firstOctet <= 223) return 'C';
  if (firstOctet >= 224 && firstOctet <= 239) return 'D (Multicast)';
  if (firstOctet >= 240 && firstOctet <= 255) return 'E (Reserved)';
  return 'Unknown';
}

export function collectAllSubnets(subnet: SubnetInfo): SubnetInfo[] {
  const result: SubnetInfo[] = [subnet];
  if (subnet.children && subnet.isExpanded) {
    for (const child of subnet.children) {
      result.push(...collectAllSubnets(child));
    }
  }
  return result;
}

export function collectVisibleSubnets(subnet: SubnetInfo, hideParents: boolean): SubnetInfo[] {
  const hasChildren = subnet.children && subnet.children.length > 0;
  
  // If hiding parents and this subnet has children, skip it and collect children
  if (hideParents && hasChildren && subnet.children) {
    const result: SubnetInfo[] = [];
    for (const child of subnet.children) {
      result.push(...collectVisibleSubnets(child, hideParents));
    }
    return result;
  }
  
  // Otherwise, include this subnet
  const result: SubnetInfo[] = [subnet];
  if (hasChildren && subnet.isExpanded && subnet.children) {
    for (const child of subnet.children) {
      result.push(...collectVisibleSubnets(child, hideParents));
    }
  }
  return result;
}

/**
 * Get Tailwind CSS classes for depth indicator visual hierarchy
 * @param depth - Tree depth (0 = root, >0 = child)
 * @param prefix - CIDR prefix length (1-32)
 * @returns Tailwind CSS className string
 */
export function getDepthIndicatorClasses(depth: number, prefix: number): string {
  const baseClasses = "w-1.5 h-7 rounded-full shadow-sm border";
  
  if (depth === 0) {
    return `${baseClasses} border-transparent bg-transparent`;
  }
  
  let colorClasses: string;
  switch (prefix) {
    case 1: colorClasses = "border-red-300/30 bg-red-600"; break;
    case 2: colorClasses = "border-orange-300/30 bg-orange-600"; break;
    case 3: colorClasses = "border-yellow-300/30 bg-yellow-500"; break;
    case 4: colorClasses = "border-lime-300/30 bg-lime-600"; break;
    case 5: colorClasses = "border-green-300/30 bg-green-600"; break;
    case 6: colorClasses = "border-emerald-300/30 bg-emerald-600"; break;
    case 7: colorClasses = "border-teal-300/30 bg-teal-600"; break;
    case 8: colorClasses = "border-cyan-300/30 bg-cyan-600"; break;
    case 9: colorClasses = "border-sky-300/30 bg-sky-600"; break;
    case 10: colorClasses = "border-blue-300/30 bg-blue-600"; break;
    case 11: colorClasses = "border-indigo-300/30 bg-indigo-600"; break;
    case 12: colorClasses = "border-violet-300/30 bg-violet-600"; break;
    case 13: colorClasses = "border-purple-300/30 bg-purple-600"; break;
    case 14: colorClasses = "border-fuchsia-300/30 bg-fuchsia-600"; break;
    case 15: colorClasses = "border-pink-300/30 bg-pink-600"; break;
    case 16: colorClasses = "border-rose-300/30 bg-rose-600"; break;
    case 17: colorClasses = "border-red-300/30 bg-red-500"; break;
    case 18: colorClasses = "border-orange-300/30 bg-orange-500"; break;
    case 19: colorClasses = "border-amber-300/30 bg-amber-500"; break;
    case 20: colorClasses = "border-yellow-300/30 bg-yellow-400"; break;
    case 21: colorClasses = "border-lime-300/30 bg-lime-500"; break;
    case 22: colorClasses = "border-green-300/30 bg-green-500"; break;
    case 23: colorClasses = "border-emerald-300/30 bg-emerald-500"; break;
    case 24: colorClasses = "border-teal-300/30 bg-teal-500"; break;
    case 25: colorClasses = "border-cyan-300/30 bg-cyan-500"; break;
    case 26: colorClasses = "border-sky-300/30 bg-sky-500"; break;
    case 27: colorClasses = "border-blue-300/30 bg-blue-500"; break;
    case 28: colorClasses = "border-indigo-300/30 bg-indigo-500"; break;
    case 29: colorClasses = "border-violet-300/30 bg-violet-500"; break;
    case 30: colorClasses = "border-purple-300/30 bg-purple-500"; break;
    case 31: colorClasses = "border-fuchsia-300/30 bg-fuchsia-500"; break;
    case 32: colorClasses = "border-pink-300/30 bg-pink-500"; break;
    default: colorClasses = "border-slate-300/30 bg-slate-500";
  }
  
  return `${baseClasses} ${colorClasses}`;
}
