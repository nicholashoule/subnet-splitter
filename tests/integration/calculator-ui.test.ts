/**
 * tests/integration/calculator-ui.test.ts
 *
 * Tests the calculator page's logic: the functions in client/src/lib/subnet-utils.ts
 * that client/src/pages/calculator.tsx calls, chained the way the page uses them.
 * No React is rendered (the project has no DOM test environment), so markup,
 * clipboard, toasts and the CSV download itself are not covered here.
 *
 * Coverage:
 * - Form validation (validateCidrInput) before calculation (calculateSubnet)
 * - Splitting rows, and the tree size limit the page enforces with countSubnetNodes
 * - Visible rows (collectVisibleSubnets): expansion and Hide Parents, which also
 *   decide what "select all" picks and which selected rows are exported
 * - Network class badge (getSubnetClass) and depth indicator (getDepthIndicatorClasses)
 */

import { describe, it, expect } from "vitest";
import {
  calculateSubnet,
  splitSubnet,
  countSubnetNodes,
  collectVisibleSubnets,
  getSubnetClass,
  getDepthIndicatorClasses,
  validateCidrInput,
  ipToNumber,
  SubnetCalculationError,
} from "@/lib/subnet-utils";
import { SUBNET_CALCULATOR_LIMITS, type SubnetInfo } from "@shared/schema";

const FORMAT_ERROR = "Invalid CIDR format. Use format: 192.168.1.0/24";

/** Split a row as the page does: limit checked against the whole tree, row expanded */
function splitRow(root: SubnetInfo, row: SubnetInfo): SubnetInfo[] {
  row.children = splitSubnet(row, countSubnetNodes(root));
  row.isExpanded = true;
  return row.children;
}

const cidrsOf = (rows: SubnetInfo[]) => rows.map((row) => row.cidr);

describe("Calculator Form Validation", () => {
  it("should accept network addresses in CIDR notation, ignoring surrounding spaces", () => {
    const valid = ["192.168.1.0/24", "10.0.0.0/8", "172.16.0.0/12", "0.0.0.0/0", "192.168.1.1/32", "  10.0.0.0/8  "];

    for (const input of valid) {
      expect(validateCidrInput(input)).toBeNull();
      // The page calculates from the trimmed value once validation passes
      expect(calculateSubnet(input.trim()).cidr).toBe(input.trim());
    }
  });

  it("should require a value", () => {
    expect(validateCidrInput("")).toBe("CIDR notation is required");
    expect(validateCidrInput("   ")).toBe("CIDR notation is required");
  });

  it("should reject malformed input with a format hint", () => {
    const malformed = [
      "192.168.1.0",        // missing prefix
      "192.168.1.0/33",     // prefix out of range
      "192.168.1.0/abc",
      "192.168.1.0/24/8",
      "192.168/24",         // too few octets
      "not-an-ip",
      "256.0.0.0/8",        // octet out of range, in each position
      "1.256.1.1/16",
      "1.1.256.1/24",
      "1.1.1.256/32",
      "-1.0.0.0/8",
    ];

    for (const input of malformed) {
      expect(validateCidrInput(input)).toBe(FORMAT_ERROR);
      expect(() => calculateSubnet(input)).toThrow(SubnetCalculationError);
    }
  });

  it("should reject an address with host bits set instead of silently changing it", () => {
    expect(validateCidrInput("192.168.1.5/24")).toMatch(/must be the network address/);
    expect(validateCidrInput("10.1.2.3/16")).toMatch(/must be the network address/);
    expect(validateCidrInput("10.1.0.0/16")).toBeNull();

    // calculateSubnet alone would normalize to a different range, which is why the form validates first
    expect(calculateSubnet("192.168.1.5/24").cidr).toBe("192.168.1.0/24");
  });
});

describe("Subnet Splitting", () => {
  it("should split a row into two halves that exactly cover it", () => {
    const root = calculateSubnet("10.0.0.0/22");
    const [low, high] = splitRow(root, root);
    const [lowLow, lowHigh] = splitRow(root, low);

    expect(cidrsOf([low, high])).toEqual(["10.0.0.0/23", "10.0.2.0/23"]);
    expect(cidrsOf([lowLow, lowHigh])).toEqual(["10.0.0.0/24", "10.0.1.0/24"]);

    for (const [parent, a, b] of [[root, low, high], [low, lowLow, lowHigh]]) {
      expect(a.networkAddress).toBe(parent.networkAddress);
      expect(b.broadcastAddress).toBe(parent.broadcastAddress);
      expect(ipToNumber(b.networkAddress)).toBe(ipToNumber(a.broadcastAddress) + 1);
      expect(a.totalHosts + b.totalHosts).toBe(parent.totalHosts);
    }
  });

  it("should count every node in the tree toward the size limit", () => {
    const root = calculateSubnet("10.0.0.0/16");
    expect(countSubnetNodes(root)).toBe(1);

    const [first] = splitRow(root, root);
    splitRow(root, first);
    expect(countSubnetNodes(root)).toBe(5);

    // Collapsed children are not rows, but they still take memory, so they still count
    root.isExpanded = false;
    expect(collectVisibleSubnets(root, false)).toHaveLength(1);
    expect(countSubnetNodes(root)).toBe(5);
  });

  it("should refuse any split that would take the tree past the node limit", () => {
    const limit = SUBNET_CALCULATOR_LIMITS.MAX_TREE_NODES;
    const subnet = calculateSubnet("10.0.0.0/8");

    // A split adds two nodes: from limit - 2 the tree ends exactly at the limit
    expect(splitSubnet(subnet, limit - 2)).toHaveLength(2);
    // From limit - 1 it would end at limit + 1
    expect(() => splitSubnet(subnet, limit - 1)).toThrow(SubnetCalculationError);
    expect(() => splitSubnet(subnet, limit - 1)).toThrow(`Tree size limit (${limit} nodes) reached`);
  });
});

describe("Visible Rows", () => {
  /** 192.168.0.0/22 split once, with its first half split again */
  function nestedTree(): SubnetInfo {
    const root = calculateSubnet("192.168.0.0/22");
    const [first] = splitRow(root, root);
    splitRow(root, first);
    return root;
  }

  it("should show a split row's children only while it is expanded", () => {
    const root = calculateSubnet("10.0.0.0/16");
    root.children = splitSubnet(root);

    root.isExpanded = false;
    expect(cidrsOf(collectVisibleSubnets(root, false))).toEqual(["10.0.0.0/16"]);

    root.isExpanded = true;
    expect(cidrsOf(collectVisibleSubnets(root, false))).toEqual(["10.0.0.0/16", "10.0.0.0/17", "10.0.128.0/17"]);
  });

  it("should list rows depth-first in address order", () => {
    expect(cidrsOf(collectVisibleSubnets(nestedTree(), false))).toEqual([
      "192.168.0.0/22",
      "192.168.0.0/23",
      "192.168.0.0/24",
      "192.168.1.0/24",
      "192.168.2.0/23",
    ]);
  });

  it("should show only leaf rows when Hide Parents is on", () => {
    const rows = collectVisibleSubnets(nestedTree(), true);

    expect(cidrsOf(rows)).toEqual(["192.168.0.0/24", "192.168.1.0/24", "192.168.2.0/23"]);
    for (const row of rows) expect(row.children).toBeUndefined();
  });

  it("should select and export only rows that are visible", () => {
    const root = nestedTree();
    const [first, second] = root.children!;
    // "Select all" while every row is shown
    const selected = new Set(collectVisibleSubnets(root, false).map((row) => row.id));
    // The page exports the selected rows among the visible ones
    const exported = (hideParents: boolean) =>
      collectVisibleSubnets(root, hideParents).filter((row) => selected.has(row.id));

    expect(exported(false)).toHaveLength(5);
    // Hide Parents: the selected parents are no longer rows, so they are not exported
    expect(cidrsOf(exported(true))).toEqual(["192.168.0.0/24", "192.168.1.0/24", "192.168.2.0/23"]);

    // Removing the first split makes that row a leaf again; its selected children are gone
    first.children = undefined;
    first.isExpanded = false;
    expect(cidrsOf(exported(true))).toEqual([first.cidr, second.cidr]);
    expect(cidrsOf(exported(false))).toEqual([root.cidr, first.cidr, second.cidr]);
  });
});

describe("Network Class Badge", () => {
  it("should classify each row by its first octet, whatever the prefix", () => {
    expect(getSubnetClass(calculateSubnet("10.0.0.0/8"))).toBe("A");
    expect(getSubnetClass(calculateSubnet("10.20.0.0/16"))).toBe("A");
    expect(getSubnetClass(calculateSubnet("172.16.0.0/12"))).toBe("B");
    expect(getSubnetClass(calculateSubnet("192.168.0.0/16"))).toBe("C");
    expect(getSubnetClass(calculateSubnet("224.0.0.0/4"))).toBe("D (Multicast)");
    expect(getSubnetClass(calculateSubnet("240.0.0.0/4"))).toBe("E (Reserved)");
  });

  it("should classify the halves of a split separately", () => {
    // 192.0.0.0/2 spans first octets 192-255, so its halves fall in different classes
    const root = calculateSubnet("192.0.0.0/2");
    const [low, high] = splitRow(root, root);

    expect(getSubnetClass(low)).toBe("C");
    expect(getSubnetClass(high)).toBe("D (Multicast)");
    expect(getSubnetClass(splitRow(root, high)[1])).toBe("E (Reserved)");
  });
});

describe("Depth Indicator Visual Hierarchy", () => {
  it("should render transparent indicator for root subnets (depth === 0)", () => {
    const subnet = calculateSubnet("192.168.1.0/24");
    const classes = getDepthIndicatorClasses(0, subnet.prefix);
    
    expect(classes).toContain("border-transparent");
    expect(classes).toContain("bg-transparent");
    expect(classes).not.toContain("border-red");
    expect(classes).not.toContain("bg-red");
  });

  it("should render colored indicator for non-root subnets (depth > 0)", () => {
    const subnet = calculateSubnet("192.168.1.0/25");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).not.toContain("border-transparent");
    expect(classes).not.toContain("bg-transparent");
    expect(classes).toContain("border-");
    expect(classes).toContain("bg-");
  });

  it("should use red-600 color for prefix === 1", () => {
    const subnet = calculateSubnet("128.0.0.0/1");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("border-red-300/30");
    expect(classes).toContain("bg-red-600");
  });

  it("should use orange-600 color for prefix === 2", () => {
    const subnet = calculateSubnet("192.0.0.0/2");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("border-orange-300/30");
    expect(classes).toContain("bg-orange-600");
  });

  it("should use yellow-500 color for prefix === 3", () => {
    const subnet = calculateSubnet("224.0.0.0/3");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("border-yellow-300/30");
    expect(classes).toContain("bg-yellow-500");
  });

  it("should use blue-600 color for prefix === 10", () => {
    const subnet = calculateSubnet("10.0.0.0/10");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("border-blue-300/30");
    expect(classes).toContain("bg-blue-600");
  });

  it("should use purple-600 color for prefix === 13", () => {
    const subnet = calculateSubnet("10.0.0.0/13");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("border-purple-300/30");
    expect(classes).toContain("bg-purple-600");
  });

  it("should use rose-600 color for prefix === 16", () => {
    const subnet = calculateSubnet("10.0.0.0/16");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("border-rose-300/30");
    expect(classes).toContain("bg-rose-600");
  });

  it("should use emerald-500 color for prefix === 23", () => {
    const subnet = calculateSubnet("192.168.0.0/23");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("border-emerald-300/30");
    expect(classes).toContain("bg-emerald-500");
  });

  it("should use teal-500 color for prefix === 24", () => {
    const subnet = calculateSubnet("192.168.1.0/24");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("border-teal-300/30");
    expect(classes).toContain("bg-teal-500");
  });

  it("should use pink-500 color for prefix === 32", () => {
    const subnet = calculateSubnet("192.168.1.1/32");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("border-pink-300/30");
    expect(classes).toContain("bg-pink-500");
  });

  it("should use default slate-500 color for unknown prefix values", () => {
    // A child row's prefix is always 1-32; anything else falls back to slate
    const classes = getDepthIndicatorClasses(1, 0);
    
    expect(classes).toContain("border-slate-300/30");
    expect(classes).toContain("bg-slate-500");
  });

  it("should include base styling classes for all indicators", () => {
    const subnet = calculateSubnet("10.0.0.0/16");
    const classes = getDepthIndicatorClasses(1, subnet.prefix);
    
    expect(classes).toContain("w-1.5");
    expect(classes).toContain("h-7");
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("shadow-xs"); // Tailwind v4 name for v3's shadow-sm (same shadow)
    expect(classes).toContain("border");
  });

  it("should apply different colors for different prefix values", () => {
    const prefix8 = calculateSubnet("10.0.0.0/8");
    const prefix16 = calculateSubnet("172.16.0.0/16");
    const prefix24 = calculateSubnet("192.168.1.0/24");
    
    const classes8 = getDepthIndicatorClasses(1, prefix8.prefix);
    const classes16 = getDepthIndicatorClasses(1, prefix16.prefix);
    const classes24 = getDepthIndicatorClasses(1, prefix24.prefix);
    
    // All should have base classes
    expect(classes8).toContain("w-1.5");
    expect(classes16).toContain("w-1.5");
    expect(classes24).toContain("w-1.5");
    
    // But different color classes
    expect(classes8).not.toEqual(classes16);
    expect(classes16).not.toEqual(classes24);
    expect(classes8).not.toEqual(classes24);
  });

  it("should maintain transparency for root regardless of prefix", () => {
    const prefix1 = calculateSubnet("128.0.0.0/1");
    const prefix16 = calculateSubnet("10.0.0.0/16");
    const prefix32 = calculateSubnet("192.168.1.1/32");
    
    const classes1 = getDepthIndicatorClasses(0, prefix1.prefix);
    const classes16 = getDepthIndicatorClasses(0, prefix16.prefix);
    const classes32 = getDepthIndicatorClasses(0, prefix32.prefix);
    
    // All should be transparent for depth === 0
    expect(classes1).toContain("border-transparent bg-transparent");
    expect(classes16).toContain("border-transparent bg-transparent");
    expect(classes32).toContain("border-transparent bg-transparent");
    
    // All should be identical for root level
    expect(classes1).toEqual(classes16);
    expect(classes16).toEqual(classes32);
  });
});
