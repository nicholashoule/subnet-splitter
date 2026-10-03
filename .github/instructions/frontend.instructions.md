---
applyTo: "client/**"
---

# Frontend Instructions

## Stack

- React 18 with TypeScript (strict mode)
- Tailwind CSS 4 for all styling
- shadcn/ui component library (Radix UI primitives)
- Forms use plain React state with validator functions (no form library)
- Vite 8 for bundling and HMR (`npm run dev` serves it through Express on `127.0.0.1:5000`; `npm run build` writes `dist/public`)

## Key Files

| File | Purpose |
|------|---------|
| `client/src/App.tsx` | Main application component (renders Calculator on `/`, NotFound otherwise; no router library) |
| `client/src/main.tsx` | React entry point |
| `client/public/theme-init.js` | Applies the saved theme before first paint (classic script in `index.html` `<head>`; same rule as `lib/theme.ts`) |
| `client/src/lib/theme.ts` | Theme runtime API: read, save, and apply the light/dark choice (`localStorage` key `theme`) |
| `client/src/index.css` | Global styles, CSS variables, elegant-scrollbar |
| `client/src/lib/subnet-utils.ts` | Core CIDR calculation logic, plus the calculator table's rows, tree updates, and CSV export |
| `client/src/lib/kubernetes-network-generator.ts` | Kubernetes network plan generator used by the API (first-fit subnet layout, separated pod/service ranges, one-network control plane, `networkMode` public/private layouts with `subnets.loadBalancer`); its invariants are enforced by `tests/unit/network-separation.test.ts`, and `server/openapi.ts` builds its examples from it |
| `client/src/lib/utils.ts` | Helper functions |
| `client/src/pages/calculator.tsx` | Calculator page component |
| `client/src/components/ui/` | shadcn/ui components |

## Component Rules

- Use functional components with hooks only
- Keep forms simple: React state plus a validator function such as `validateCidrInput()`
- Use shadcn/ui as the base UI library
- No implicit `any` -- TypeScript strict mode
- Components: PascalCase filenames (`Calculator.tsx`)
- Utilities: camelCase filenames (`subnet-utils.ts`)

## Styling Rules

- **Tailwind utility classes exclusively** -- no inline styles
- Custom styles only in `index.css` for reusable patterns (e.g., `.elegant-scrollbar`)
- Support both light and dark modes via Tailwind `dark:` prefix
- No hardcoded colors -- all via CSS variables; Tailwind palette classes (`text-green-600`, `bg-gray-50`) fail `tests/unit/ui-styles.test.ts` (only the decorative depth bars in `subnet-utils.ts` are exempt)
- No horizontal page scrollbar on 1080p+ screens or at 320px wide (WCAG 1.4.10 reflow): rows of buttons use `flex-wrap`; only the subnet table scrolls sideways, inside its own container

### CSS Variables

Colors defined in `client/src/index.css` (`:root` and `.dark` selectors):

| Variable | Purpose |
|----------|---------|
| `--primary` / `--primary-foreground` | Action buttons, links, focus ring (blue); text on primary |
| `--secondary` | Example buttons, network class badges, subtle surfaces |
| `--background` / `--card` | Page and card backgrounds |
| `--foreground` | Primary text |
| `--muted` / `--muted-foreground` | Secondary backgrounds/text |
| `--destructive` / `--destructive-foreground` | Error text; destructive buttons and badges |
| `--destructive-soft` / `--destructive-soft-foreground` | Error toasts |
| `--success` | Status messages, copy confirmation |
| `--border` / `--input` | Borders, dividers; input borders (3:1 against card and background) |
| `--ring` | Focus ring (same as `--primary`) |

The API docs page (`server/swagger-ui.ts`) mirrors these tokens; a test fails if they drift.

### Adding New Colors

1. Add to both light and dark mode in `index.css`
2. Map it in the `@theme inline` block in `index.css` (e.g. `--color-highlight: hsl(var(--highlight));`); Tailwind v4 has no `tailwind.config.ts`
3. Use semantic naming: `--highlight`, `--success`
4. Test WCAG contrast ratios in both themes

See [docs/ui-examples.md](../../docs/ui-examples.md) for full color tables and component examples.

### Tailwind Troubleshooting

- Tailwind CSS v4 runs through `@tailwindcss/vite` (Rust engine: Oxide scans sources automatically, Lightning CSS adds prefixes); there is no `tailwind.config.ts`, `postcss.config.js`, or content list
- Theme configuration lives in `client/src/index.css` (`@theme inline`); animations come from `tw-animate-css` (`animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`)
- v4 renamed scales: v3 `shadow-sm` is v4 `shadow-xs`, `outline-none` is `outline-hidden`; `space-y-*` no longer adds margin before an absolutely positioned first child
- Use real browser for development (VS Code Simple Browser has HMR issues)
- Hard refresh (`Ctrl+Shift+R`) if CSS changes don't appear

## Accessibility (WCAG)

Every text pair the app renders meets WCAG AA (4.5:1) in both themes; `tests/unit/ui-styles.test.ts` reads the tokens from `index.css` and checks them (light / dark):

- Foreground on background: 17.1 / 18.1 (AAA)
- Primary on background: 5.0 / 5.2; text on primary buttons: 5.2 / 5.2
- Muted foreground on background, card, and footer: 4.8 or better / 6.9 or better
- Destructive on card: 4.8 / 5.2; success on card: 5.6 / 9.8; error toast text: 9.2 / 13.2
- Non-text (3:1): input borders 3.3 / 3.3 on card and 3.2 / 3.4 on background; focus ring 5.0 / 5.2 on background and 5.2 / 4.9 on card
- In dark mode, primary and destructive surfaces use dark text (`--primary-foreground` and `--destructive-foreground` are `222 47% 8%`); white text on those colors is below 4.5:1
- Errors pair color with text, never color alone; links inside text are always underlined (`underline underline-offset-2`), not only on hover
- Icon-only toggles name the action and update with state (`Switch to light mode` / `Switch to dark mode`)
- Focus: buttons, inputs, and checkboxes use `focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-background`; the gap keeps the ring (`--ring` = `--primary`) visible on primary buttons
- Headings: one `h1`; `CardTitle` renders an `h2` and holds only its text (toolbars go beside it). Name a table by its heading with `aria-labelledby`
- Inputs are named by their visible label or heading (`aria-labelledby`), so the accessible name matches the text on screen (WCAG 2.5.3)
- Messages: validation errors are `role="alert"` plus `aria-invalid`/`aria-describedby`; status text goes in an always-mounted `role="status"` region. Key each message on a new id so repeated text is announced again
- Pointer targets are at least 24x24 px (WCAG 2.5.8); size icons through the Button's `[&_svg]:size-4` rather than classes on the icon, which it overrides
- See [docs/ui-examples.md](../../docs/ui-examples.md#accessibility-patterns) for how the calculator applies these

## Icons

- **Lucide React only** -- no unicode icons or special characters
- All icons from the `lucide-react` package
- Exception: status text labels and messages are fine

## Subnet Calculation Logic

Core logic in `client/src/lib/subnet-utils.ts`:

- `calculateSubnet()` -- all subnet info from CIDR notation
- `splitSubnet()` -- recursive splitting down to /32
- `getSubnetClass()` -- network class (A-E) identification
- `validateCidrInput()` -- calculator form validation; returns an error message or `null` and requires the network address (e.g., `192.168.1.0/24`, not `192.168.1.5/24`)
- `collectVisibleRows()` -- the subnet table's rows with depth and parent CIDR; Hide Parents, "select all", and the export all use it
- `splitSubnetInTree()` / `removeSplitInTree()` -- immutable split and remove-split updates; the split enforces the whole-tree node limit
- `selectedVisibleSubnets()` / `subnetsToCsv()` -- the CSV export
- Validates CIDR format, octet ranges, prefix 0-32
- Handles RFC 3021 /31 (point-to-point) and /32 (host routes)
- RFC 1918 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16

## CSV Export

Exports the selected rows that are visible (`selectedVisibleSubnets()`; rows hidden by Hide Parents or a removed split are skipped), in table order, with all subnet details: CIDR, network/broadcast addresses, host range, masks, prefix length (`subnetsToCsv()`).

File naming: `subnet-export-YYYY-MM-DD.csv`

## Header & Footer

- Header: `border-b border-border bg-muted/20`, full-width via `-mx-6 px-6`
- Footer: `border-t border-border bg-muted/30`, slightly darker for hierarchy
- Both centered, text-focused, responsive
- QR code image: `client/public/github-nicholashoule.png` (64px, rounded, hover opacity)

See [docs/ui-examples.md](../../docs/ui-examples.md) for full implementation code.

## Performance

- All subnet calculations are client-side (no network requests)
- The subnet table renders a flat list of memoized rows from `collectVisibleRows()`. Each row gets primitives (`depth`, `parentCidr`, a boolean `selected`), stable callbacks, and its subnet object, which `splitSubnetInTree()` / `removeSplitInTree()` replace only along the path to the change, so a checkbox re-renders one row and a split only the rows on the path to it
- Monitor component re-renders with React DevTools
- Test with large subnet hierarchies (many splits)

## Code Review Checklist

- [ ] TypeScript compilation passes (`npm run check`)
- [ ] Production build passes (`npm run build`)
- [ ] No console warnings or errors
- [ ] No horizontal page scrollbar on 1080p+ screens or at 320px wide
- [ ] Works in both light and dark modes
- [ ] Follows existing code style
- [ ] WCAG accessibility maintained
