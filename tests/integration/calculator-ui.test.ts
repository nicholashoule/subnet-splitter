/**
 * tests/integration/calculator-ui.test.ts
 *
 * Tests the calculator page's logic. client/src/pages/calculator.tsx keeps no tree,
 * row or export logic of its own: it calls the pure functions in
 * client/src/lib/subnet-utils.ts, and these tests call the same functions in the
 * order the page does. No React is rendered (the project has no DOM test
 * environment), so markup, focus, clipboard, toasts and the download itself are
 * not covered here.
 *
 * Coverage:
 * - Form validation (validateCidrInput) before calculation (calculateSubnet)
 * - Split and remove-split tree updates (splitSubnetInTree, removeSplitInTree):
 *   results, the tree size limit, and copying only the path to the change
 * - Table rows (collectVisibleRows): expansion, Hide Parents, depth and parent CIDR
 * - CSV export (selectedVisibleSubnets, subnetsToCsv): only visible selected rows
 * - Network class badge (getSubnetClass) and depth bar classes (getDepthIndicatorClasses)
 */

import { describe, it, expect } from "vitest";
import {
  calculateSubnet,
  splitSubnet,
  countSubnetNodes,
  collectVisibleRows,
  collectVisibleSubnets,
  splitSubnetInTree,
  removeSplitInTree,
  selectedVisibleSubnets,
  subnetsToCsv,
  getSubnetClass,
  getDepthIndicatorClasses,
  validateCidrInput,
  ipToNumber,
  SubnetCalculationError,
} from "@/lib/subnet-utils";
import { SUBNET_CALCULATOR_LIMITS, type SubnetInfo } from "@shared/schema";

const FORMAT_ERROR = "Invalid CIDR format. Use format: 192.168.1.0/24";

/** The node with this CIDR anywhere in the tree (test lookup, not page logic) */
function nodeAt(root: SubnetInfo, cidr: string): SubnetInfo {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.cidr === cidr) return node;
    stack.push(...(node.children ?? []));
  }
  throw new Error(`${cidr} is not in the tree`);
}

/** Presses Split on the row with this CIDR; returns the new tree */
function split(root: SubnetInfo, cidr: string): SubnetInfo {
  const result = splitSubnetInTree(root, nodeAt(root, cidr).id);
  if (!result) throw new Error(`${cidr} cannot be split`);
  return result.root;
}

/** 192.168.0.0/22 split once, with its first half split again */
function nestedTree(): SubnetInfo {
  return split(split(calculateSubnet("192.168.0.0/22"), "192.168.0.0/22"), "192.168.0.0/23");
}

/** A fixture tree of exactly `size` nodes (odd: every split adds two), split breadth-first */
function treeOfSize(size: number): SubnetInfo {
  const root = calculateSubnet("10.0.0.0/8");
  const queue = [root];
  for (let count = 1; count < size; count += 2) {
    const node = queue.shift()!;
    node.children = splitSubnet(node);
    node.isExpanded = true;
    queue.push(...node.children);
  }
  return root;
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

describe("Splitting Rows (splitSubnetInTree)", () => {
  it("should split a row into two expanded halves that exactly cover it", () => {
    const root = split(split(calculateSubnet("10.0.0.0/22"), "10.0.0.0/22"), "10.0.0.0/23");
    const [low, high] = root.children!;
    const [lowLow, lowHigh] = low.children!;

    expect(root.isExpanded).toBe(true);
    expect(low.isExpanded).toBe(true);
    expect(cidrsOf([low, high])).toEqual(["10.0.0.0/23", "10.0.2.0/23"]);
    expect(cidrsOf([lowLow, lowHigh])).toEqual(["10.0.0.0/24", "10.0.1.0/24"]);

    for (const [parent, a, b] of [[root, low, high], [low, lowLow, lowHigh]]) {
      expect(a.networkAddress).toBe(parent.networkAddress);
      expect(b.broadcastAddress).toBe(parent.broadcastAddress);
      expect(ipToNumber(b.networkAddress)).toBe(ipToNumber(a.broadcastAddress) + 1);
      expect(a.totalHosts + b.totalHosts).toBe(parent.totalHosts);
    }
  });

  it("should return the new halves, which the page focuses and announces", () => {
    const root = calculateSubnet("10.0.0.0/16");
    const result = splitSubnetInTree(root, root.id)!;

    expect(result.children).toBe(result.root.children);
    expect(cidrsOf(result.children)).toEqual(["10.0.0.0/17", "10.0.128.0/17"]);
  });

  it("should leave the tree unchanged for a missing, already split, or /32 row", () => {
    const root = nestedTree();
    const host = calculateSubnet("192.168.1.1/32");

    expect(splitSubnetInTree(root, "no-such-id")).toBeNull();
    expect(splitSubnetInTree(root, root.id)).toBeNull();
    expect(splitSubnetInTree(root, nodeAt(root, "192.168.0.0/23").id)).toBeNull();
    expect(splitSubnetInTree(host, host.id)).toBeNull();
  });

  it("should not mutate the tree and copy only the path to the split row", () => {
    const before = nestedTree();
    const after = split(before, "192.168.1.0/24");

    // The old tree is untouched (React state must not be mutated)
    expect(nodeAt(before, "192.168.1.0/24").children).toBeUndefined();
    expect(countSubnetNodes(before)).toBe(5);
    expect(countSubnetNodes(after)).toBe(7);

    // The split row and its ancestors are new objects...
    for (const cidr of ["192.168.0.0/22", "192.168.0.0/23", "192.168.1.0/24"]) {
      expect(nodeAt(after, cidr)).not.toBe(nodeAt(before, cidr));
    }
    // ...every other subtree is shared, so memoized rows for them skip re-rendering
    for (const cidr of ["192.168.2.0/23", "192.168.0.0/24"]) {
      expect(nodeAt(after, cidr)).toBe(nodeAt(before, cidr));
    }
  });

  it("should count every node in the tree toward the size limit, including collapsed and hidden rows", () => {
    const limit = SUBNET_CALCULATOR_LIMITS.MAX_TREE_NODES;

    // The rule splitSubnetInTree applies: a split adds two nodes, so from limit - 2 the
    // tree ends exactly at the limit and from limit - 1 it would end at limit + 1
    const subnet = calculateSubnet("10.0.0.0/8");
    expect(splitSubnet(subnet, limit - 2)).toHaveLength(2);
    expect(() => splitSubnet(subnet, limit - 1)).toThrow(`Tree size limit (${limit} nodes) reached`);

    // A tree two splits below the limit still splits (trees always have an odd size)...
    const roomy = treeOfSize(limit - 3);
    const leaf = collectVisibleRows(roomy, true).at(-1)!.subnet;
    expect(countSubnetNodes(splitSubnetInTree(roomy, leaf.id)!.root)).toBe(limit - 1);

    // ...one more split, and nothing splits, though only the root row is on screen
    const full = split(roomy, leaf.cidr);
    full.isExpanded = false;
    expect(collectVisibleRows(full, false)).toHaveLength(1);
    const anyLeaf = collectVisibleRows(full, true)[0].subnet;
    expect(() => splitSubnetInTree(full, anyLeaf.id)).toThrow(SubnetCalculationError);
    expect(() => splitSubnetInTree(full, anyLeaf.id)).toThrow(`Tree size limit (${limit} nodes) reached`);
  });
});

describe("Removing a Split (removeSplitInTree)", () => {
  it("should restore the parent of the row: both halves and everything below them go", () => {
    const root = nestedTree();

    // From a /24 row: its /23 parent becomes a collapsed leaf again
    const inner = removeSplitInTree(root, nodeAt(root, "192.168.1.0/24").id)!;
    expect(inner.parent.cidr).toBe("192.168.0.0/23");
    expect(nodeAt(inner.root, "192.168.0.0/23").children).toBeUndefined();
    expect(nodeAt(inner.root, "192.168.0.0/23").isExpanded).toBe(false);
    expect(countSubnetNodes(inner.root)).toBe(3);

    // From the second /23 row: the root's split goes, with the nested split under its sibling
    const outer = removeSplitInTree(root, nodeAt(root, "192.168.2.0/23").id)!;
    expect(outer.parent.cidr).toBe("192.168.0.0/22");
    expect(outer.root.children).toBeUndefined();
    expect(countSubnetNodes(outer.root)).toBe(1);
  });

  it("should act on the parent CIDR each row's remove button is named after", () => {
    const root = nestedTree();
    const rows = collectVisibleRows(root, false).filter((row) => row.parentCidr);

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(removeSplitInTree(root, row.subnet.id)!.parent.cidr).toBe(row.parentCidr);
    }
  });

  it("should not mutate the tree and copy only the path to the restored parent", () => {
    const before = nestedTree();
    const after = removeSplitInTree(before, nodeAt(before, "192.168.0.0/24").id)!.root;

    expect(countSubnetNodes(before)).toBe(5);
    expect(after).not.toBe(before);
    expect(nodeAt(after, "192.168.2.0/23")).toBe(nodeAt(before, "192.168.2.0/23"));
  });

  it("should do nothing for the root row or an unknown id", () => {
    const root = nestedTree();
    expect(removeSplitInTree(root, root.id)).toBeNull();
    expect(removeSplitInTree(root, "no-such-id")).toBeNull();
  });
});

describe("Table Rows (collectVisibleRows)", () => {
  const describeRows = (root: SubnetInfo, hideParents: boolean) =>
    collectVisibleRows(root, hideParents).map(({ subnet, depth, parentCidr }) => [subnet.cidr, depth, parentCidr]);

  it("should show a split row's children only while it is expanded", () => {
    const root = split(calculateSubnet("10.0.0.0/16"), "10.0.0.0/16");

    expect(describeRows(root, false)).toEqual([
      ["10.0.0.0/16", 0, undefined],
      ["10.0.0.0/17", 1, "10.0.0.0/16"],
      ["10.0.128.0/17", 1, "10.0.0.0/16"],
    ]);

    root.isExpanded = false;
    expect(describeRows(root, false)).toEqual([["10.0.0.0/16", 0, undefined]]);
  });

  it("should list rows depth-first in address order, with depth and parent CIDR", () => {
    expect(describeRows(nestedTree(), false)).toEqual([
      ["192.168.0.0/22", 0, undefined],
      ["192.168.0.0/23", 1, "192.168.0.0/22"],
      ["192.168.0.0/24", 2, "192.168.0.0/23"],
      ["192.168.1.0/24", 2, "192.168.0.0/23"],
      ["192.168.2.0/23", 1, "192.168.0.0/22"],
    ]);
  });

  it("should show only leaf rows when Hide Parents is on, keeping their tree depth and parent", () => {
    expect(describeRows(nestedTree(), true)).toEqual([
      ["192.168.0.0/24", 2, "192.168.0.0/23"],
      ["192.168.1.0/24", 2, "192.168.0.0/23"],
      ["192.168.2.0/23", 1, "192.168.0.0/22"],
    ]);
  });

  it("should list the same subnets as collectVisibleSubnets", () => {
    const root = nestedTree();
    for (const hideParents of [false, true]) {
      expect(collectVisibleRows(root, hideParents).map((row) => row.subnet)).toEqual(collectVisibleSubnets(root, hideParents));
    }
  });

  it("should keep the subnet objects of rows a split did not touch", () => {
    const tree = nestedTree();
    const before = collectVisibleRows(tree, false);
    const after = collectVisibleRows(split(tree, "192.168.2.0/23"), false);
    const rowFor = (rows: typeof before, cidr: string) => rows.find((row) => row.subnet.cidr === cidr)!.subnet;

    for (const cidr of ["192.168.0.0/23", "192.168.0.0/24", "192.168.1.0/24"]) {
      expect(rowFor(after, cidr)).toBe(rowFor(before, cidr));
    }
    // The split row and the root above it are new, so only those rows re-render
    expect(rowFor(after, "192.168.2.0/23")).not.toBe(rowFor(before, "192.168.2.0/23"));
    expect(rowFor(after, "192.168.0.0/22")).not.toBe(rowFor(before, "192.168.0.0/22"));
  });
});

describe("CSV Export (selectedVisibleSubnets, subnetsToCsv)", () => {
  it("should export only the selected rows that are visible, in table order", () => {
    const root = nestedTree();
    const visible = (tree: SubnetInfo, hideParents: boolean) => collectVisibleSubnets(tree, hideParents);
    // "Select all" while every row is shown
    const selected = new Set(visible(root, false).map((row) => row.id));

    expect(selectedVisibleSubnets(visible(root, false), selected)).toHaveLength(5);
    // Hide Parents: the selected parents are no longer rows, so they are not exported
    expect(cidrsOf(selectedVisibleSubnets(visible(root, true), selected))).toEqual(["192.168.0.0/24", "192.168.1.0/24", "192.168.2.0/23"]);

    // Removing the first split makes that row a leaf again; its selected children are gone
    const restored = removeSplitInTree(root, nodeAt(root, "192.168.0.0/24").id)!.root;
    expect(cidrsOf(selectedVisibleSubnets(visible(restored, true), selected))).toEqual(["192.168.0.0/23", "192.168.2.0/23"]);
    expect(cidrsOf(selectedVisibleSubnets(visible(restored, false), selected))).toEqual(["192.168.0.0/22", "192.168.0.0/23", "192.168.2.0/23"]);

    // Selection order does not matter: rows come out in table order
    const reversed = new Set([...selected].reverse());
    expect(cidrsOf(selectedVisibleSubnets(visible(root, false), reversed))).toEqual(cidrsOf(visible(root, false)));
  });

  it("should write a header line and one quoted line per subnet", () => {
    const csv = subnetsToCsv([calculateSubnet("192.168.1.0/30"), calculateSubnet("10.0.0.0/8")]);

    expect(csv.split("\n")).toEqual([
      "CIDR,Network Address,Broadcast Address,First Host,Last Host,Usable Hosts,Total Hosts,Subnet Mask,Wildcard Mask,Prefix",
      '"192.168.1.0/30","192.168.1.0","192.168.1.3","192.168.1.1","192.168.1.2","2","4","255.255.255.252","0.0.0.3","/30"',
      '"10.0.0.0/8","10.0.0.0","10.255.255.255","10.0.0.1","10.255.255.254","16777214","16777216","255.0.0.0","0.255.255.255","/8"',
    ]);
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
    const root = split(split(calculateSubnet("192.0.0.0/2"), "192.0.0.0/2"), "224.0.0.0/3");

    expect(getSubnetClass(nodeAt(root, "192.0.0.0/3"))).toBe("C");
    expect(getSubnetClass(nodeAt(root, "224.0.0.0/3"))).toBe("D (Multicast)");
    expect(getSubnetClass(nodeAt(root, "240.0.0.0/4"))).toBe("E (Reserved)");
  });
});

describe("Depth Bar Classes (getDepthIndicatorClasses)", () => {
  // Compare whole class tokens: "border" must not be satisfied by "border-rose-300/30"
  const tokens = (depth: number, prefix: number) => getDepthIndicatorClasses(depth, prefix).split(/\s+/);

  it("should give the root row (depth 0) a transparent bar, whatever the prefix", () => {
    for (const prefix of [1, 16, 32]) {
      expect(tokens(0, prefix)).toEqual(expect.arrayContaining(["border-transparent", "bg-transparent"]));
      expect(tokens(0, prefix)).toEqual(tokens(0, 16));
    }
  });

  it("should give child rows (depth > 0) a colored bar", () => {
    const classes = tokens(1, 25);

    expect(classes).not.toContain("border-transparent");
    expect(classes).not.toContain("bg-transparent");
    expect(classes.filter((token) => /^bg-[a-z]+-\d{3}$/.test(token))).toHaveLength(1);
    expect(classes.filter((token) => /^border-[a-z]+-\d{3}\/30$/.test(token))).toHaveLength(1);
  });

  it.each([
    [1, "border-red-300/30", "bg-red-600"],
    [2, "border-orange-300/30", "bg-orange-600"],
    [3, "border-yellow-300/30", "bg-yellow-500"],
    [10, "border-blue-300/30", "bg-blue-600"],
    [13, "border-purple-300/30", "bg-purple-600"],
    [16, "border-rose-300/30", "bg-rose-600"],
    [23, "border-emerald-300/30", "bg-emerald-500"],
    [24, "border-teal-300/30", "bg-teal-500"],
    [32, "border-pink-300/30", "bg-pink-500"],
  ])("should color a /%i child row's bar %s %s", (prefix, border, background) => {
    expect(tokens(1, prefix)).toEqual(expect.arrayContaining([border, background]));
  });

  it("should fall back to slate for a prefix outside 1-32", () => {
    // A child row's prefix is always 1-32; anything else falls back to slate
    expect(tokens(1, 0)).toEqual(expect.arrayContaining(["border-slate-300/30", "bg-slate-500"]));
  });

  it("should include the base bar classes at every depth", () => {
    for (const depth of [0, 1, 5]) {
      // shadow-xs is Tailwind v4's name for v3's shadow-sm (same shadow)
      expect(tokens(depth, 16)).toEqual(expect.arrayContaining(["w-1.5", "h-7", "rounded-full", "shadow-xs", "border"]));
    }
  });

  it("should use different colors for different prefixes", () => {
    const classes = [8, 16, 24].map((prefix) => getDepthIndicatorClasses(1, prefix));
    expect(new Set(classes).size).toBe(3);
  });
});
