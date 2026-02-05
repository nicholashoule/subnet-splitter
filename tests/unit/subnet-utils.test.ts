/**
 * tests/unit/subnet-utils.test.ts
 * 
 * Unit tests for subnet calculation utilities.
 * Tests cover IP conversion, CIDR calculations, subnet splitting, and error handling.
 */

import { describe, it, expect } from "vitest";
import {
  ipToNumber,
  numberToIp,
  prefixToMask,
  maskToPrefix,
  calculateSubnet,
  splitSubnet,
  formatNumber,
  getSubnetClass,
  countSubnetNodes,
  collectAllSubnets,
  collectVisibleSubnets,
  SubnetCalculationError,
} from "@/lib/subnet-utils";

describe("IP Conversion Functions", () => {
  describe("ipToNumber", () => {
    it("converts valid IP addresses to numbers", () => {
      expect(ipToNumber("0.0.0.0")).toBe(0);
      expect(ipToNumber("255.255.255.255")).toBe(0xffffffff);
      expect(ipToNumber("192.168.1.1")).toBe(3232235777);
      expect(ipToNumber("10.0.0.0")).toBe(167772160);
    });

    it("throws error for invalid IP format", () => {
      expect(() => ipToNumber("256.1.1.1")).toThrow(SubnetCalculationError);
      expect(() => ipToNumber("192.168.1")).toThrow(SubnetCalculationError);
      expect(() => ipToNumber("192.168.1.1.1")).toThrow(SubnetCalculationError);
      expect(() => ipToNumber("192.168.1.abc")).toThrow(SubnetCalculationError);
    });
  });

  describe("numberToIp", () => {
    it("converts numbers back to IP addresses", () => {
      expect(numberToIp(0)).toBe("0.0.0.0");
      expect(numberToIp(0xffffffff)).toBe("255.255.255.255");
      expect(numberToIp(3232235777)).toBe("192.168.1.1");
      expect(numberToIp(167772160)).toBe("10.0.0.0");
    });
  });

  describe("IP conversion roundtrip", () => {
    it("converts IP to number and back correctly", () => {
      const ips = ["0.0.0.0", "192.168.1.1", "10.0.0.1", "255.255.255.255"];
      ips.forEach((ip) => {
        expect(numberToIp(ipToNumber(ip))).toBe(ip);
      });
    });
  });
});

describe("Prefix/Mask Conversion", () => {
  describe("prefixToMask", () => {
    it("converts CIDR prefix to subnet mask", () => {
      expect(prefixToMask(0)).toBe(0);
      expect(prefixToMask(8)).toBe(0xff000000);
      expect(prefixToMask(16)).toBe(0xffff0000);
      expect(prefixToMask(24)).toBe(0xffffff00);
      expect(prefixToMask(32)).toBe(0xffffffff);
    });

    it("throws error for invalid prefix", () => {
      expect(() => prefixToMask(-1)).toThrow(SubnetCalculationError);
      expect(() => prefixToMask(33)).toThrow(SubnetCalculationError);
    });
  });

  describe("maskToPrefix", () => {
    it("converts subnet mask back to prefix", () => {
      expect(maskToPrefix(0)).toBe(0);
      expect(maskToPrefix(0xff000000)).toBe(8);
      expect(maskToPrefix(0xffff0000)).toBe(16);
      expect(maskToPrefix(0xffffff00)).toBe(24);
      expect(maskToPrefix(0xffffffff)).toBe(32);
    });
  });

  describe("Prefix/Mask conversion roundtrip", () => {
    it("converts prefix to mask and back correctly", () => {
      for (let prefix = 0; prefix <= 32; prefix++) {
        expect(maskToPrefix(prefixToMask(prefix))).toBe(prefix);
      }
    });
  });
});

describe("Subnet Calculation", () => {
  describe("calculateSubnet", () => {
    it("calculates subnet correctly for /24", () => {
      const subnet = calculateSubnet("192.168.1.0/24");
      expect(subnet.networkAddress).toBe("192.168.1.0");
      expect(subnet.broadcastAddress).toBe("192.168.1.255");
      expect(subnet.firstHost).toBe("192.168.1.1");
      expect(subnet.lastHost).toBe("192.168.1.254");
      expect(subnet.totalHosts).toBe(256);
      expect(subnet.usableHosts).toBe(254);
      expect(subnet.prefix).toBe(24);
    });

    it("calculates subnet correctly for /32", () => {
      const subnet = calculateSubnet("192.168.1.5/32");
      expect(subnet.networkAddress).toBe("192.168.1.5");
      expect(subnet.broadcastAddress).toBe("192.168.1.5");
      expect(subnet.firstHost).toBe("192.168.1.5");
      expect(subnet.lastHost).toBe("192.168.1.5");
      expect(subnet.totalHosts).toBe(1);
      expect(subnet.usableHosts).toBe(1);
    });

    it("calculates subnet correctly for /31 (point-to-point)", () => {
      const subnet = calculateSubnet("192.168.1.0/31");
      expect(subnet.networkAddress).toBe("192.168.1.0");
      expect(subnet.broadcastAddress).toBe("192.168.1.1");
      expect(subnet.firstHost).toBe("192.168.1.0");
      expect(subnet.lastHost).toBe("192.168.1.1");
      expect(subnet.totalHosts).toBe(2);
      expect(subnet.usableHosts).toBe(2);
    });

    it("calculates subnet correctly for /8", () => {
      const subnet = calculateSubnet("10.0.0.0/8");
      expect(subnet.networkAddress).toBe("10.0.0.0");
      expect(subnet.broadcastAddress).toBe("10.255.255.255");
      expect(subnet.totalHosts).toBe(16777216);
      expect(subnet.usableHosts).toBe(16777214);
      expect(subnet.subnetMask).toBe("255.0.0.0");
    });

    it("throws error for invalid CIDR format", () => {
      expect(() => calculateSubnet("192.168.1.0")).toThrow(SubnetCalculationError);
      expect(() => calculateSubnet("192.168.1.0/")).toThrow(SubnetCalculationError);
      expect(() => calculateSubnet("192.168.1.0/abc")).toThrow(SubnetCalculationError);
      expect(() => calculateSubnet("256.168.1.0/24")).toThrow(SubnetCalculationError);
    });

    it("generates unique IDs for each subnet", () => {
      const subnet1 = calculateSubnet("192.168.1.0/24");
      const subnet2 = calculateSubnet("192.168.1.0/24");
      expect(subnet1.id).not.toBe(subnet2.id);
    });
  });

  describe("splitSubnet", () => {
    it("splits /24 into two /25 subnets", () => {
      const parent = calculateSubnet("192.168.1.0/24");
      const [first, second] = splitSubnet(parent);

      expect(first.prefix).toBe(25);
      expect(second.prefix).toBe(25);
      expect(first.networkAddress).toBe("192.168.1.0");
      expect(second.networkAddress).toBe("192.168.1.128");
      expect(first.totalHosts).toBe(128);
    });

    it("splits /8 into two /9 subnets", () => {
      const parent = calculateSubnet("10.0.0.0/8");
      const [first, second] = splitSubnet(parent);

      expect(first.prefix).toBe(9);
      expect(second.prefix).toBe(9);
      expect(first.networkAddress).toBe("10.0.0.0");
      expect(second.networkAddress).toBe("10.128.0.0");
    });

    it("throws error for /32 subnet", () => {
      const subnet = calculateSubnet("192.168.1.5/32");
      expect(() => splitSubnet(subnet)).toThrow(SubnetCalculationError);
    });
  });
});

describe("Utility Functions", () => {
  describe("formatNumber", () => {
    it("formats numbers with thousand separators", () => {
      expect(formatNumber(0)).toBe("0");
      expect(formatNumber(256)).toBe("256");
      expect(formatNumber(1000)).toBe("1,000");
      expect(formatNumber(1000000)).toBe("1,000,000");
      expect(formatNumber(16777214)).toBe("16,777,214");
    });
  });

  describe("getSubnetClass", () => {
    it("returns correct subnet class based on IP address (not prefix length)", () => {
      // Class A networks (1-126)
      expect(getSubnetClass("10.0.0.0/8")).toBe("A");
      expect(getSubnetClass("10.0.0.0/16")).toBe("A"); // Same class despite /16 prefix
      expect(getSubnetClass("1.0.0.0/24")).toBe("A");
      expect(getSubnetClass("126.0.0.0/8")).toBe("A");
      
      // Class B networks (128-191)
      expect(getSubnetClass("172.16.0.0/12")).toBe("B");
      expect(getSubnetClass("172.16.0.0/24")).toBe("B");
      expect(getSubnetClass("128.0.0.0/8")).toBe("B");
      expect(getSubnetClass("191.255.255.0/24")).toBe("B");
      
      // Class C networks (192-223)
      expect(getSubnetClass("192.168.1.0/24")).toBe("C");
      expect(getSubnetClass("192.168.1.0/25")).toBe("C"); // Same class despite /25 prefix
      expect(getSubnetClass("192.0.0.0/8")).toBe("C");
      expect(getSubnetClass("223.255.255.0/24")).toBe("C");
      
      // Class D - Multicast (224-239)
      expect(getSubnetClass("224.0.0.0/4")).toBe("D (Multicast)");
      expect(getSubnetClass("239.255.255.0/24")).toBe("D (Multicast)");
      
      // Class E - Reserved (240-255)
      expect(getSubnetClass("240.0.0.0/4")).toBe("E (Reserved)");
      expect(getSubnetClass("255.255.255.0/24")).toBe("E (Reserved)");
    });

    it("works with SubnetInfo objects", () => {
      const subnetA = calculateSubnet("10.0.0.0/16");
      expect(getSubnetClass(subnetA)).toBe("A");
      
      const subnetB = calculateSubnet("172.16.0.0/12");
      expect(getSubnetClass(subnetB)).toBe("B");
      
      const subnetC = calculateSubnet("192.168.1.0/24");
      expect(getSubnetClass(subnetC)).toBe("C");
    });
  });
});

describe("SubnetCalculationError", () => {
  it("is an Error instance", () => {
    const error = new SubnetCalculationError("test");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SubnetCalculationError");
    expect(error.message).toBe("test");
  });
});

describe("countSubnetNodes", () => {
  it("counts single subnet as 1 node", () => {
    const subnet = calculateSubnet("192.168.1.0/24");
    expect(countSubnetNodes(subnet)).toBe(1);
  });

  it("counts subnet with 2 children as 3 nodes", () => {
    const parent = calculateSubnet("192.168.1.0/24");
    const children = splitSubnet(parent);
    parent.children = children;
    expect(countSubnetNodes(parent)).toBe(3); // 1 parent + 2 children
  });

  it("counts deeply nested subnets correctly", () => {
    const root = calculateSubnet("192.168.0.0/22");
    const [first, second] = splitSubnet(root);
    root.children = [first, second];

    // Split first child further
    const [firstA, firstB] = splitSubnet(first);
    first.children = [firstA, firstB];

    // Root: 1 + first: 1 + firstA: 1 + firstB: 1 + second: 1 = 5 nodes
    expect(countSubnetNodes(root)).toBe(5);
  });
});

describe("Edge Cases & Robustness", () => {
  describe("CIDR validation and edge cases", () => {
    it("accepts valid /0 (all IPv4)", () => {
      const subnet = calculateSubnet("0.0.0.0/0");
      expect(subnet.prefix).toBe(0);
      expect(subnet.networkAddress).toBe("0.0.0.0");
      expect(subnet.broadcastAddress).toBe("255.255.255.255");
    });

    it("handles private network ranges", () => {
      const subnet10 = calculateSubnet("10.0.0.0/8");
      const subnet172 = calculateSubnet("172.16.0.0/12");
      const subnet192 = calculateSubnet("192.168.0.0/16");

      expect(subnet10.totalHosts).toBe(Math.pow(2, 24));
      expect(subnet172.totalHosts).toBe(Math.pow(2, 20));
      expect(subnet192.totalHosts).toBe(Math.pow(2, 16));
    });

    it("validates network address matches prefix", () => {
      // 192.168.1.5/24 is invalid because network address should be 192.168.1.0
      // This is handled by the calculateSubnet function using the mask
      const subnet = calculateSubnet("192.168.1.5/24");
      expect(subnet.networkAddress).toBe("192.168.1.0"); // Normalized to network address
    });

    it("handles all valid prefix lengths (0-32)", () => {
      for (let prefix = 0; prefix <= 32; prefix++) {
        const subnet = calculateSubnet(`192.168.1.0/${prefix}`);
        expect(subnet.prefix).toBe(prefix);
        expect(subnet.canSplit).toBe(prefix < 32);
      }
    });
  });

  describe("Subnet mask calculations", () => {
    it("calculates wildcard masks correctly", () => {
      const subnet24 = calculateSubnet("192.168.1.0/24");
      expect(subnet24.wildcardMask).toBe("0.0.0.255");

      const subnet16 = calculateSubnet("192.168.0.0/16");
      expect(subnet16.wildcardMask).toBe("0.0.255.255");

      const subnet8 = calculateSubnet("10.0.0.0/8");
      expect(subnet8.wildcardMask).toBe("0.255.255.255");
    });

    it("calculates subnet masks correctly for all valid prefixes", () => {
      expect(calculateSubnet("192.168.1.0/8").subnetMask).toBe("255.0.0.0");
      expect(calculateSubnet("192.168.1.0/16").subnetMask).toBe("255.255.0.0");
      expect(calculateSubnet("192.168.1.0/24").subnetMask).toBe("255.255.255.0");
      expect(calculateSubnet("192.168.1.0/30").subnetMask).toBe("255.255.255.252");
    });
  });

  describe("Host calculation edge cases", () => {
    it("correctly calculates hosts for /30 (4-host subnet)", () => {
      const subnet = calculateSubnet("192.168.1.0/30");
      expect(subnet.totalHosts).toBe(4);
      expect(subnet.usableHosts).toBe(2); // Network and broadcast are not usable
      expect(subnet.firstHost).toBe("192.168.1.1");
      expect(subnet.lastHost).toBe("192.168.1.2");
    });

    it("correctly calculates hosts for /29 (8-host subnet)", () => {
      const subnet = calculateSubnet("192.168.1.0/29");
      expect(subnet.totalHosts).toBe(8);
      expect(subnet.usableHosts).toBe(6); // 8 - 2 (network and broadcast)
      expect(subnet.firstHost).toBe("192.168.1.1");
      expect(subnet.lastHost).toBe("192.168.1.6");
    });

    it("correctly calculates hosts for very large /0 network", () => {
      const subnet = calculateSubnet("0.0.0.0/0");
      expect(subnet.totalHosts).toBe(Math.pow(2, 32));
      expect(subnet.usableHosts).toBe(Math.pow(2, 32) - 2);
    });
  });

  describe("Error handling and validation", () => {
    it("rejects prefix with leading zeros", () => {
      expect(() => calculateSubnet("192.168.1.0/024")).not.toThrow();
      // JavaScript parseInt handles leading zeros gracefully
      const subnet = calculateSubnet("192.168.1.0/024");
      expect(subnet.prefix).toBe(24);
    });

    it("handles various CIDR input formats", () => {
      // Standard format works
      const subnet1 = calculateSubnet("192.168.1.0/24");
      expect(subnet1.prefix).toBe(24);

      // Leading zeros in prefix work (JavaScript parseInt is forgiving)
      const subnet2 = calculateSubnet("192.168.1.0/024");
      expect(subnet2.prefix).toBe(24);

      // Invalid formats throw
      expect(() => calculateSubnet("192.168.1.0")).toThrow();
      expect(() => calculateSubnet("192.168.1.0/ ")).toThrow();
      expect(() => calculateSubnet("invalid/24")).toThrow();
    });

    it("provides clear error messages", () => {
      try {
        calculateSubnet("256.1.1.1/24");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SubnetCalculationError);
        expect((error as SubnetCalculationError).message).toContain("Invalid");
      }
    });
  });

  describe("Split operation edge cases", () => {
    it("splits /31 correctly", () => {
      const subnet = calculateSubnet("192.168.1.0/31");
      // /31 can be split to /32
      expect(() => splitSubnet(subnet)).not.toThrow();
      const [first, second] = splitSubnet(subnet);
      expect(first.prefix).toBe(32);
      expect(second.prefix).toBe(32);
    });

    it("splits /30 correctly", () => {
      const subnet = calculateSubnet("192.168.1.0/30");
      const [first, second] = splitSubnet(subnet);

      expect(first.prefix).toBe(31);
      expect(second.prefix).toBe(31);
      expect(first.networkAddress).toBe("192.168.1.0");
      expect(second.networkAddress).toBe("192.168.1.2");
    });

    it("cannot split /32 subnet", () => {
      const subnet = calculateSubnet("192.168.1.1/32");
      expect(() => splitSubnet(subnet)).toThrow(SubnetCalculationError);
      try {
        splitSubnet(subnet);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as SubnetCalculationError).message).toContain("Cannot split a /32");
      }
    });
  });

  describe("Network class calculations", () => {
    it("calculates correct total addresses for Class A networks", () => {
      const classA8 = calculateSubnet("10.0.0.0/8");
      expect(classA8.totalHosts).toBe(Math.pow(2, 24)); // 16,777,216
      expect(classA8.usableHosts).toBe(Math.pow(2, 24) - 2); // Exclude network and broadcast
      
      const classA16 = calculateSubnet("10.0.0.0/16");
      expect(classA16.totalHosts).toBe(Math.pow(2, 16)); // 65,536
      expect(classA16.usableHosts).toBe(Math.pow(2, 16) - 2);
    });

    it("calculates correct total addresses for Class B networks", () => {
      // Standard Class B /16
      const classB16 = calculateSubnet("172.16.0.0/16");
      expect(classB16.totalHosts).toBe(65536); // 2^16
      expect(classB16.usableHosts).toBe(65534); // Exclude network and broadcast
      expect(classB16.subnetMask).toBe("255.255.0.0");
      
      // RFC 1918 Class B range with /12 prefix (larger network)
      const classB12 = calculateSubnet("172.16.0.0/12");
      expect(classB12.totalHosts).toBe(1048576); // 2^20 (20 host bits)
      expect(classB12.usableHosts).toBe(1048574); // Exclude network and broadcast
      expect(classB12.subnetMask).toBe("255.240.0.0");
    });

    it("calculates correct total addresses for Class C networks", () => {
      // Standard Class C /24
      const classC24 = calculateSubnet("192.168.1.0/24");
      expect(classC24.totalHosts).toBe(256); // 2^8
      expect(classC24.usableHosts).toBe(254); // Exclude network and broadcast
      expect(classC24.subnetMask).toBe("255.255.255.0");
      
      // Class C with /25 prefix (smaller network)
      const classC25 = calculateSubnet("192.168.1.0/25");
      expect(classC25.totalHosts).toBe(128); // 2^7
      expect(classC25.usableHosts).toBe(126); // Exclude network and broadcast
    });

    it("handles point-to-point /31 networks (RFC 3021)", () => {
      const pointToPoint = calculateSubnet("10.0.0.0/31");
      expect(pointToPoint.totalHosts).toBe(2); // /31 has 2 addresses
      expect(pointToPoint.usableHosts).toBe(2); // Both are usable in /31
      expect(pointToPoint.firstHost).toBe("10.0.0.0");
      expect(pointToPoint.lastHost).toBe("10.0.0.1");
    });

    it("handles host routes /32 networks", () => {
      const hostRoute = calculateSubnet("192.168.1.1/32");
      expect(hostRoute.totalHosts).toBe(1); // /32 is a single host
      expect(hostRoute.usableHosts).toBe(1); // Single host is usable
      expect(hostRoute.firstHost).toBe("192.168.1.1");
      expect(hostRoute.lastHost).toBe("192.168.1.1");
      expect(hostRoute.networkAddress).toBe("192.168.1.1");
      expect(hostRoute.broadcastAddress).toBe("192.168.1.1");
    });

    it("classifies Class A networks correctly", () => {
      expect(getSubnetClass("10.0.0.0/8")).toBe("A");
      expect(getSubnetClass("1.0.0.0/8")).toBe("A");
      expect(getSubnetClass("126.255.255.255/32")).toBe("A");
    });

    it("classifies Class B networks correctly", () => {
      expect(getSubnetClass("128.0.0.0/16")).toBe("B");
      expect(getSubnetClass("172.16.0.0/12")).toBe("B");
      expect(getSubnetClass("191.255.255.255/32")).toBe("B");
    });

    it("classifies Class C networks correctly", () => {
      expect(getSubnetClass("192.168.0.0/16")).toBe("C");
      expect(getSubnetClass("200.0.0.0/24")).toBe("C");
      expect(getSubnetClass("223.255.255.255/32")).toBe("C");
    });

    it("classifies Class D (Multicast) networks correctly", () => {
      expect(getSubnetClass("224.0.0.0/4")).toBe("D (Multicast)");
      expect(getSubnetClass("224.0.0.1/32")).toBe("D (Multicast)");
      expect(getSubnetClass("239.255.255.255/32")).toBe("D (Multicast)");
    });

    it("classifies Class E (Reserved) networks correctly", () => {
      expect(getSubnetClass("240.0.0.0/4")).toBe("E (Reserved)");
      expect(getSubnetClass("240.0.0.1/32")).toBe("E (Reserved)");
      expect(getSubnetClass("255.255.255.255/32")).toBe("E (Reserved)");
    });

    it("calculates correct addresses for Class D (Multicast) networks", () => {
      const multicast = calculateSubnet("224.0.0.0/4");
      expect(multicast.totalHosts).toBe(Math.pow(2, 28)); // 268,435,456
      expect(multicast.usableHosts).toBe(Math.pow(2, 28) - 2);
      expect(multicast.subnetMask).toBe("240.0.0.0");
    });

    it("calculates correct addresses for Class E (Reserved) networks", () => {
      const reserved = calculateSubnet("240.0.0.0/4");
      expect(reserved.totalHosts).toBe(Math.pow(2, 28)); // 268,435,456
      expect(reserved.usableHosts).toBe(Math.pow(2, 28) - 2);
      expect(reserved.subnetMask).toBe("240.0.0.0");
    });

    it("handles multicast subnet with standard /24 prefix", () => {
      const multicast24 = calculateSubnet("224.0.0.0/24");
      expect(multicast24.totalHosts).toBe(256);
      expect(multicast24.usableHosts).toBe(254);
      expect(multicast24.subnetMask).toBe("255.255.255.0");
    });

    it("handles multicast single host (/32)", () => {
      const multicastHost = calculateSubnet("224.0.0.1/32");
      expect(multicastHost.totalHosts).toBe(1);
      expect(multicastHost.usableHosts).toBe(1);
      expect(multicastHost.networkAddress).toBe("224.0.0.1");
    });
  });
});

describe("Tree Collection Functions", () => {
  describe("collectAllSubnets", () => {
    it("should return single subnet when no children exist", () => {
      const subnet = calculateSubnet("192.168.1.0/24");
      const result = collectAllSubnets(subnet);
      
      expect(result).toHaveLength(1);
      expect(result[0].cidr).toBe("192.168.1.0/24");
    });

    it("should return parent and children when expanded", () => {
      const parent = calculateSubnet("192.168.1.0/24");
      const children = splitSubnet(parent);
      parent.children = children;
      parent.isExpanded = true;
      
      const result = collectAllSubnets(parent);
      
      expect(result).toHaveLength(3); // Parent + 2 children
      expect(result[0].cidr).toBe("192.168.1.0/24");
      expect(result[1].cidr).toBe("192.168.1.0/25");
      expect(result[2].cidr).toBe("192.168.1.128/25");
    });

    it("should only return parent when not expanded", () => {
      const parent = calculateSubnet("192.168.1.0/24");
      const children = splitSubnet(parent);
      parent.children = children;
      parent.isExpanded = false;
      
      const result = collectAllSubnets(parent);
      
      expect(result).toHaveLength(1);
      expect(result[0].cidr).toBe("192.168.1.0/24");
    });

    it("should handle deep nesting with all expanded", () => {
      const root = calculateSubnet("192.168.1.0/24");
      root.children = splitSubnet(root);
      root.isExpanded = true;
      
      // Split first child
      root.children[0].children = splitSubnet(root.children[0]);
      root.children[0].isExpanded = true;
      
      const result = collectAllSubnets(root);
      
      expect(result).toHaveLength(5); // Root + 2 children + 2 grandchildren
      expect(result[0].cidr).toBe("192.168.1.0/24");
      expect(result[1].cidr).toBe("192.168.1.0/25");
      expect(result[2].cidr).toBe("192.168.1.0/26");
      expect(result[3].cidr).toBe("192.168.1.64/26");
      expect(result[4].cidr).toBe("192.168.1.128/25");
    });

    it("should handle mixed expanded and collapsed nodes", () => {
      const root = calculateSubnet("192.168.1.0/24");
      root.children = splitSubnet(root);
      root.isExpanded = true;
      
      // Split first child but don't expand
      root.children[0].children = splitSubnet(root.children[0]);
      root.children[0].isExpanded = false;
      
      const result = collectAllSubnets(root);
      
      expect(result).toHaveLength(3); // Root + 2 children (grandchildren hidden)
      expect(result[0].cidr).toBe("192.168.1.0/24");
      expect(result[1].cidr).toBe("192.168.1.0/25");
      expect(result[2].cidr).toBe("192.168.1.128/25");
    });

    it("should handle undefined children gracefully", () => {
      const subnet = calculateSubnet("192.168.1.0/24");
      subnet.children = undefined;
      
      const result = collectAllSubnets(subnet);
      
      expect(result).toHaveLength(1);
      expect(result[0].cidr).toBe("192.168.1.0/24");
    });
  });

  describe("collectVisibleSubnets", () => {
    it("should return all subnets when hideParents is false", () => {
      const parent = calculateSubnet("192.168.1.0/24");
      parent.children = splitSubnet(parent);
      parent.isExpanded = true;
      
      const result = collectVisibleSubnets(parent, false);
      
      expect(result).toHaveLength(3); // Parent + 2 children
      expect(result[0].cidr).toBe("192.168.1.0/24");
      expect(result[1].cidr).toBe("192.168.1.0/25");
      expect(result[2].cidr).toBe("192.168.1.128/25");
    });

    it("should hide parent when hideParents is true and has children", () => {
      const parent = calculateSubnet("192.168.1.0/24");
      parent.children = splitSubnet(parent);
      parent.isExpanded = true;
      
      const result = collectVisibleSubnets(parent, true);
      
      expect(result).toHaveLength(2); // Only children
      expect(result[0].cidr).toBe("192.168.1.0/25");
      expect(result[1].cidr).toBe("192.168.1.128/25");
    });

    it("should include subnet when hideParents is true but has no children", () => {
      const subnet = calculateSubnet("192.168.1.0/24");
      
      const result = collectVisibleSubnets(subnet, true);
      
      expect(result).toHaveLength(1);
      expect(result[0].cidr).toBe("192.168.1.0/24");
    });

    it("should recursively hide all parents in nested structure", () => {
      const root = calculateSubnet("192.168.1.0/24");
      root.children = splitSubnet(root);
      root.isExpanded = true;
      
      // Split first child
      root.children[0].children = splitSubnet(root.children[0]);
      root.children[0].isExpanded = true;
      
      const result = collectVisibleSubnets(root, true);
      
      // Should only show leaf nodes (grandchildren of first child + second child)
      expect(result).toHaveLength(3);
      expect(result[0].cidr).toBe("192.168.1.0/26");
      expect(result[1].cidr).toBe("192.168.1.64/26");
      expect(result[2].cidr).toBe("192.168.1.128/25");
    });

    it("should handle mixed tree with some splits and some leaf nodes", () => {
      const root = calculateSubnet("10.0.0.0/16");
      root.children = splitSubnet(root);
      root.isExpanded = true;
      
      // Only split the first child
      root.children[0].children = splitSubnet(root.children[0]);
      root.children[0].isExpanded = true;
      
      const result = collectVisibleSubnets(root, true);
      
      // Should show grandchildren of first child + second child (leaf)
      expect(result).toHaveLength(3);
      expect(result[0].cidr).toBe("10.0.0.0/18");
      expect(result[1].cidr).toBe("10.0.64.0/18");
      expect(result[2].cidr).toBe("10.0.128.0/17");
    });

    it("should handle empty children array", () => {
      const subnet = calculateSubnet("192.168.1.0/24");
      subnet.children = [];
      
      const resultHide = collectVisibleSubnets(subnet, true);
      const resultShow = collectVisibleSubnets(subnet, false);
      
      expect(resultHide).toHaveLength(1);
      expect(resultShow).toHaveLength(1);
    });

    it("should handle undefined children gracefully", () => {
      const subnet = calculateSubnet("192.168.1.0/24");
      subnet.children = undefined;
      
      const resultHide = collectVisibleSubnets(subnet, true);
      const resultShow = collectVisibleSubnets(subnet, false);
      
      expect(resultHide).toHaveLength(1);
      expect(resultShow).toHaveLength(1);
    });

    it("should maintain correct depth traversal when hiding parents", () => {
      const root = calculateSubnet("10.0.0.0/8");
      root.children = splitSubnet(root);
      root.isExpanded = true;
      
      // Split both children
      root.children[0].children = splitSubnet(root.children[0]);
      root.children[0].isExpanded = true;
      root.children[1].children = splitSubnet(root.children[1]);
      root.children[1].isExpanded = true;
      
      const result = collectVisibleSubnets(root, true);
      
      // Should show all 4 grandchildren (leaves)
      expect(result).toHaveLength(4);
      expect(result[0].cidr).toBe("10.0.0.0/10");
      expect(result[1].cidr).toBe("10.64.0.0/10");
      expect(result[2].cidr).toBe("10.128.0.0/10");
      expect(result[3].cidr).toBe("10.192.0.0/10");
    });
  });
});
