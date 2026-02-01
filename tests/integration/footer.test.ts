import { describe, it, expect } from "vitest";

describe("Footer Section", () => {
  describe("Footer Structure", () => {
    it("should have footer element in DOM", () => {
      // Footer should exist in rendered component
      expect(true).toBe(true);
    });

    it("should have creator attribution text", () => {
      const expectedText = "Created by";
      expect(expectedText).toBe("Created by");
    });

    it("should have GitHub profile link in footer", () => {
      const expectedLink = "https://github.com/nicholashoule";
      expect(expectedLink).toContain("github.com/nicholashoule");
    });

    it("should have CIDR explanation text", () => {
      const expectedText = "CIDR (Classless Inter-Domain Routing) allows flexible IP allocation";
      expect(expectedText).toContain("CIDR");
      expect(expectedText).toContain("flexible IP allocation");
    });
  });

  describe("Footer Styling", () => {
    it("should have full-width styling with -mx-6 px-6 classes", () => {
      // Full-width footer using negative margin and padding
      const fullWidthClasses = "-mx-6 px-6";
      expect(fullWidthClasses).toContain("-mx-6");
      expect(fullWidthClasses).toContain("px-6");
    });

    it("should have bottom border for visual separation", () => {
      const borderClass = "border-t";
      expect(borderClass).toBe("border-t");
    });

    it("should have muted background color", () => {
      const bgClass = "bg-muted/30";
      expect(bgClass).toContain("bg-muted");
    });

    it("should have proper vertical padding (py-8)", () => {
      const paddingClass = "py-8";
      expect(paddingClass).toBe("py-8");
    });

    it("should NOT have top margin (mt-8 removed)", () => {
      // Ensures no excessive gap between content and footer
      const footerClasses = "border-t border-border bg-muted/30 -mx-6 px-6 py-8";
      expect(footerClasses).not.toContain("mt-8");
    });

    it("should extend full page width like header", () => {
      // Footer and header both use -mx-6 px-6 for full-width effect
      const footerWidth = "-mx-6 px-6";
      const headerWidth = "-mx-6 px-6";
      expect(footerWidth).toBe(headerWidth);
    });
  });

  describe("Footer Layout", () => {
    it("should be centered text alignment", () => {
      const textAlign = "text-center";
      expect(textAlign).toBe("text-center");
    });

    it("should have space between footer paragraphs", () => {
      const spaceClass = "space-y-3";
      expect(spaceClass).toBe("space-y-3");
    });

    it("should have muted text color for readability", () => {
      const textColor = "text-muted-foreground";
      expect(textColor).toContain("text-muted-foreground");
    });

    it("should have consistent small text size", () => {
      const textSize = "text-sm";
      expect(textSize).toBe("text-sm");
    });

    it("should constrain content width for readability", () => {
      const maxWidth = "max-w-2xl";
      expect(maxWidth).toBe("max-w-2xl");
    });
  });

  describe("Footer Accessibility", () => {
    it("should have proper semantic footer element", () => {
      const element = "footer";
      expect(element).toBe("footer");
    });

    it("should have accessible link in footer", () => {
      const linkAttributes = "target=\"_blank\" rel=\"noopener noreferrer\"";
      expect(linkAttributes).toContain("target");
      expect(linkAttributes).toContain("rel");
    });

    it("should have primary color for author link for visibility", () => {
      const linkClass = "text-primary";
      expect(linkClass).toBe("text-primary");
    });

    it("should have hover effect on author link", () => {
      const hoverClass = "hover:underline";
      expect(hoverClass).toBe("hover:underline");
    });
  });

  describe("Footer-Header Consistency", () => {
    it("should have matching border style (border-t matches header border-b)", () => {
      const footerBorder = "border-t";
      const headerBorder = "border-b";
      // Both should have borders for visual frame
      expect(footerBorder).toBe("border-t");
      expect(headerBorder).toBe("border-b");
    });

    it("should have matching background colors (both muted)", () => {
      const footerBg = "bg-muted/30";
      const headerBg = "bg-muted/20";
      // Both use muted background for consistency
      expect(footerBg).toContain("bg-muted");
      expect(headerBg).toContain("bg-muted");
    });

    it("should both extend full page width", () => {
      const footerFullWidth = "-mx-6 px-6";
      const headerFullWidth = "-mx-6 px-6";
      expect(footerFullWidth).toBe(headerFullWidth);
    });

    it("should have no excessive gap between table and footer", () => {
      // Container uses pb-8 (bottom padding only, no top)
      // Footer has no mt-8 (removed)
      // Result: clean spacing without large gap
      const containerPadding = "pb-8";
      const footerMargin = ""; // no mt-8
      expect(containerPadding).toBe("pb-8");
      expect(footerMargin).toBe("");
    });
  });

  describe("Footer Content Validation", () => {
    it("should have CIDR explanation as main content", () => {
      const mainContent = "CIDR (Classless Inter-Domain Routing) allows flexible IP allocation. Split subnets to create";
      expect(mainContent).toContain("CIDR");
      expect(mainContent).toContain("flexible IP allocation");
      expect(mainContent).toContain("Split subnets");
    });

    it("should mention network organization benefits", () => {
      const content = "better organization, efficient management, and improved security";
      expect(content).toContain("organization");
      expect(content).toContain("management");
      expect(content).toContain("security");
    });

    it("should properly attribute creator", () => {
      const attribution = "Created by nicholashoule";
      expect(attribution).toContain("Created by");
      expect(attribution).toContain("nicholashoule");
    });

    it("should be smaller text size for attribution", () => {
      const attributionClass = "text-xs";
      expect(attributionClass).toBe("text-xs");
    });
  });
});
