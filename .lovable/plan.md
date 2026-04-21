

## Fix typing lag and incorrect Total CBM in CBM Calculator

Two related issues are slowing the CBM calculator and producing the wrong "Total CBM" you see in the screenshot. Both come from the same root cause: heavy 3D packing math is running on every keystroke, and the on-screen totals are computed from two different states (live draft vs. debounced commit), so they disagree mid-typing.

### What's wrong today

1. **Total CBM lags / looks wrong**
   - The per-row "CBM" tile reads from `draftItems` (live, every keystroke).
   - The Results card "Total CBM" reads from `items` (debounced 400-800ms behind).
   - The "X of Y placed" badges on container suggestions use a rough CBM-based estimate (`cargoCbm × 0.85`), not the real packer output, so counts disagree with the 3D viewer.

2. **Typing slows down with 5+ items**
   - `recommendContainers(items)` runs `packContainerAdvanced` synchronously on the main thread against every container preset, **even when the user hasn't clicked "Optimize loading" yet**.
   - For multi-container loads it then runs the packer again inside `splitMulti` (potentially 5-10+ full packs).
   - `unitStats` calls `splitItemsAcrossContainers` which runs the packer yet again.
   - Each pack at 100+ cartons = 200-1000ms blocking the main thread → input feels frozen.
   - Result: every debounce flush triggers ~1-3s of synchronous packing on the main thread.

### Plan

**1. Stop running the 3D packer on every keystroke**
   - Gate `recommendation` and `unitStats` in `src/components/freight/cbm-calculator.tsx` behind `showOptimization` (or at minimum `optimizationRequested`). Before the user clicks "Optimize loading", show a lightweight CBM-only recommendation using the legacy numeric path (`recommendContainers(totalCbm, totalWeight)`) — no geometry packing.
   - After the user opts in, run the geometry-aware version, but move it off the main thread via the existing `usePackingWorker` hook (already wired for `multi`).

**2. Make Total CBM correct and live**
   - Compute `result` from `draftItems` (not `items`) so per-row tiles and Total CBM always agree.
   - Keep the debounced `setItems(draftItems)` for *downstream* heavy work (recommender, packer), but unbind the lightweight CBM total from it.
   - Same for `inputsTable` and `staticExtras` totals — derive from `draftItems`.

**3. Fix the "X of Y placed" badge mismatch**
   - When `recommendation` becomes worker-driven, derive `unitStats.placed` from the actual `AdvancedPackResult.placedCartons` per bucket (returned by the worker's `multi` call), not from the `× 0.85` heuristic. Cache the multi-pack results and reuse them in `ContainerLoadView` instead of re-packing.

**4. Lighten input rendering**
   - The whole row list re-renders on every keystroke because `draftItems` is a fresh array. Extract the row body into a memoised `<CbmRow>` component (`React.memo`) keyed by `it.id`, with stable callbacks via `useCallback`. With 10-20 rows this drops per-keystroke render cost to ~1 row instead of all rows.
   - Tighten the debounce: 250ms for ≤10 items, 600ms for >10 (current 400/800 is too aggressive on small manifests, too loose on large).

### Files to change

- `src/components/freight/cbm-calculator.tsx` — gate recommender behind opt-in; switch totals to `draftItems`; extract memoised `<CbmRow>`; wire worker for recommendation; consume real per-bucket pack counts.
- `src/lib/freight/container-recommender.ts` — expose a cheap CBM-only `recommendContainersFast(totalCbm, totalWeightKg)` for the pre-optimize banner (the legacy numeric overload already does this; surface it as a named export for clarity).
- `src/lib/freight/packing-worker.ts` + `src/hooks/use-packing-worker.ts` — add a `recommend` request kind that runs `recommendContainers(items)` inside the worker, returning `{ recommendation, bucketPacks }` so the UI gets one round trip instead of three.

### Expected outcome

- Typing into Length/Width/Height/Qty stays smooth at 20+ items across 10 containers — no main-thread packing during edits.
- "Total CBM" updates instantly with each keystroke and matches the sum of per-row CBM tiles exactly.
- Container suggestion badges ("12 / 16 placed") match what the 3D viewer renders.
- After clicking "Optimize loading", a brief "Calculating…" state appears while the worker runs, then everything settles — UI never freezes.

