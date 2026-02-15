---
applyTo:
  - "client/**"
---

# Frontend Instructions

## Stack

- React 18 with TypeScript (strict mode)
- Tailwind CSS for all styling
- shadcn/ui component library (Radix UI primitives)
- React Hook Form with Zod validation
- Vite for bundling and HMR
- TanStack React Query for data fetching

## Key Files

| File | Purpose |
|------|---------|
| `client/src/App.tsx` | Main application component |
| `client/src/main.tsx` | React entry point |
| `client/src/index.css` | Global styles, CSS variables, elegant-scrollbar |
| `client/src/lib/subnet-utils.ts` | Core CIDR calculation logic |
| `client/src/lib/queryClient.ts` | React Query client and API utility |
| `client/src/lib/utils.ts` | Helper functions |
| `client/src/pages/calculator.tsx` | Calculator page component |
| `client/src/components/ui/` | shadcn/ui components |

## Component Rules

- Use functional components with hooks only
- Prefer React Hook Form for forms with Zod validation
- Use shadcn/ui as the base UI library
- No implicit `any` -- TypeScript strict mode
- Components: PascalCase filenames (`Calculator.tsx`)
- Utilities: camelCase filenames (`subnet-utils.ts`)

## Styling Rules

- **Tailwind utility classes exclusively** -- no inline styles
- Custom styles only in `index.css` for reusable patterns (e.g., `.elegant-scrollbar`)
- Support both light and dark modes via Tailwind `dark:` prefix
- No hardcoded colors -- all via CSS variables
- No horizontal scrollbars on 1080p+ screens

### CSS Variables

Colors defined in `client/src/index.css` (`:root` and `.dark` selectors):

| Variable | Purpose |
|----------|---------|
| `--primary` | Action buttons, links, badges (blue) |
| `--secondary-accent` | Highlights, secondary CTAs (teal) |
| `--background` | Page background |
| `--foreground` | Primary text |
| `--muted` / `--muted-foreground` | Secondary backgrounds/text |
| `--destructive` | Error states |
| `--border` | Borders, dividers |

### Adding New Colors

1. Add to both light and dark mode in `index.css`
2. Update `tailwind.config.ts` theme extension
3. Use semantic naming: `--highlight`, `--success`
4. Test WCAG contrast ratios in both themes

See [docs/ui-examples.md](../../docs/ui-examples.md) for full color tables and component examples.

### Tailwind Troubleshooting

- Content config: use `"./client/**/*.{js,jsx,ts,tsx}"` (simple globs only)
- PostCSS: keep `postcss.config.js` minimal (`tailwindcss: {}`, `autoprefixer: {}`)
- Use real browser for development (VS Code Simple Browser has HMR issues)
- Hard refresh (`Ctrl+Shift+R`) if CSS changes don't appear

## Accessibility (WCAG)

- Primary on background: 7.2:1 (WCAG AAA)
- Foreground text: 12.5:1 (WCAG AAA)
- Destructive: 5.2:1 (WCAG AA)
- Muted foreground: 4.2:1 (WCAG AA)
- Status colors differentiate by brightness, not color alone

## Icons

- **Lucide React only** -- no unicode icons or special characters
- All icons from the `lucide-react` package
- Exception: status text labels and messages are fine

## Subnet Calculation Logic

Core logic in `client/src/lib/subnet-utils.ts`:

- `calculateSubnet()` -- all subnet info from CIDR notation
- `splitSubnet()` -- recursive splitting down to /32
- `getSubnetClass()` -- network class (A-E) identification
- Validates CIDR format, octet ranges, prefix 0-32
- Handles RFC 3021 /31 (point-to-point) and /32 (host routes)
- RFC 1918 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16

## CSV Export

Exports all subnet details: CIDR, network/broadcast addresses, host range, masks, prefix length.

File naming: `subnet-export-YYYY-MM-DD.csv`

## Header & Footer

- Header: `border-b border-border bg-muted/20`, full-width via `-mx-6 px-6`
- Footer: `border-t border-border bg-muted/30`, slightly darker for hierarchy
- Both centered, text-focused, responsive
- QR code image: `client/public/github-nicholashoule.png` (64px, rounded, hover opacity)

See [docs/ui-examples.md](../../docs/ui-examples.md) for full implementation code.

## Performance

- All subnet calculations are client-side (no network requests)
- Optimize table rendering with React best practices
- Monitor component re-renders with React DevTools
- Test with large subnet hierarchies (many splits)

## Code Review Checklist

- [ ] TypeScript compilation passes (`npm run check`)
- [ ] No console warnings or errors
- [ ] No horizontal scrollbars on 1080p+ screens
- [ ] Works in both light and dark modes
- [ ] Follows existing code style
- [ ] WCAG accessibility maintained
