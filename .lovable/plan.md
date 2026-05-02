## Direction

Maersk/Flexport-grade enterprise polish. Same layouts, same components, same routes — just calmer, more confident, more "logistics multinational." No new pages, no structural changes, no risk to packing math or 3D viewer.

The current app reads as "indie SaaS" because of three things: heavy gradients on the dark background, neon-ish accents, and generic spacing/typography. The fix is restraint — not addition.

## Visual principles applied

1. **Quieter palette, cleaner whitespace.** Brand navy + orange stay, but accents drop in saturation; backgrounds become near-white in light mode and a deeper, flatter slate-navy in dark mode (less purple, less glow).
2. **Typographic hierarchy.** Adopt **Inter Tight** (display, –0.02em tracking) for headings + **Inter** for body, weights 400/500/600 only. Larger H1, smaller body, tighter line-height. This single change is what makes apps suddenly look "Stripe-tier."
3. **Restrained surfaces.** Replace glassy/gradient panels with flat cards: 1px hairline borders, `rounded-xl` (12px), one subtle shadow token (`shadow-sm`). Remove decorative gradients on cards and the hero strip.
4. **Confident accent use.** Orange becomes a *signal* color (CTAs, active state, key metrics), not a decoration. Navy becomes the workhorse. Most surfaces are neutral.
5. **Tabular polish.** Calculator inputs get consistent 40px height, monospaced numerals (`font-variant-numeric: tabular-nums`) on all numeric outputs (CBM, weight, totals) — instantly reads "enterprise."
6. **Motion discipline.** Remove the shimmer sweep on the hero banner. Keep only one micro-interaction: 150ms ease on hover/focus.

## Concrete token changes (`src/styles.css`)

- Light: `--background` stays white; `--muted` → soft slate `oklch(0.97 0.005 250)`; `--border` lightened to `oklch(0.94 0.008 250)`; `--brand-orange` desaturated slightly for chrome use, full strength reserved for `--brand-orange-strong` on CTAs.
- Dark: `--background` → flatter `oklch(0.18 0.015 255)` (less blue cast, no purple); `--card` → `oklch(0.21 0.018 255)`; borders to `oklch(1 0 0 / 8%)`; remove the bright orange-soft tint.
- New tokens: `--shadow-elevated` (single soft shadow), `--font-display`, `--font-body`, `--radius` reduced from 0.625rem → 0.5rem for a more corporate feel.
- Add Inter + Inter Tight via `<link>` in `__root.tsx`.

## Surfaces touched (polish-only, no structural edits)

- `__root.tsx` — load fonts, set body font stack.
- `src/styles.css` — token refresh as above + tabular-nums utility class.
- Header in `freight-intelligence.tsx` — tighten padding, replace any gradient with flat surface, refine the breadcrumb + tab strip.
- Hero "Get your container optimization plan" banner — flatten gradient, remove shimmer, switch icon container to a clean square with hairline border, give the truck illustration more breathing room.
- Calculator card (`cbm-calculator.tsx`) — unify input heights, apply tabular nums to CBM/weight/qty displays, soften the "Pro tip" yellow strip into a neutral info row with a small orange dot.
- Results card — flatten the orange CBM badge into a clean metric tile, align numbers right with tabular nums.
- 3D viewer chrome (`container-3d-view.tsx`) — only the *frame* around the canvas: thinner border, refined camera buttons (Iso/Front/Side/Top/Inside) with proper active state, cleaner playback bar. Canvas content untouched.
- Buttons (shadcn variants) — primary navy with subtle hover lift; CTA "Optimize loading" stays orange but loses gradient.

## What does NOT change

- No route, file, or component restructure.
- No change to packing engine, worker, 3D scene contents, Loading Rows, or PDF output.
- No new dependencies beyond the Google Fonts `<link>`.
- All copy stays the same.

## Acceptance check

After the pass, on both desktop and mobile the app should:
- Read as a logistics-enterprise tool, not a colorful SaaS.
- Have one accent color (orange) used sparingly and meaningfully.
- Show numbers in tabular numerals throughout the calculator.
- Have no gradients on cards, no shimmer, no glow.
- Maintain identical functionality (verified via the same 50-carton test we just ran).
