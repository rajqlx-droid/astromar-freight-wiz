

## Issue

In the **Export Price** and **Landed Cost** calculators, the per-line summary footer (`Cost: ... • Selling: ...` / `Subtotal · Duty`) is positioned below the input grid with `text-right` and tight `mt-1` spacing. On narrow viewports (~947px preview), it visually crowds the action icons (Copy/Trash) at the top-right of the card and the `+` stepper button of the Margin column, creating overlap appearance. The footer text also wraps into a single tight line with `•` separator that gets cramped.

Additionally, the `NumberField` stepper buttons (`-` / `+`) plus the value can clip in narrow grid cells when the column hits its minimum width.

## Fix

**File: `src/components/freight/export-calculator.tsx` and `src/components/freight/landed-calculator.tsx`**

1. **Promote the per-line summary to a clear, separated footer**:
   - Move from `text-right text-[11px]` to a left-aligned `flex flex-wrap items-center gap-x-3 gap-y-1` row.
   - Add `mt-2 border-t pt-2` so it visually separates from the input grid (no more apparent overlap).
   - Use small pill-style chips (`rounded bg-brand-navy-soft/40 px-2 py-0.5`) for `Cost` / `Selling` (export) and `Subtotal` / `Duty` (landed) so they don't run into each other on wrap.

2. **Prevent stepper crowding**: ensure `NumberField` cells have `min-w-0` so the input + stepper buttons size correctly inside the grid (verify the current implementation if needed, otherwise add `min-w-0` to the wrapping div in the line-item grid).

3. **Header row**: keep `Line N` and the icon buttons but add `min-h-7` so the row reserves consistent height regardless of the summary below.

## Slow preview note

The "loading very long in preview" observation is most likely Vite HMR rebuilding after recent edits to `air-calculator.tsx` and `freight-intelligence.tsx` route, plus the heavy `routeTree.gen.ts` regeneration. No code change is needed; once the layout fix lands and HMR settles, the preview should respond normally. If it persists, a hard reload of the preview tab clears stale module graph.

## Files touched

- `src/components/freight/export-calculator.tsx` — footer layout
- `src/components/freight/landed-calculator.tsx` — footer layout

No new dependencies, no schema changes, no logic changes — purely visual reorganization.

