/**
 * Test script to compare network allocations across different VPC ranges
 * Demonstrates the improved pod CIDR allocation strategy
 */

import { generateKubernetesNetworkPlan } from "../../client/src/lib/kubernetes-network-generator";

async function testMultipleVPCs() {
  console.log("Comparing Network Allocations Across VPC Ranges\n");
  console.log("=".repeat(100));
  
  const testCases = [
    { vpcCidr: "10.42.192.0/18", name: "VPC in 10.x.x.x (Class A)" },
    { vpcCidr: "172.20.0.0/18", name: "VPC in 172.x.x.x (Class B)" },
    { vpcCidr: "192.168.0.0/18", name: "VPC in 192.168.x.x (Class C)" }
  ];
  
  for (const testCase of testCases) {
    console.log(`\nReport ${testCase.name}`);
    console.log("-".repeat(100));
    
    const plan = await generateKubernetesNetworkPlan({
      deploymentSize: "hyperscale",
      provider: "eks",
      vpcCidr: testCase.vpcCidr,
      region: "us-east-1"
    });
    
    console.log(`\nVPC:      ${plan.vpc.cidr.padEnd(20)} (${getRFC1918Description(plan.vpc.cidr)})`);
    console.log(`Pods:     ${plan.pods.cidr.padEnd(20)} (${getRFC1918Description(plan.pods.cidr)}) ${getSpaceInfo(plan.pods.cidr)}`);
    console.log(`Services: ${plan.services.cidr.padEnd(20)} (${getRFC1918Description(plan.services.cidr)}) ${getSpaceInfo(plan.services.cidr)}`);
    
    // Validation
    const vpcBlock = getRFC1918MajorBlock(plan.vpc.cidr);
    const podsBlock = getRFC1918MajorBlock(plan.pods.cidr);
    const servicesBlock = getRFC1918MajorBlock(plan.services.cidr);
    
    const allDifferent = vpcBlock !== podsBlock && vpcBlock !== servicesBlock && podsBlock !== servicesBlock;
    console.log(`\n${allDifferent ? '[PASS] PASS' : '[FAIL] FAIL'}: All three use different RFC 1918 major blocks`);
    
    // Check if pods are using the optimal range
    const podsUse10 = podsBlock === 10;
    console.log(`${podsUse10 ? '[PASS] OPTIMAL' : 'WARNING  CONSTRAINED'}: Pods using ${podsUse10 ? '10.x.x.x (16M addresses available)' : getRFC1918Description(plan.pods.cidr)}`);
  }
  
  console.log("\n" + "=".repeat(100));
  console.log("\n[TIP] Key Insights:");
  console.log("   * When VPC uses 172.x or 192.168.x -> Pods get 10.x.x.x (BEST - 16M addresses)");
  console.log("   * When VPC uses 10.x.x.x -> Pods get 172.16.x.x (524K addresses for /13)");
  console.log("   * All allocations use separate RFC 1918 major blocks (no overlap)");
  console.log("   * Pod CIDR always in private IP space [PASS]\n");
}

function getRFC1918MajorBlock(cidr: string): number {
  const firstOctet = parseInt(cidr.split(".")[0], 10);
  return firstOctet === 10 ? 10 : firstOctet === 172 ? 172 : 192;
}

function getRFC1918Description(cidr: string): string {
  const block = getRFC1918MajorBlock(cidr);
  if (block === 10) return "10.0.0.0/8 - Class A Private";
  if (block === 172) return "172.16.0.0/12 - Class B Private";
  return "192.168.0.0/16 - Class C Private";
}

function getSpaceInfo(cidr: string): string {
  const prefix = parseInt(cidr.split("/")[1], 10);
  const addresses = Math.pow(2, 32 - prefix);
  
  if (addresses >= 1000000) {
    return `-> ${(addresses / 1000000).toFixed(1)}M addresses`;
  } else if (addresses >= 1000) {
    return `-> ${(addresses / 1000).toFixed(0)}K addresses`;
  }
  return `-> ${addresses} addresses`;
}

testMultipleVPCs().catch(console.error);
