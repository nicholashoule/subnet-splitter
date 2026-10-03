# UI Examples & Design System Reference

This file contains detailed UI implementation examples and the full color palette specification extracted from the project's instruction files.

## Header Implementation

```tsx
<header className="border-b border-border bg-muted/20 -mx-6 px-6 py-4 mb-6 text-center">
  <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="inline-block">
    <img src="/github-nicholashoule.png" alt="nicholashoule on GitHub (QR code)" className="w-16 h-16 rounded-lg hover:opacity-80 transition-opacity mb-2" />
  </a>
  <h1 className="text-4xl font-bold tracking-tight mb-3">CIDR Subnet Calculator</h1>
  <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
    Calculate subnet details and recursively split networks into smaller subnets...
  </p>
</header>
```

**Header styling details:**
- Border: `border-b border-border` separates from content
- Background: `bg-muted/20` for subtle distinction
- Full-width: `-mx-6 px-6` extends background to page edges
- Padding: `py-4` (16px vertical)
- QR Code: 64px (`w-16 h-16`), `rounded-lg`, `hover:opacity-80`
- Image location: `client/public/github-nicholashoule.png` (6.6 KB)
- Typography: title `text-4xl font-bold tracking-tight`, description `text-muted-foreground text-lg`
- Responsive: aligned with container `max-w-[1600px]`

## Footer Implementation

```tsx
<footer className="border-t border-border bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground space-y-3">
  <p className="max-w-2xl mx-auto leading-relaxed">
    CIDR (Classless Inter-Domain Routing) allows flexible IP allocation...
  </p>
  <p className="text-xs">
    Created by <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:decoration-2 font-medium">nicholashoule</a>
  </p>
</footer>
```

**Footer styling details:**
- Border: `border-t border-border` mirrors header
- Background: `bg-muted/30` (slightly darker than header for hierarchy)
- Padding: `px-6 py-8` with `space-y-3`
- Text: `text-sm` main, `text-xs` author credit
- Links: primary color, always underlined (`underline underline-offset-2`, thicker on hover). Primary text is only 1.02:1 (light) and 1.42:1 (dark) against the muted foreground around it, so color alone would not mark it as a link (WCAG 1.4.1); the 404 page link is styled the same way

## Design Consistency Rules

1. Both header/footer use border + muted background pairing
2. Header `bg-muted/20`, footer `bg-muted/30` (darker = visual hierarchy)
3. Both centered, text-focused, extending full width
4. Spacing: header `py-4`, footer `py-8` (footer more generous)
5. Test both light and dark modes
6. Verify no horizontal page scrollbar on 1080p+ or at 320px wide (WCAG 1.4.10); only the subnet table scrolls sideways, inside its own container

## Color Palette

Tokens are defined in `client/src/index.css` as bare HSL channels (`:root` for light, `.dark` for dark) and mapped to Tailwind colors in the `@theme inline` block. The API docs page (`server/swagger-ui.ts`) mirrors them. Hex values are the rendered sRGB colors.

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--background` | `210 20% 98%` `#F9FAFB` | `222 47% 8%` `#0B111E` | Page background |
| `--card` | `0 0% 100%` `#FFFFFF` | `222 47% 11%` `#0F1729` | Card backgrounds |
| `--foreground` | `222 47% 11%` `#0F1729` | `210 20% 98%` `#F9FAFB` | Primary text |
| `--primary` | `221 83% 53%` `#2463EB` | `217 91% 60%` `#3C83F6` | Action buttons, links, focus ring |
| `--primary-foreground` | `0 0% 100%` `#FFFFFF` | `222 47% 8%` `#0B111E` | Text on primary |
| `--secondary` | `214 32% 91%` `#E1E7EF` | `217 33% 17%` `#1D283A` | Example buttons, network class badges, subtle surfaces |
| `--muted` | `210 20% 96%` `#F3F5F7` | `217 33% 17%` `#1D283A` | Header/footer bands, secondary backgrounds |
| `--muted-foreground` | `215 16% 45%` `#607085` | `215 20% 65%` `#94A3B8` | Secondary text, labels, icons |
| `--destructive` | `0 72% 51%` `#DC2828` | `0 62% 63%` `#DB6666` | Error text, destructive buttons and badges |
| `--destructive-foreground` | `0 0% 100%` `#FFFFFF` | `222 47% 8%` `#0B111E` | Text on destructive |
| `--destructive-soft` | `0 86% 97%` `#FEF1F1` | `359 80% 15%` `#450809` | Error toast background |
| `--destructive-soft-foreground` | `359 69% 30%` `#811819` | `0 100% 94%` `#FFE0E0` | Error toast text |
| `--success` | `163 94% 24%` `#047756` | `160 70% 50%` `#26D99D` | Status messages, copy confirmation |
| `--border` | `214 20% 88%` `#DAE0E7` | `217 33% 17%` `#1D283A` | Card/table borders, dividers |
| `--input` | `214 20% 57%` `#7B8EA7` | `217 33% 45%` `#4D6A99` | Input borders (3:1 against card and background) |

Dark mode applies when `<html>` has the `dark` class (Tailwind's `dark:` variant is `&:is(.dark *)`).

## Color Usage Guidelines

**Primary:** Main action buttons, links, focus rings.

**Secondary:** Example CIDR buttons, the network class badges in the subnet table, and other low-emphasis controls.

**Muted:** Header and footer bands, secondary text and labels, icon buttons, placeholders.

**Destructive:** Validation errors and the error boundary alert. Error toasts use the softer `--destructive-soft` pair.

**Success:** The subnet table status message and the copy confirmation icon.

Use tokens only: Tailwind palette classes such as `text-green-600` don't follow the theme and fail `tests/unit/ui-styles.test.ts`. The one exception is the decorative depth bars in `subnet-utils.ts`; the prefix length they encode is also shown as text.

**Borders:** `--border` for card and table borders and subtle separators; `--input` for form field borders, which need 3:1 against the surface (WCAG 1.4.11) where a separator does not.

## WCAG Accessibility Compliance

Every text pair the app renders meets WCAG AA (4.5:1) in both themes, and input borders and the focus ring meet the 3:1 non-text minimum (WCAG 1.4.11). `tests/unit/ui-styles.test.ts` reads the tokens from `index.css` and fails if a change drops a pair below its level.

| Combination | Light | Dark | Level |
|-------------|-------|------|-------|
| Foreground on background | 17.1:1 | 18.1:1 | AAA |
| Primary on background | 5.0:1 | 5.2:1 | AA |
| Primary-foreground on primary (buttons, badges) | 5.2:1 | 5.2:1 | AA |
| Secondary-foreground on secondary | 14.4:1 | 14.2:1 | AAA |
| Muted foreground on background | 4.8:1 | 7.4:1 | AA |
| Muted foreground on footer (`bg-muted/30`) | 4.8:1 | 6.9:1 | AA |
| Muted foreground on muted | 4.6:1 | 5.8:1 | AA |
| Destructive on card (form errors) | 4.8:1 | 5.2:1 | AA |
| Destructive-foreground on destructive (buttons, badges) | 4.8:1 | 5.5:1 | AA |
| Success on card (status message) | 5.6:1 | 9.8:1 | AA |
| Error toast text on `--destructive-soft` (description at 90% opacity) | 9.2:1 (7.4:1) | 13.2:1 (10.7:1) | AAA |
| Toast close icon (`foreground/50`, non-text, 3:1) | 3.3:1 | 4.6:1 | AA |
| Input border on card (non-text, 3:1) | 3.3:1 | 3.3:1 | AA |
| Input border on background (non-text, 3:1) | 3.2:1 | 3.4:1 | AA |
| Focus ring on background (non-text, 3:1) | 5.0:1 | 5.2:1 | AA |
| Focus ring on card (non-text, 3:1) | 5.2:1 | 4.9:1 | AA |
| Focus ring offset (`--background`) against a primary button (non-text, 3:1) | 5.0:1 | 5.2:1 | AA |

In dark mode the primary and destructive colors are light enough for text on dark surfaces, so text placed on them is dark (`222 47% 8%`); white text on them would fall below 4.5:1.

The focus ring is `--ring`, which equals `--primary`. Buttons, inputs, and checkboxes draw it as `focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-background`: a 2px ring outside a 2px gap in the page background color. Without the gap the ring would be invisible on a primary button (1.0:1).

To check a new color, add it to the pairs in `tests/unit/ui-styles.test.ts` and run `npm test -- --run tests/unit/ui-styles.test.ts`.

## Accessibility Patterns

The calculator page (`client/src/pages/calculator.tsx`) uses these patterns; `tests/unit/ui-styles.test.ts` checks the structural ones in the source.

- **Headings:** one `h1` (the page title), then `h2`s: each card title is a `CardTitle`, which renders an `h2` (Enter CIDR Range, Network Overview, Subnet Table), and the empty state's "No subnet calculated yet" is a plain `h2`. Headings hold only their text: the subnet table toolbar sits beside its heading, not inside it.
- **Names:** the CIDR input is named by its visible heading (`aria-labelledby="cidr-heading"`), so its accessible name is the text on screen (WCAG 2.5.3). The subnet table is named by its heading (`aria-labelledby="subnet-table-title"`). Each remove button is named after the split it removes, `Remove split of {parent CIDR}`: it removes that row, its sibling, and everything below them.
- **Messages:** a validation error is `role="alert"`, tied to the input with `aria-invalid` and `aria-describedby`. Pressing Enter in the input moves no focus, so the alert is what announces it. The status line under the subnet table title is an always-mounted `role="status"` region. Both give each message a new id used as its React `key`, so a repeat of the same text is announced again.
- **Targets:** the copy buttons in table cells are 24x24 px (WCAG 2.5.8), with the button's 16px icon.
- **Reflow:** at 320px wide the page does not scroll sideways (WCAG 1.4.10). The table toolbar and form buttons wrap, the "Click to split" hint badge is hidden below the `sm` breakpoint (the card description says the same), and Network Overview uses one column below `sm`. Only the data table scrolls, inside its own container.
- **Theme:** `client/public/theme-init.js` applies the saved theme (`localStorage` key `theme`, light by default) before first paint. `index.html` loads it as a classic blocking script in `<head>`; the CSP (`script-src 'self'`) allows this same-origin file but would block the same code inline. `client/src/lib/theme.ts` is the runtime API the page uses to read, save, and switch the theme.
