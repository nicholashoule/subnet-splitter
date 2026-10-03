// shared/schema.ts
//
// Shared types and limits for the subnet calculator: used by the client
// (subnet-utils.ts, the calculator page), its tests, and the server indirectly
// (server/routes.ts imports the plan generator, which uses subnet-utils.ts).
// Intentionally dependency-free so the client bundle does not pull in a
// validation library.
//

// Subnet Calculator Types
export interface SubnetInfo {
  id: string;
  cidr: string;
  networkAddress: string;
  broadcastAddress: string;
  firstHost: string;
  lastHost: string;
  totalHosts: number;
  usableHosts: number;
  subnetMask: string;
  wildcardMask: string;
  prefix: number;
  canSplit: boolean;
  children?: SubnetInfo[];
  isExpanded?: boolean;
}

// Constants for robustness
export const SUBNET_CALCULATOR_LIMITS = {
  MAX_TREE_NODES: 10000, // Prevent memory exhaustion
} as const;
