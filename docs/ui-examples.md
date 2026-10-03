# UI Examples & Design System Reference

This file contains detailed UI implementation examples and the full color palette specification extracted from the project's instruction files.

## Header Implementation

```tsx
<header className="border-b border-border bg-muted/20 -mx-6 px-6 py-4 mb-6 text-center">
  <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="inline-block">
    <img src="/github-nicholashoule.png" alt="GitHub QR Code" className="w-16 h-16 rounded-lg hover:opacity-80 transition-opacity mb-2" />
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
    Created by <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">nicholashoule</a>
  </p>
</footer>
```

**Footer styling details:**
- Border: `border-t border-border` mirrors header
- Background: `bg-muted/30` (slightly darker than header for hierarchy)
- Padding: `px-6 py-8` with `space-y-3`
- Text: `text-sm` main, `text-xs` author credit
- Links: primary color with `hover:underline`

## Design Consistency Rules

1. Both header/footer use border + muted background pairing
2. Header `bg-muted/20`, footer `bg-muted/30` (darker = visual hierarchy)
3. Both centered, text-focused, extending full width
4. Spacing: header `py-4`, footer `py-8` (footer more generous)
5. Test both light and dark modes
6. Verify no horizontal scrollbars on 1080p+

## Color Palette

Tokens are defined in `client/src/index.css` as bare HSL channels (`:root` for light, `.dark` for dark) and mapped to Tailwind colors in the `@theme inline` block. The API docs page (`server/swagger-ui.ts`) mirrors them. Hex values are the rendered sRGB colors.

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--background` | `210 20% 98%` `#F9FAFB` | `222 47% 8%` `#0B111E` | Page background |
| `--card` | `0 0% 100%` `#FFFFFF` | `222 47% 11%` `#0F1729` | Card backgrounds |
| `--foreground` | `222 47% 11%` `#0F1729` | `210 20% 98%` `#F9FAFB` | Primary text |
| `--primary` | `221 83% 53%` `#2463EB` | `217 91% 60%` `#3C83F6` | Action buttons, links, badges, focus ring |
| `--primary-foreground` | `0 0% 100%` `#FFFFFF` | `222 47% 8%` `#0B111E` | Text on primary |
| `--secondary` | `214 32% 91%` `#E1E7EF` | `217 33% 17%` `#1D283A` | Example buttons, subtle surfaces |
| `--muted` | `210 20% 96%` `#F3F5F7` | `217 33% 17%` `#1D283A` | Header/footer bands, secondary backgrounds |
| `--muted-foreground` | `215 16% 45%` `#607085` | `215 20% 65%` `#94A3B8` | Secondary text, labels, icons |
| `--destructive` | `0 72% 51%` `#DC2828` | `0 62% 63%` `#DB6666` | Error text, destructive buttons and badges |
| `--destructive-foreground` | `0 0% 100%` `#FFFFFF` | `222 47% 8%` `#0B111E` | Text on destructive |
| `--destructive-soft` | `0 86% 97%` `#FEF1F1` | `359 80% 15%` `#450809` | Error toast background |
| `--destructive-soft-foreground` | `359 69% 30%` `#811819` | `0 100% 94%` `#FFE0E0` | Error toast text |
| `--success` | `163 94% 24%` `#047756` | `160 70% 50%` `#26D99D` | Status messages, copy confirmation |
| `--border` | `214 20% 88%` `#DAE0E7` | `217 33% 17%` `#1D283A` | Card/table borders, dividers |
| `--input` | `214 20% 85%` `#D1D8E0` | `217 33% 25%` `#2B3B55` | Input borders |

Dark mode applies when `<html>` has the `dark` class (Tailwind's `dark:` variant is `&:is(.dark *)`).

## Color Usage Guidelines

**Primary:** Main action buttons, network class badges, links, focus rings.

**Secondary:** Example CIDR buttons and other low-emphasis controls.

**Muted:** Header and footer bands, secondary text and labels, icon buttons, placeholders.

**Destructive:** Validation errors and the error boundary alert. Error toasts use the softer `--destructive-soft` pair.

**Success:** The subnet table status message and the copy confirmation icon.

Use tokens only: Tailwind palette classes such as `text-green-600` don't follow the theme and fail `tests/unit/ui-styles.test.ts`. The one exception is the decorative depth bars in `subnet-utils.ts`; the prefix length they encode is also shown as text.

**Borders:** Card, table, and form borders; subtle separators.

## WCAG Accessibility Compliance

Every text pair the app renders meets WCAG AA (4.5:1) in both themes. `tests/unit/ui-styles.test.ts` reads the tokens from `index.css` and fails if a change drops a pair below its level.

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
| Focus ring on card (non-text, 3:1) | 5.2:1 | 4.9:1 | AA |

In dark mode the primary and destructive colors are light enough for text on dark surfaces, so text placed on them is dark (`222 47% 8%`); white text on them would fall below 4.5:1.

To check a new color, add it to the pairs in `tests/unit/ui-styles.test.ts` and run `npm test -- --run tests/unit/ui-styles.test.ts`.
