

## Plan: Tighter packing — close residual gaps

Goal: eliminate visible gaps between boxes in the 3D view by (a) scanning candidate positions on a finer grid, then (b) snapping each chosen placement tight against its left/back neighbour (or wall).

### Changes — single file: `src/lib/freight/packing-advanced.ts`

**1. Drop scan stride 100mm → 50mm**
- `PLACE_STEP_MM`: `100` → `50`
- Inside the orientation loop, the per-box adaptive stride already uses `Math.max(50, …)` so the floor stays 50mm; the cap also drops to 50mm. This roughly 4× the candidate positions evaluated — still fast for typical cargo counts (hundreds of boxes), and the `evaluatePlacement` early-exits keep the inner loop cheap.

**2. Snap-to-neighbour after pick**
After `bestPick` is chosen and before writing the box, slide it:
- **−X (toward back wall)**: while `x > 0`, try `x' = max(0, x - 1mm)`; re-evaluate; if still valid (in bounds, support ratio ≥ threshold, no sealed cells, weight OK, same Z), accept and continue. Use a coarse-then-fine slide (10mm steps until invalid or hits 0, then back off and 1mm steps) so it's O(stride) not O(C.l).
- **−Y (toward left wall)**: same idea on the Y axis.
- This collapses any sub-stride gap left by the 50mm scan, and also closes the gap when a box's chosen XY happened to land just past a shorter neighbour.

The snap re-uses the existing `evaluatePlacement` + the existing weight/seal/support checks — no new validation logic. Z is held fixed (we only slide horizontally on the same resting plane); if the supporter set changes during the slide we re-run the weight check against the new supporters.

**3. Keep everything else unchanged**
- Skyline grid stays at `CELL_MM = 100` (the resolution of the height-map). Snap operates in mm; the height-map update at the end already covers the footprint via `Math.floor`/`Math.ceil`, so finer XY positions are safely quantised back into the grid.
- Scoring, sort order, support ratio, fragile/seal logic, COG calc, render cap — all untouched.

### Out of scope
- The 3D render scale fix (`1.001x`) from the original Part 4 is **not** included — user only asked for the packer-side density fix.
- The runtime hydration warning about `UnitSelector` is unrelated and will be left alone.

### Risk
- Slight perf cost from the finer grid + snap loop. Bounded: snap is O(C.l/10 + 10) ≈ ~130 evaluations max per box; scan is ~4× more candidates. Still well under a frame for typical loads.
- Snap could theoretically push a box into a corner where stack-weight on a *different* supporter set fails — handled by re-running supporter weight check inside the slide.

