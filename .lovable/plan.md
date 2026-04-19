

## The bug

`buildRows()` in `src/lib/freight/loading-rows.ts` groups boxes into a "row" purely by **x-span overlap** along the container length:

```
if (last && b.x < last.xEnd - 1) {
  last.boxes.push(b);          // merge into current row
  if (bxEnd > last.xEnd) last.xEnd = bxEnd;
}
```

The packer (`packing-advanced.ts`, score `x * 10_000 + z * 100 + y * 0.1`) fills the back wall first — so back-wall pallets often have *different lengths* (e.g. a 1170 mm deep pallet next to a 1200 mm deep one with 4 stacked cartons). Once one big pallet sets `xEnd = 1170`, every shorter pallet starting at `x < 1170` gets folded into the same row — even pallets sitting on the opposite side wall with completely different stack configurations.

That's exactly what the screenshot shows: "Row 1" balloons to 5 stacks on one side + 7 stacks + cap cartons on the other side, because all of them happen to overlap somewhere along the x-axis with the deepest back-wall pallet.

## The fix

Change row grouping to be **back-wall-aligned**, not overlap-merged. A row should be defined by the bottom-floor pallets that share roughly the same `x` start position (the actual loader-visible "rank against the wall"), and only those pallets + everything stacked directly on top of them.

### Algorithm
1. Take all boxes on the floor (`z < 10`), sort by `x`.
2. Cluster them into ranks by `x`-start: a new rank starts when the next floor box's `x` is more than `TOL` (e.g. 200 mm) past the **minimum `x`** of the current rank. This keeps slightly staggered same-wall pallets together without absorbing the next rank back.
3. For each rank, claim every non-floor box whose footprint sits **directly above** one of that rank's floor boxes (overlap test on x and y).
4. `xStart` = min floor-box `x` in the rank, `xEnd` = max `x + l` of any box claimed by the rank.

This produces what the user expects:
- Row 1 = the leftmost rank against the back wall = 2 pallets stacked (one on top of the other) on one side, plus the 7-stack column with 4 cartons capped on top, **only if they share the same `x` start**. If they don't (different depth), they become separate rows.
- The next rank forward = Row 2, etc.

### Safety nets
- Keep `TOL = 200 mm` configurable; tune so visually-aligned pallets don't accidentally split.
- Stacked boxes whose footprints don't overlap any single rank's floor pallet (rare — a box bridging two ranks) get assigned to the rank under their **majority footprint**.
- Existing fields (`hasFragile`, `wallUtilizationPct`, `layers`, etc.) recompute the same way — no API change.
- Pallet-sequence (`buildPalletSequence`) consumes `RowGroup[]` so it auto-corrects.
- 3D viewer's `visiblePlacedSet` is built from `palletSequence[].placedIdx`, so step-mode reveal stays in sync automatically.

## Files to change

- **`src/lib/freight/loading-rows.ts`** — replace the body of `buildRows()` with the back-wall-aligned algorithm above. Keep the same return type and field semantics. ~50 lines changed.

That's it. No UI changes, no 3D-viewer changes, no panel-component changes. The bug is one function deep.

## Out of scope

- Changing the packer itself (it places correctly; only the post-hoc row-labelling is wrong).
- Re-rendering the Remotion video.

