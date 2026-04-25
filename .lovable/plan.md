# Bag 3D shape: rectangular sack with carrying ears

## Today

In `src/components/freight/container-3d-view.tsx`, `BagShape` (line 1380) renders bags as a **sphere** scaled to `lm × hm × wm`. That looks like a generic blob and ignores how the cargo is actually stacked in the container — the sphere doesn't sit flush, doesn't tile, and reads as "ball" not "sack."

The 2D icon in `package-type-icon.tsx` already shows the correct mental model: a sack with a tied/handled neck.

## What changes

Rewrite `BagShape` so a bag in the 3D view is a **soft rectangular sack** at its real `L × H × W` footprint, with two small **"ears"** (tied / carry-handle nubs) on top.

Visually:

```
        .─.       .─.
       (   )-----(   )       ← two ear nubs at top length-ends
        '─'       '─'
       ╭─────────────╮
       │             │       ← rounded-corner sack body
       │             │         at full L × H × W
       ╰─────────────╯
```

### Implementation

1. Add `RoundedBox` to the existing drei import (`@react-three/drei` is already a dep, `RoundedBox` is exported).
2. Replace the spherical body with `<RoundedBox args={[lm, hm, wm]} radius={…} smoothness={3} />` — corner radius derived from the smallest dimension (~18 % of `min(lm, hm, wm)`, capped) so a tall bag still looks plump and a flat bag stays thin.
3. Add two small sphere "ears" on the top face, positioned at the +/- length ends (`x = ± lm/2`, `y = hm/2 + earR`, `z = 0`). Ear radius scales with `min(hm, wm) * 0.12` so it stays proportionate.
4. Same colour, roughness 0.95, no metalness, hover-emissive behaviour preserved.
5. Sack rotates correctly when the packer tilts the bag — because the geometry is dimension-driven, the ears always sit on whichever face is "up" after rotation (the parent group already applies the rotation transform).

### Why ears at the length-ends (not corners)

Industrial sacks (cement, grain, fertiliser) carry from two pinch-points along the long edge. Anchoring ears at `± lm/2` mirrors that real-world grip and reads correctly even when bags are stacked tightly side-by-side along the width axis.

## Files to edit

- `src/components/freight/container-3d-view.tsx` — import `RoundedBox` from drei; rewrite the `BagShape` function (~16 lines → ~50 lines).

## Out of scope

- 2D `PackageTypeIcon` (already correct).
- PDF bag glyph in `pdf-icons.ts` (separate render path, not requested).
- Drum / bale / pallet / crate / carton shapes — unchanged.

## Verification

- Pick "bag" as package type, open container 3D view → bags render as soft rectangular sacks at their real dimensions with two visible ear nubs on top.
- Tilt a bag (axis rotation) → the ears follow the rotation; sack still reads correctly with the new "top" face.
- Stack bags → they tile flush along their footprints (no more gaps from spherical curvature).
