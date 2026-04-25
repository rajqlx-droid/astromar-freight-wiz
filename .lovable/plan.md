# Fix overlap/float artefacts during walkthrough playback

## What the user sees

When the optimizer finishes, the static 3D view shows every box at its exact validated slot — zero overlap, zero floating. As soon as the user clicks **Play** or **Next**, boxes appear to **overlap each other** and **some hover in mid-air**. Once the walkthrough finishes (or is reset), everything snaps back to the perfect view.

## End-to-end trace of the playback path

1. `container-load-view.tsx` builds two derived structures from `pack.placed`:
   - `palletSequence` = ordered loader steps via `buildPalletSequence(pack, rows)`. Each step carries `placedIdx` (= `pack.placed.indexOf(box)`).
   - `visiblePlacedIdxs` = `Set` of `placedIdx` for steps `0..palletIdx`.
   - `flyInIdxs` = `Set` containing only `currentStep.placedIdx`.
2. `Container3DView` forwards these to `SceneContents`, which maps `pack.placed` → `<CargoBox>` and skips boxes whose index is NOT in `visiblePlacedIdxs`.
3. Inside `CargoBox`:
   - The mesh group has JSX `position={[cx, cy + palletLift, cz]}` — **the final slot**.
   - When `flyIn === true`, a `useFrame` callback overrides the position imperatively to `(cx + dx, cy + dy, cz)` where `dx, dy` ease from the staging offset down to zero over 600 ms.
   - The staging offset is `+stageOffsetX` toward the door (+x in scene space) and `+stageOffsetY` upward. So the new box swoops **down-and-back** from above the door into its slot.

## Root causes (two distinct bugs)

### Bug 1 — "Overlapping": fly-in path passes through already-placed cargo

The staging position is **up + toward the door**. The slot is **inside the container, possibly at the back wall**. The straight-line interpolation between them passes through every box that is between the slot and the door. Mid-animation, the new box visibly intersects and tunnels through those neighbours. To the user this reads as "the boxes are overlapping during play".

The earlier fix that switched bag/drum/bale shapes to opaque borders made this **more visible** — you can now clearly see the new box clipping through its predecessors instead of it being lost in similar-coloured fills.

### Bug 2 — "Floating": one-frame flash at the slot before staging kicks in

The JSX prop `position={[cx, cy + palletLift, cz]}` is the **final slot**. `useFrame` only runs after React commits, so on the very first frame after `flyIn` flips true, the box is rendered AT its slot for one frame, then jumps to the staging position, then animates back. This is a brief visible "double" at the destination — looks like the box ghosts through whatever sits next to it.

### Bug 3 — "Floating" (real): cross-rank stacked boxes

`buildRows` clusters by floor-pallet x-start with a 200 mm tolerance and assigns each stacked box to the rank whose floor pallets it covers most. Edge case: a stacked box that bridges two ranks gets assigned to whichever has greater overlap. If the picked rank's floor pallet sits at a different x than the stacked box's true supporter, the **supporter box belongs to a later rank** and is therefore not yet visible during the walkthrough — the stacked box appears to float.

This is rare but real. The `placedIdx` ordering in `buildPalletSequence` is per-row, so a box added in row N may depend on a supporter that the row builder has filed under row N+1.

## Fixes

### Fix 1 — Curved fly-in path that clears the cargo column

Replace the straight-line ease-out with a two-phase path:

- **Phase 1 (0 → 0.45):** ease horizontally from `(cx + stageOffsetX, cy + stageOffsetY, cz)` to `(cx, cy + stageOffsetY, cz)` — the box flies along the top of the container until it is directly over its slot. No horizontal pass through other boxes.
- **Phase 2 (0.45 → 1.0):** ease straight down from `(cx, cy + stageOffsetY, cz)` to `(cx, cy, cz)` — the box descends vertically into its slot, mirroring how a real crane / forklift lowers cargo from above. The vertical descent is clear of horizontal neighbours by construction (anything in this column would be the supporter, and the supporter renders before this step).

Both phases use ease-in-out cubic so the transition between them is smooth. Total duration unchanged at 600 ms.

### Fix 2 — Hide the box for one frame until useFrame seats it

When `flyIn === true` and `animStartRef.current === null`, render the group with `visible={false}` so the brief one-frame flash at the final slot is invisible. The first useFrame tick sets `animStartRef.current = 0` and toggles a tiny `staged` ref; from that point on the group is visible and `useFrame` keeps the position correct. Cheap, no extra renders.

Equivalently, render the group at the staging position from the start (JSX `position={[cx + stageOffsetX, cy + stageOffsetY, cz]}` whenever `flyIn` is true) so even before useFrame runs there is no flash at the slot.

### Fix 3 — Auto-include geometric supporters in `visiblePlacedIdxs`

In `container-load-view.tsx`, after computing `visiblePlacedIdxs` from the step indices, **expand the set** to include every box that geometrically supports any visible stacked box, regardless of which row the row-builder filed it under.

A box `s` supports `b` when:
- `|s.z + s.h − b.z| < 2 mm` (top face of `s` is at the bottom face of `b`), and
- footprint of `s` overlaps footprint of `b` in both x and y.

The expansion runs once per `(pack, palletIdx)` change, walks visible boxes, finds supporters in `pack.placed`, and unions them into the set. Cost is O(visible × placed) bounded by ~few thousand boxes — negligible. Result: a stacked box never appears without its physical supporter visible underneath, even if the row clustering put them in different ranks.

This is purely a viewer concern; the packer, gap rules, and validators are untouched.

## Files touched

- `src/components/freight/container-3d-view.tsx`
  - Rewrite the `useFrame` body in `CargoBox` to follow the L-shaped (over-then-down) path.
  - Set the JSX group position to the staging point while `flyIn === true` so there is no single-frame flash at the slot.
- `src/components/freight/container-load-view.tsx`
  - Add a small `expandWithSupporters(visibleSet, pack.placed)` step on top of the existing `visiblePlacedIdxs` memo.

No changes to the packer, validators, gap rules, accuracy tests, palette, adjacency-aware coloring, or borders. The 3D viewer's resting position for every box is still the validated packer slot, so once the walkthrough completes the view is identical to before this change.

## Verification

- Run `bunx tsc --noEmit` (must stay clean).
- Run `bunx vitest run src/lib/freight/packing-advanced.accuracy.test.ts` (must stay green).
- Manual: load a dense 40HC mixed pack, click Play, scrub Next/Prev. Each fly-in should travel up-and-over, then down into the slot, with no box visibly tunneling through any other and no stacked box ever appearing without its supporter underneath.
