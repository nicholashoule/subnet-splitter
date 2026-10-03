/**
 * tests/unit/ui-styles.test.ts
 *
 * UI styling tests covering:
 * - WCAG 2.x contrast for the color pairs the app renders, in both themes, and
 *   non-text contrast (3:1) for input borders and the focus ring
 * - Design system consistency across themes
 * - Focus indicators of the shared button, input and checkbox components
 * - Semantic structure of the calculator and 404 pages (headings, names, live regions, links)
 * - The saved theme applied before first paint (client/public/theme-init.js)
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
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
const calculator = read("client/src/pages/calculator.tsx");
/** Source of one handler in calculator.tsx: from `const name` to its closing `  };` */
const handlerSource = (name: string) => {
  const start = calculator.indexOf(`  const ${name} = `);
  expect(start, name).toBeGreaterThan(-1);
  return calculator.slice(start, calculator.indexOf("\n  };\n", start) + 5);
};
const notFound = read("client/src/pages/not-found.tsx");

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
    for (const name of ["background", "foreground", "card", "popover", "popover-foreground", "primary", "muted", "muted-foreground", "destructive", "destructive-soft", "destructive-soft-foreground", "success", "input", "ring"]) {
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
      ["primary (404 page link) on card", color("primary"), color("card")],
      ["popover-foreground on popover (tooltips)", color("popover-foreground"), color("popover")],
      ["primary-foreground on primary (buttons, badges)", color("primary-foreground"), color("primary")],
      ["secondary-foreground on secondary", color("secondary-foreground"), color("secondary")],
      ["destructive (error text) on background", color("destructive"), background],
      ["destructive (error text) on card", color("destructive"), color("card")],
      ["destructive-foreground on destructive (destructive button and badge variants)", color("destructive-foreground"), color("destructive")],
      ["success (status text, copy check) on card", color("success"), color("card")],
      ["success on background", color("success"), background],
      // Toasts: the description is rendered at opacity-90
      ["toast description on background", over(color("foreground"), 0.9, background), background],
      ["error toast title on destructive-soft", color("destructive-soft-foreground"), color("destructive-soft")],
      ["error toast description on destructive-soft", over(color("destructive-soft-foreground"), 0.9, color("destructive-soft")), color("destructive-soft")],
    ];

    it.each(textPairs)("%s meets WCAG AA (4.5:1)", (_pair, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it("foreground on background meets WCAG AAA (7:1)", () => {
      expect(contrast(color("foreground"), background)).toBeGreaterThanOrEqual(7);
    });

    // Non-text contrast (WCAG 1.4.11): component boundaries and focus indicators need 3:1
    // against the colors next to them
    const nonTextPairs: Array<[string, Rgb, Rgb]> = [
      ["input border on card", color("input"), color("card")],
      ["input border on background", color("input"), background],
      ["focus ring on background", color("ring"), background],
      ["focus ring on card", color("ring"), color("card")],
      // The ring equals --primary, so on a primary button only the 2px ring-offset gap
      // (ring-offset-background) separates them: the gap must contrast with the button fill
      ["focus ring offset (background) against a primary button", background, color("primary")],
    ];

    it.each(nonTextPairs)("%s meets WCAG non-text contrast (3:1)", (_pair, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
    });

    it("toast close icon (foreground/50) meets WCAG non-text contrast (3:1) on both toast variants", () => {
      for (const surface of [background, color("destructive-soft")]) {
        expect(contrast(over(color("foreground"), 0.5, surface), surface)).toBeGreaterThanOrEqual(3);
      }
    });
  });
});

describe("Colors come from theme tokens", () => {
  // Tailwind palette colors (text-green-600, bg-gray-50, var(--color-gray-200), ...) bypass
  // the tokens: they escape the contrast checks above and don't follow the theme. The one
  // exception is getDepthIndicatorClasses() in subnet-utils.ts: decorative depth bars
  // (non-text; the prefix they encode is also shown as text).
  const PALETTES = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
  const PALETTE_COLOR = new RegExp(
    `\\b(?:text|bg|border|ring|ring-offset|outline|fill|stroke|divide|placeholder|decoration|accent|caret|shadow|from|via|to)-(?:${PALETTES})(?:-\\d{2,3})?\\b|--color-(?:${PALETTES})\\b`,
    "g"
  );
  const clientSrc = path.resolve(__dirname, "../../client/src");

  // Drops the body of one top-level function (up to its closing brace at column 0)
  const withoutFunction = (source: string, name: string) => {
    const start = source.indexOf(`export function ${name}(`);
    return start === -1 ? source : source.slice(0, start) + source.slice(source.indexOf("\n}\n", start) + 3);
  };

  it("uses no Tailwind palette colors in client code outside the depth indicator", () => {
    const files = (fs.readdirSync(clientSrc, { recursive: true }) as string[]).filter((file) => /\.(tsx?|css)$/.test(file));
    expect(files.length).toBeGreaterThan(10);

    const offenders = files.flatMap((file) => {
      const source = fs.readFileSync(path.join(clientSrc, file), "utf8");
      const scanned = file.endsWith("subnet-utils.ts") ? withoutFunction(source, "getDepthIndicatorClasses") : source;
      return (scanned.match(PALETTE_COLOR) ?? []).map((color) => `${file}: ${color}`);
    });
    expect(offenders).toEqual([]);
  });

  it("exempts only the depth indicator, which does use palette colors", () => {
    const utils = fs.readFileSync(path.join(clientSrc, "lib/subnet-utils.ts"), "utf8");
    expect(utils.match(PALETTE_COLOR)?.length).toBeGreaterThan(30);
    expect(withoutFunction(utils, "getDepthIndicatorClasses").match(PALETTE_COLOR)).toBeNull();
  });
});

describe("Tailwind 4 variant order", () => {
  // Tailwind 4 applies stacked variants left to right, as CSS reads: "[&>tr]:last:" is
  // the element's last row, but "last:[&>tr]:" is every row of an element that is itself
  // a last child (the Tailwind 3 meaning, which the upgrade tool preserves by swapping)
  const POSITIONAL_BEFORE_CHILD = /(?<![\w-])(?:first|last|only|odd|even|first-of-type|last-of-type|only-of-type|nth-[\w[\]-]+):(?:\[&[^\]\s]*\]|\*{1,2}):/g;
  const clientSrc = path.resolve(__dirname, "../../client/src");

  it("puts child selectors before positional variants, so they match the child", () => {
    const files = (fs.readdirSync(clientSrc, { recursive: true }) as string[]).filter((file) => /\.tsx?$/.test(file));
    const offenders = files.flatMap((file) =>
      (fs.readFileSync(path.join(clientSrc, file), "utf8").match(POSITIONAL_BEFORE_CHILD) ?? []).map((m) => `${file}: ${m}`));
    expect(offenders).toEqual([]);
  });

  it("catches the reversed order", () => {
    expect("font-medium last:[&>tr]:border-b-0".match(POSITIONAL_BEFORE_CHILD)).toEqual(["last:[&>tr]:"]);
    expect("first:*:pt-0".match(POSITIONAL_BEFORE_CHILD)).toEqual(["first:*:"]);
    expect("font-medium [&>tr]:last:border-b-0 *:first:pt-0".match(POSITIONAL_BEFORE_CHILD)).toBeNull();
  });

  it("removes the bottom border from the table footer's last row only", () => {
    expect(read("client/src/components/ui/table.tsx")).toContain("[&>tr]:last:border-b-0");
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

describe("Focus Indicators", () => {
  // Class tokens of a component source, so "ring-2" is not satisfied by "ring-20"
  const classTokens = (file: string) => new Set(read(`client/src/components/ui/${file}`).split(/[\s"'`]+/));

  it.each(["button.tsx", "input.tsx", "checkbox.tsx"])("%s draws a 2px focus ring outside a 2px background-colored gap", (file) => {
    const tokens = classTokens(file);
    for (const token of ["focus-visible:ring-2", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "ring-offset-background"]) {
      expect(tokens, `${file}: ${token}`).toContain(token);
    }
    // A 1px ring with no gap is invisible on a primary button (the ring color is --primary)
    expect(tokens).not.toContain("focus-visible:ring-1");
  });
});

describe("Semantic Structure", () => {
  // Source of one top-level component, from its declaration to its closing brace at column 0
  const component = (source: string, name: string) => {
    const start = source.search(new RegExp(`^(export default )?function ${name}\\(`, "m"));
    expect(start, name).toBeGreaterThanOrEqual(0);
    return source.slice(start, source.indexOf("\n}\n", start));
  };

  // The heading level CardTitle renders, read from card.tsx (null if it is not a heading)
  const cardTitleLevel = () => {
    const card = read("client/src/components/ui/card.tsx");
    const tag = card.slice(card.indexOf("const CardTitle")).match(/<(h[1-6]|div|p|span)\b/)?.[1] ?? "";
    return /^h[1-6]$/.test(tag) ? Number(tag[1]) : null;
  };

  // Heading levels in the order the calculator renders them: its own JSX, with
  // CardTitle and the SubnetDetails card expanded to the headings they render
  const headingLevels = (jsx: string): Array<number | null> =>
    [...jsx.matchAll(/<(h[1-6]|CardTitle|SubnetDetails)\b/g)].flatMap(([, tag]) =>
      tag === "SubnetDetails" ? headingLevels(component(calculator, "SubnetDetails"))
        : tag === "CardTitle" ? [cardTitleLevel()]
        : [Number(tag[1])]);

  it("renders CardTitle as an h2, so each card is a section under the page's h1", () => {
    expect(cardTitleLevel()).toBe(2);
  });

  it("gives the calculator one h1 followed by h2 sections, skipping no level", () => {
    // The title, then Enter CIDR Range, Network Overview, Subnet Table and the empty state
    const levels = headingLevels(component(calculator, "Calculator"));
    expect(levels).toEqual([1, 2, 2, 2, 2]);
    levels.forEach((level, i) => {
      if (i > 0) expect(level!).toBeLessThanOrEqual(levels[i - 1]! + 1);
    });
  });

  it("gives the 404 page a single h1", () => {
    expect(headingLevels(notFound)).toEqual([1]);
  });

  it("keeps the subnet table toolbar out of its heading and names the table by the heading", () => {
    expect(calculator).toContain('<CardTitle id="subnet-table-title">Subnet Table</CardTitle>');
    expect(calculator).toContain('aria-labelledby="subnet-table-title"');
  });

  it("names the header QR code link by its destination", () => {
    expect(calculator).toContain('alt="nicholashoule on GitHub (QR code)"');
  });

  it("labels the theme toggle with the action a press performs, and the docs link", () => {
    expect(calculator).toContain('aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}');
    expect(calculator).toContain('aria-label="Open API documentation"');
  });

  it("names the CIDR input by its visible heading (WCAG 2.5.3) and ties validation errors to it", () => {
    expect(calculator).toContain('<CardTitle id="cidr-heading">Enter CIDR Range</CardTitle>');
    expect(calculator).toContain('aria-labelledby="cidr-heading"');
    expect(calculator).toContain("aria-invalid={!!cidrError}");
    expect(calculator).toContain('aria-describedby={cidrError ? "cidr-input-error" : undefined}');
  });

  it("announces messages: validation errors as alerts, table status in a live region", () => {
    // role="alert" announces the error however the form was submitted; a new key per
    // failed submit announces a repeated error again
    expect(calculator).toMatch(/<p key=\{cidrError\.id\} id="cidr-input-error" role="alert"/);
    // A failed submit must not also move focus to the input: aria-describedby would read
    // the error a second time
    const onSubmit = handlerSource("onSubmit");
    expect(onSubmit).toContain("if (error) return;");
    expect(onSubmit).not.toContain(".focus()");
    // The status region stays mounted; a new key per message re-announces repeated text
    expect(calculator).toMatch(/<div role="status">\s*\{statusMessage && \(\s*<span key=\{statusMessage\.id\}/);
  });

  it("underlines links inside text, not just on hover (color alone is not enough)", () => {
    const linkClasses = (source: string, href: string) => {
      const tag = source.match(new RegExp(`<a href="${href}"[^>]*>`))?.[0] ?? "";
      return (tag.match(/className="([^"]*)"/)?.[1] ?? "").split(/\s+/);
    };
    const footer = calculator.slice(calculator.indexOf("Created by"));
    for (const classes of [linkClasses(footer, "https://github.com/nicholashoule"), linkClasses(notFound, "/")]) {
      expect(classes).toContain("text-primary");
      expect(classes).toContain("underline");
    }
  });

  it("has a footer with the CIDR explanation and creator link", () => {
    expect(calculator).toContain("CIDR (Classless Inter-Domain Routing)");
    expect(calculator).toMatch(/Created by <a href="https:\/\/github\.com\/nicholashoule"/);
  });
});

describe("Connections the CSP allows", () => {
  it("sends no preconnect or dns-prefetch hints: connect-src is 'self' only", () => {
    // Browsers differ on whether CSP covers these hints; where it does, each would be a
    // violation (and, in development, a report) on every page load
    expect(read("client/index.html")).not.toMatch(/rel=["']?(?:preconnect|dns-prefetch)/i);
  });
});

describe("Theme Before First Paint", () => {
  const html = read("client/index.html");
  const themeInit = read("client/public/theme-init.js");

  it("loads theme-init.js as a classic blocking script in <head>, before the app bundle", () => {
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain('<script src="/theme-init.js"></script>');
    expect(html.indexOf("/theme-init.js")).toBeLessThan(html.indexOf('type="module"'));
    // No inline script of any type: the CSP (script-src 'self') would block it
    const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) expect(tag, tag).toMatch(/\ssrc="/);
  });

  // Runs theme-init.js against a stub document and localStorage; returns the classes it adds
  const run = (getItem: (key: string) => string | null) => {
    const classes = new Set<string>();
    const document = { documentElement: { classList: { add: (name: string) => classes.add(name) } } };
    new Function("localStorage", "document", themeInit)({ getItem }, document);
    return classes;
  };

  it("applies dark only when the saved theme is dark, like lib/theme.ts", () => {
    const keys: string[] = [];
    expect(run((key) => (keys.push(key), "dark"))).toEqual(new Set(["dark"]));
    expect(keys).toEqual(["theme"]);
    expect(run(() => "light")).toEqual(new Set());
    expect(run(() => null)).toEqual(new Set());
  });

  it("keeps the light default when storage is unavailable", () => {
    expect(run(() => { throw new Error("SecurityError"); })).toEqual(new Set());
  });
});

// No React renders in these tests, so the page's wiring is checked in its source: each
// assertion fails if the corresponding regression (found by mutation testing) returns
describe("Calculator Wiring", () => {
  it("memoizes table rows and keeps the split callback stable", () => {
    expect(calculator).toContain("const SubnetRow = memo(function SubnetRow(");
    // The callback reads the tree through a ref; depending on rootSubnet would re-render every row
    const start = calculator.indexOf("  const handleSplit = useCallback(");
    expect(start).toBeGreaterThan(-1);
    const deps = calculator.slice(start).match(/\n {2}\}, \[([^\]]*)\]\);/)?.[1];
    expect(deps).toBeDefined();
    expect(deps).not.toContain("rootSubnet");
  });

  it("builds the table and the export from the visible rows, honoring Hide Parents", () => {
    expect(calculator).toContain("collectVisibleRows(rootSubnet, hideParents)");
    expect(calculator).toContain("selectedVisibleSubnets(visibleSubnets, selectedIds)");
  });

  it("shows a minus for the partial select-all state and a check otherwise", () => {
    const checkbox = read("client/src/components/ui/checkbox.tsx");
    expect(checkbox).toMatch(/<Minus className="[^"]*group-data-\[state=indeterminate\]\/indicator:block/);
    expect(checkbox).toMatch(/<Check className="[^"]*group-data-\[state=indeterminate\]\/indicator:hidden/);
  });

  it("sizes the header icons through their buttons (size=\"icon\" overrides classes on the icon)", () => {
    expect(calculator.match(/\[&_svg\]:size-5/g)?.length).toBe(2);
    expect(calculator).not.toMatch(/<(BookOpen|Sun|Moon) className="[^"]*\bh-5\b/);
  });

  it("confirms example loads like Calculate, through the announced toast", () => {
    const loadExample = handlerSource("loadExample");
    expect(loadExample).toContain('title: "Subnet calculated"');
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
