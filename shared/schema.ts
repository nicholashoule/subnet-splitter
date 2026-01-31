import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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

export const cidrInputSchema = z.object({
  cidr: z.string()
    .min(1, "CIDR notation is required")
    .regex(
      /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/,
      "Invalid CIDR format. Use format: 192.168.1.0/24"
    )
    .refine((val) => {
      const parts = val.split('/');
      const ip = parts[0].split('.').map(Number);
      const prefix = parseInt(parts[1]);
      
      // Validate IP octets
      if (!ip.every(octet => octet >= 0 && octet <= 255)) {
        return false;
      }
      
      // Validate prefix
      if (prefix < 0 || prefix > 32) {
        return false;
      }
      
      // Validate that IP matches network address for this prefix
      const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
      const ipNum = ip.reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;
      const networkNum = (ipNum & mask) >>> 0;
      
      // IP must be the network address
      return ipNum === networkNum;
    }, "IP address must be the network address for the given prefix (e.g., 192.168.1.0/24, not 192.168.1.5/24)")
});

export type CidrInput = z.infer<typeof cidrInputSchema>;

// Constants for robustness
export const SUBNET_CALCULATOR_LIMITS = {
  MAX_SPLIT_DEPTH: 32, // Prevent splitting beyond /32
  MAX_TREE_NODES: 10000, // Prevent memory exhaustion
  MAX_CALCULATION_TIME: 5000, // 5 second timeout for calculations
} as const;
