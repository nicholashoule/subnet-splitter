/**
 * tests/unit/ui-styles.test.ts
 *
 * UI styling tests covering:
 * - WCAG 2.x contrast for the color pairs the app renders, in both themes
 * - Design system consistency across themes
 * - Semantic structure of the calculator page
 *
 * Colors are read from client/src/index.css, so a palette change is checked
 * as soon as it is made.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

type Rgb = [number, number, number];
type Hsl = [number, number, number];

const css = fs.readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");
const calculator = fs.readFileSync(path.resolve(__dirname, "../../client/src/pages/calculator.tsx"), "utf8");

// Reads "--name: H S% L%;" declarations from a selector block
function readTokens(selector: string): Record<string, Hsl> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(\d+) (\d+)% (\d+)%;/g)].map(([, name, h, s, l]) => [name, [+h, +s, +l]])
  );
}

const light = readTokens(":root");
const themes = { light, dark: { ...light, ...readTokens(".dark") } };

function hslToRgb([h, s, l]: Hsl): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

// A translucent color (e.g. Tailwind's bg-muted/20) composited over an opaque one
function over(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return top.map((c, i) => Math.round(c * alpha + bottom[i] * (1 - alpha))) as Rgb;
}

// Relative luminance (WCAG 2.x)
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("UI Accessibility - WCAG Contrast", () => {
  it("reads the palette from index.css", () => {
    for (const name of ["background", "foreground", "card", "primary", "muted", "muted-foreground", "destructive"]) {
      expect(themes.light[name], `light --${name}`).toBeDefined();
      expect(readTokens(".dark")[name], `dark --${name}`).toBeDefined();
    }
  });

  describe.each(Object.entries(themes))("%s theme", (_theme, tokens) => {
    const color = (name: string) => hslToRgb(tokens[name]);
    const background = color("background");
    // Header and footer bands (bg-muted/20 and bg-muted/30 over the page)
    const header = over(color("muted"), 0.2, background);
    const footer = over(color("muted"), 0.3, background);

    // Text pairs rendered by the app; WCAG AA requires 4.5:1 for normal-size text
    const textPairs: Array<[string, Rgb, Rgb]> = [
      ["foreground on background", color("foreground"), background],
      ["card-foreground on card", color("card-foreground"), color("card")],
      ["muted-foreground on background", color("muted-foreground"), background],
      ["muted-foreground on card", color("muted-foreground"), color("card")],
      ["muted-foreground on muted", color("muted-foreground"), color("muted")],
      ["muted-foreground on header", color("muted-foreground"), header],
      ["muted-foreground on footer", color("muted-foreground"), footer],
      ["primary (links) on background", color("primary"), background],
      ["primary (links) on footer", color("primary"), footer],
      ["primary-foreground on primary (buttons, badges)", color("primary-foreground"), color("primary")],
      ["secondary-foreground on secondary", color("secondary-foreground"), color("secondary")],
      ["destructive (error text) on background", color("destructive"), background],
      ["destructive (error text) on card", color("destructive"), color("card")],
      ["destructive-foreground on destructive (toasts)", color("destructive-foreground"), color("destructive")],
    ];

    it.each(textPairs)("%s meets WCAG AA (4.5:1)", (_pair, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it("foreground on background meets WCAG AAA (7:1)", () => {
      expect(contrast(color("foreground"), background)).toBeGreaterThanOrEqual(7);
    });

    it("focus ring meets WCAG non-text contrast (3:1) on background and card", () => {
      expect(contrast(color("ring"), background)).toBeGreaterThanOrEqual(3);
      expect(contrast(color("ring"), color("card"))).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("Design System Consistency", () => {
  it("keeps the primary hue within 10 degrees across themes", () => {
    expect(Math.abs(themes.light.primary[0] - themes.dark.primary[0])).toBeLessThanOrEqual(10);
  });

  it("uses the primary color for the focus ring in both themes", () => {
    expect(themes.light.ring).toEqual(themes.light.primary);
    expect(themes.dark.ring).toEqual(themes.dark.primary);
  });

  it("separates destructive from primary by hue", () => {
    for (const tokens of Object.values(themes)) {
      const diff = Math.abs(tokens.primary[0] - tokens.destructive[0]);
      expect(Math.min(diff, 360 - diff)).toBeGreaterThanOrEqual(90);
    }
  });
});

describe("Semantic Structure", () => {
  it("gives the header QR code image alt text", () => {
    expect(calculator).toMatch(/<img [^>]*alt="GitHub QR Code"/);
  });

  it("labels the theme toggle and docs link for screen readers", () => {
    expect(calculator).toContain('aria-label="Toggle dark mode"');
    expect(calculator).toContain('aria-label="Open API documentation"');
  });

  it("labels the CIDR input and ties validation errors to it", () => {
    expect(calculator).toContain('<label htmlFor="cidr-input"');
    expect(calculator).toContain('aria-describedby={cidrError ? "cidr-input-error" : undefined}');
    expect(calculator).toContain('id="cidr-input-error"');
  });

  it("has a footer with the CIDR explanation and creator link", () => {
    expect(calculator).toContain("CIDR (Classless Inter-Domain Routing)");
    expect(calculator).toMatch(/Created by <a href="https:\/\/github\.com\/nicholashoule"/);
  });
});

describe("Responsive Behavior", () => {
  it("caps the content width at 1600px", () => {
    expect(calculator).toContain("max-w-[1600px]");
  });

  it("styles the subnet table scrollbar with elegant-scrollbar", () => {
    expect(css).toContain(".elegant-scrollbar {");
    expect(calculator).toContain("elegant-scrollbar");
  });
});
