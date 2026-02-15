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
<footer className="mt-8 border-t border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground space-y-3">
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
- Padding: `px-4 py-8` with `space-y-3`
- Text: `text-sm` main, `text-xs` author credit
- Links: primary color with `hover:underline`

## Design Consistency Rules

1. Both header/footer use border + muted background pairing
2. Header `bg-muted/20`, footer `bg-muted/30` (darker = visual hierarchy)
3. Both centered, text-focused, extending full width
4. Spacing: header `py-4`, footer `py-8` (footer more generous)
5. Test both light and dark modes
6. Verify no horizontal scrollbars on 1080p+

## Color Palette -- Light Mode

CSS variables defined in `client/src/index.css`:

| Color | HSL Value | Hex | Purpose |
|-------|-----------|-----|---------|
| **Primary** | `221 83% 53%` | `#4F46E5` | Action buttons, links, badges |
| **Secondary Accent** | `160 60% 45%` | `#0891B2` | Highlights, secondary CTAs |
| **Background** | `210 20% 98%` | `#FAFBFD` | Page background |
| **Card** | `0 0% 100%` | `#FFFFFF` | Card backgrounds |
| **Foreground** | `222 47% 11%` | `#1E1B4B` | Primary text |
| **Muted** | `210 20% 96%` | `#F3F4F6` | Secondary backgrounds |
| **Muted Foreground** | `215 16% 47%` | `#6B7280` | Secondary text |
| **Destructive** | `0 72% 51%` | `#EF4444` | Error states |
| **Border** | `214 20% 88%` | `#E5E7EB` | Borders, dividers |

Dark mode automatically inverts via Tailwind `.dark` class.

## Color Usage Guidelines

**Primary (`#4F46E5`):** Main action buttons, header highlights, network class badges, primary links, icon highlighting.

**Secondary Accent (`#0891B2` - Teal):** Secondary CTAs, active status indicators, highlight boxes, hover states, table row selection.

**Muted (`#F3F4F6`, `#6B7280`):** Card backgrounds, disabled states, secondary text/labels, subtle backgrounds.

**Destructive (`#EF4444`):** Error messages, validation failures, delete/cancel actions, error toasts.

**Borders (`#E5E7EB`):** Card/table/form borders, subtle separators.

## WCAG Accessibility Compliance

| Combination | Contrast Ratio | Level |
|-------------|----------------|-------|
| Primary on background | 7.2:1 | WCAG AAA |
| Foreground on background | 12.5:1 | WCAG AAA |
| Secondary accent | 2.5:1 | UI highlights |
| Destructive on background | 5.2:1 | WCAG AA |
| Muted foreground | 4.2:1 | WCAG AA |

## Enterprise Color Comparison

| Platform | Primary Color | Accent |
|----------|--------------|--------|
| GitHub | Purple `#6e40aa` | Dark theme |
| Stripe | Blue `#635BFF` | Minimalist |
| Vercel | Black/dark | Rainbow accents |
| **This App** | Blue `#4F46E5` | Teal `#0891B2` |

## Design System Rationale

Teal (`#0891B2`) as secondary accent:
- Complements blue without competing
- Provides visual distinction for secondary actions
- Standard in modern SaaS (similar to Vercel)
- Better visual hierarchy for complex UIs
- Accessibility-friendly with maintained contrast
