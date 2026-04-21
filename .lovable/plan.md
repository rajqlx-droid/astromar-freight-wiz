

## Fix FAQ alignment + add Quick Reference card

### Change in `src/routes/freight-intelligence.tsx` (FAQ section, ~lines 677–695)

1. **Width fix**: change wrapper from `max-w-4xl` → `max-w-7xl` so FAQ aligns with the "Need expert assistance" banner above and footer below.

2. **Two-column grid**: wrap heading + content in `grid gap-8 md:grid-cols-[1fr_320px]`. Heading spans full width via `md:col-span-2`. FAQ accordion goes in the left column.

3. **Right column — "Quick reference" card** (fills the empty space, no duplicate of contact banner):
   - `bg-brand-navy-soft border border-brand-navy/10 rounded-2xl p-6 self-start`
   - Icon badge: `BookOpen` (lucide) on `bg-brand-orange/15` rounded circle
   - Heading: "Quick reference"
   - Compact bullet list (cheat-sheet of the most-used freight constants from the FAQ answers):
     - Sea LCL divisor: `÷1000` (1 CBM = 1000 kg)
     - Air IATA divisor: `÷6000`
     - 20' GP usable: ~28 CBM
     - 40' GP usable: ~58 CBM
     - 40' HC usable: ~68 CBM
     - Indian port free days: 4–5
   - Muted footer line: "Always verify duty/HSN with your CHA."

4. **Mobile** (`< md`): grid collapses to single column — accordion first, reference card below. Keeps the 948px viewport tidy.

5. **Imports**: add `BookOpen` to the existing `lucide-react` import line in this file. No new packages.

### Out of scope
- "Need expert assistance" banner above stays exactly as-is.
- FAQ questions and answers unchanged.
- No other sections, calculators, or routes touched.

### Files touched
- `src/routes/freight-intelligence.tsx` — FAQ section only (wrapper width, grid layout, new right-column card, one icon import).

