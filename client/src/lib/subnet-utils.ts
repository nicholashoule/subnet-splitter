/**
 * client/src/lib/subnet-utils.ts
 * 
 * Core subnet calculation utilities. All calculations are pure functions
 * operating on IP addresses and CIDR notation.
 * 
 * Core functions:
 * - calculateSubnet: Parse CIDR and compute subnet details
 * - splitSubnet: Split a subnet into two smaller subnets
 * - parseCidr: Strictly parse CIDR notation into a network number and prefix
 * - validateCidrInput: Form validation for the calculator input
 * - ipToNumber / numberToIp: IP address conversion
 * - prefixToMask / maskToPrefix: Prefix/mask conversion
 * - collectVisibleRows: the calculator table's rows (with depth and parent CIDR)
 * - splitSubnetInTree / removeSplitInTree: immutable tree updates for the table
 * - selectedVisibleSubnets / subnetsToCsv: the CSV export
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

const DIGITS = /^\d+$/;

export function ipToNumber(ip: string): number {
  const octets = ip.split('.');
  if (octets.length !== 4) {
    throw new SubnetCalculationError(`Invalid IP format: ${ip}`);
  }

  let result = 0;
  for (const octet of octets) {
    // Reject anything parseInt would silently truncate (e.g. "1abc", " 1", "")
    const num = DIGITS.test(octet) && octet.length <= 3 ? Number(octet) : NaN;
    if (isNaN(num) || num > 255) {
      throw new SubnetCalculationError(`Invalid IP octet: ${octet}`);
    }
    result = ((result << 8) + num) >>> 0;
  }

  return result;
}

/**
 * Strictly parse CIDR notation. Host bits are masked off, so
 * "10.1.2.3/16" yields the 10.1.0.0 network.
 */
export function parseCidr(cidr: string): { network: number; prefix: number } {
  const parts = cidr.split('/');
  if (parts.length !== 2) {
    throw new SubnetCalculationError(`Invalid CIDR format: ${cidr}`);
  }
  const [ipStr, prefixStr] = parts;
  if (!DIGITS.test(prefixStr)) {
    throw new SubnetCalculationError(`Invalid prefix: ${prefixStr}`);
  }
  const prefix = Number(prefixStr);
  const mask = prefixToMask(prefix);
  return { network: (ipToNumber(ipStr) & mask) >>> 0, prefix };
}

/**
 * Validate calculator input. Returns an error message, or null when valid.
 * Unlike calculateSubnet, this requires the address to already be the
 * network address so users don't silently get a different range.
 */
export function validateCidrInput(value: string): string | null {
  const cidr = value.trim();
  if (!cidr) return "CIDR notation is required";
  let parsed: { network: number; prefix: number };
  try {
    parsed = parseCidr(cidr);
  } catch {
    return "Invalid CIDR format. Use format: 192.168.1.0/24";
  }
  if (ipToNumber(cidr.split('/')[0]) !== parsed.network) {
    return "IP address must be the network address for the given prefix (e.g., 192.168.1.0/24, not 192.168.1.5/24)";
  }
  return null;
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

// Monotonic ids are unique within the page and, unlike crypto.randomUUID(),
// also work on plain-HTTP origins (randomUUID requires a secure context).
let nextSubnetId = 0;

export function calculateSubnet(cidr: string, id?: string): SubnetInfo {
  try {
    const { network: networkAddress, prefix } = parseCidr(cidr);
    const mask = prefixToMask(prefix);
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
      id: id || `subnet-${++nextSubnetId}`,
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
  
  // Enforce tree size limit to prevent memory exhaustion. A split adds two nodes,
  // so refuse any split that would take the tree past the limit.
  if (currentTreeSize + 2 > SUBNET_CALCULATOR_LIMITS.MAX_TREE_NODES) {
    throw new SubnetCalculationError(`Tree size limit (${SUBNET_CALCULATOR_LIMITS.MAX_TREE_NODES} nodes) reached. Cannot split further.`);
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

/** A row of the calculator's subnet table */
export interface VisibleRow {
  subnet: SubnetInfo;
  /** Depth in the tree (0 = the calculated range), also when Hide Parents skips ancestors */
  depth: number;
  /** CIDR of the subnet this row was split from; undefined for the root */
  parentCidr?: string;
}

/**
 * The rows the subnet table shows, depth-first in address order. A split row's
 * children show while it is expanded; with hideParents, rows that have children
 * are left out and their descendants show instead. The table, "select all" and
 * the CSV export all read this list, so they always agree on what is visible.
 */
export function collectVisibleRows(root: SubnetInfo, hideParents: boolean): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const visit = (subnet: SubnetInfo, depth: number, parentCidr: string | undefined) => {
    const children = subnet.children ?? [];
    const hasChildren = children.length > 0;
    if (!(hideParents && hasChildren)) rows.push({ subnet, depth, parentCidr });
    if (hasChildren && (hideParents || subnet.isExpanded)) {
      for (const child of children) visit(child, depth + 1, subnet.cidr);
    }
  };
  visit(root, 0, undefined);
  return rows;
}

export function collectVisibleSubnets(subnet: SubnetInfo, hideParents: boolean): SubnetInfo[] {
  return collectVisibleRows(subnet, hideParents).map((row) => row.subnet);
}

export function findSubnetById(subnet: SubnetInfo, targetId: string): SubnetInfo | null {
  if (subnet.id === targetId) return subnet;
  for (const child of subnet.children ?? []) {
    const found = findSubnetById(child, targetId);
    if (found) return found;
  }
  return null;
}

export function findParentOf(subnet: SubnetInfo, childId: string): SubnetInfo | null {
  for (const child of subnet.children ?? []) {
    if (child.id === childId) return subnet;
    const found = findParentOf(child, childId);
    if (found) return found;
  }
  return null;
}

/**
 * Replaces one node, copying only the nodes on the path from the root to it.
 * Every other subtree keeps its object identity, so memoized table rows for
 * them skip re-rendering. Returns the same root when targetId is not found.
 */
export function updateSubnetInTree(
  subnet: SubnetInfo,
  targetId: string,
  updateFn: (s: SubnetInfo) => SubnetInfo
): SubnetInfo {
  if (subnet.id === targetId) return updateFn(subnet);
  if (!subnet.children) return subnet;
  let changed = false;
  const children = subnet.children.map((child) => {
    const next = updateSubnetInTree(child, targetId, updateFn);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...subnet, children } : subnet;
}

/**
 * Splits one leaf of the tree into its two halves and expands it, without
 * mutating the tree. Returns null when the node is missing, already split, or a
 * /32. Throws SubnetCalculationError when the whole tree (every node, collapsed
 * or hidden ones included) would grow past MAX_TREE_NODES.
 */
export function splitSubnetInTree(
  root: SubnetInfo,
  id: string
): { root: SubnetInfo; children: SubnetInfo[] } | null {
  const target = findSubnetById(root, id);
  if (!target || !target.canSplit || target.children?.length) return null;

  const children = splitSubnet(target, countSubnetNodes(root));
  return {
    root: updateSubnetInTree(root, id, (subnet) => ({ ...subnet, children, isExpanded: true })),
    children,
  };
}

/**
 * Removes the split that produced childId: its parent loses both halves and
 * everything below them. Returns null for the root or an unknown id.
 */
export function removeSplitInTree(
  root: SubnetInfo,
  childId: string
): { root: SubnetInfo; parent: SubnetInfo } | null {
  const parent = findParentOf(root, childId);
  if (!parent) return null;

  const restored: SubnetInfo = { ...parent, children: undefined, isExpanded: false };
  return { root: updateSubnetInTree(root, parent.id, () => restored), parent: restored };
}

/**
 * The rows the CSV export writes: selected rows among the visible ones, in table
 * order. A selected id whose row is gone (split removed, Hide Parents on) is skipped.
 */
export function selectedVisibleSubnets(visible: SubnetInfo[], selectedIds: ReadonlySet<string>): SubnetInfo[] {
  return visible.filter((subnet) => selectedIds.has(subnet.id));
}

export const CSV_HEADERS = ["CIDR", "Network Address", "Broadcast Address", "First Host", "Last Host", "Usable Hosts", "Total Hosts", "Subnet Mask", "Wildcard Mask", "Prefix"];

/** CSV text for the export: a header line, then one quoted line per subnet */
export function subnetsToCsv(subnets: SubnetInfo[]): string {
  const rows = subnets.map((s) => [
    s.cidr,
    s.networkAddress,
    s.broadcastAddress,
    s.firstHost,
    s.lastHost,
    s.usableHosts.toString(),
    s.totalHosts.toString(),
    s.subnetMask,
    s.wildcardMask,
    `/${s.prefix}`,
  ]);
  return [
    CSV_HEADERS.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");
}

/**
 * Get Tailwind CSS classes for depth indicator visual hierarchy
 * @param depth - Tree depth (0 = root, >0 = child)
 * @param prefix - CIDR prefix length (1-32)
 * @returns Tailwind CSS className string
 */
export function getDepthIndicatorClasses(depth: number, prefix: number): string {
  const baseClasses = "w-1.5 h-7 rounded-full shadow-xs border";
  
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
