/**
 * Test script to demonstrate the improved network CIDR allocation
 * Run with: npx tsx tests/manual/test-network-validation.ts
 */

import { generateKubernetesNetworkPlan } from "../../client/src/lib/kubernetes-network-generator";
import { ipToNumber, numberToIp } from "../../client/src/lib/subnet-utils";

async function testNetworkPlan() {
  console.log("Testing Kubernetes Network Plan Generation\n");
  console.log("=".repeat(80));
  
  const request = {
    deploymentSize: "hyperscale" as const,
    provider: "eks" as const,
    vpcCidr: "10.42.192.0/18",
    region: "us-east-1",
    deploymentName: "prod-eks-us-east-1"
  };
  
  const plan = await generateKubernetesNetworkPlan(request);
  
  console.log("\nReport Generated Network Plan:\n");
  console.log(JSON.stringify(plan, null, 2));
  
  // Parse the CIDRs for validation
  const vpcCidr = plan.vpc.cidr;
  const podsCidr = plan.pods.cidr;
  const servicesCidr = plan.services.cidr;
  
  console.log("\n" + "=".repeat(80));
  console.log("\nSearch Validation Results:\n");
  
  // Extract IP ranges
  const vpcRange = getCidrRange(vpcCidr);
  const podsRange = getCidrRange(podsCidr);
  const servicesRange = getCidrRange(servicesCidr);
  
  console.log(`VPC Range:      ${vpcCidr.padEnd(20)} -> ${vpcRange.start} - ${vpcRange.end}`);
  console.log(`Pods Range:     ${podsCidr.padEnd(20)} -> ${podsRange.start} - ${podsRange.end}`);
  console.log(`Services Range: ${servicesCidr.padEnd(20)} -> ${servicesRange.start} - ${servicesRange.end}`);
  
  // Check RFC 1918 major blocks
  const vpcBlock = getRFC1918Block(vpcCidr);
  const podsBlock = getRFC1918Block(podsCidr);
  const servicesBlock = getRFC1918Block(servicesCidr);
  
  console.log("\nMap RFC 1918 Major Blocks:\n");
  console.log(`VPC:      ${vpcBlock}`);
  console.log(`Pods:     ${podsBlock}`);
  console.log(`Services: ${servicesBlock}`);
  
  // Validation checks
  console.log("\n[PASS] Validation Checks:\n");
  
  const podsWithinVpc = isWithinRange(podsRange, vpcRange);
  const servicesWithinVpc = isWithinRange(servicesRange, vpcRange);
  const podsBlockSameAsVpc = vpcBlock === podsBlock;
  const servicesBlockSameAsVpc = vpcBlock === servicesBlock;
  
  console.log(`[${podsWithinVpc ? '[FAIL] FAIL' : '[PASS] PASS'}] Pods OUTSIDE VPC range: ${!podsWithinVpc}`);
  console.log(`[${servicesWithinVpc ? '[FAIL] FAIL' : '[PASS] PASS'}] Services OUTSIDE VPC range: ${!servicesWithinVpc}`);
  console.log(`[${!podsBlockSameAsVpc ? '[PASS] PASS' : 'WARNING  WARN'}] Pods in different RFC 1918 block: ${!podsBlockSameAsVpc}`);
  console.log(`[${!servicesBlockSameAsVpc ? '[PASS] PASS' : 'WARNING  WARN'}] Services in different RFC 1918 block: ${!servicesBlockSameAsVpc}`);
  
  console.log("\n" + "=".repeat(80));
  
  if (!podsWithinVpc && !servicesWithinVpc && !podsBlockSameAsVpc && !servicesBlockSameAsVpc) {
    console.log("\n[PASS] All validation checks passed!");
    console.log("   - Pods and Services are OUTSIDE the VPC range (as expected for overlay networks)");
    console.log("   - Each uses a SEPARATE RFC 1918 major block (10.x, 172.x, or 192.168.x)");
    console.log("   - No confusing overlaps or partial overlaps\n");
  }
}

function getCidrRange(cidr: string): { start: string, end: string } {
  const [ip, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  
  const ipNum = ipToNumber(ip);
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  const networkNum = (ipNum & mask) >>> 0;
  const broadcastNum = (networkNum | (~mask >>> 0)) >>> 0;
  
  return {
    start: numberToIp(networkNum),
    end: numberToIp(broadcastNum)
  };
}

function getRFC1918Block(cidr: string): string {
  const ip = cidr.split("/")[0];
  const firstOctet = parseInt(ip.split(".")[0], 10);
  
  if (firstOctet === 10) return "10.0.0.0/8 (Class A)";
  if (firstOctet === 172) return "172.16.0.0/12 (Class B)";
  if (firstOctet === 192) return "192.168.0.0/16 (Class C)";
  return "Unknown";
}

function isWithinRange(inner: { start: string, end: string }, outer: { start: string, end: string }): boolean {
  const innerStart = ipToNumber(inner.start);
  const innerEnd = ipToNumber(inner.end);
  const outerStart = ipToNumber(outer.start);
  const outerEnd = ipToNumber(outer.end);
  
  return innerStart >= outerStart && innerEnd <= outerEnd;
}

testNetworkPlan().catch(console.error);
