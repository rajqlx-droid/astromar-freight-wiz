## Goal

Make the 3D preview display only the final physically packed cargo: no simulated fly-in/staging, no gap heatmap, no re-shuffle preview offsets, no decorative pallets/dunnage that can look like cargo overlap or floating. The packer remains strict: cargo can touch flush, but cargo cannot overlap and cannot float.

## Findings from the code review

The packer/validator already use the core physical rules:
- Cargo-to-cargo gap: 0 mm allowed, but overlap rejected.
- Side-wall gap: 0 mm allowed.
- Door reserve: 100 mm.
- Ceiling reserve: 80 mm.
- Stacked cargo must be supported.

The confusing parts are mostly in the loading simulator / 3D viewer, not the core pack geometry:
- `shufflePreview` can visually move boxes sideways after packing without re-validating that preview position.
- Step-loader state (`visiblePlacedSet`, `flyInPlacedSet`, `nextPalletIdx`, `followCam`, forklift token) can show cartons in transitional/staged positions, which can look floating or overlapping during animation.
- `gapHeatmapRow` paints red floor/wall overlays based on floor-gap warnings, which are advisory and not physical geometry.
- Decorative floor pallets under non-pallet cartons and per-package stylized shapes can visually extend outside the exact packed bounding box.
- `mp4-muxer` / `webm-muxer` remain in `package.json` after removing the loading video feature.
- Some comments/UI props still refer to 2D/video/recording and should be cleaned up.

## Implementation plan

1. **Make 3D preview geometry-only**
   - Edit `src/components/freight/container-load-view.tsx` so `Container3DView` receives only the final pack and static accuracy flags.
   - Stop passing these visual-only simulator props into the 3D scene:
     - `shufflePreview`
     - `visiblePlacedSet`
     - `gapHeatmapRow`
     - `flyInPlacedSet`
     - `flyInKey`
     - `activePalletIdx`
     - `nextPalletIdx`
     - `followCam`
     - `showForkliftToken`
   - Keep row instructions and HUD only as text/navigation if needed, but do not let them alter cargo positions in the 3D view.

2. **Remove confusing simulator controls from the loading view**
   - Remove the “Gaps” heatmap toggle under the viewer.
   - Remove the “Apply suggested re-shuffle” path from `LoadingRowsPanel` usage, because it creates an unvalidated visual offset.
   - Remove or disable the forklift/fly-in controls in the HUD path if they are still exposed.

3. **Simplify `container-3d-view.tsx` to render exact cargo only**
   - Remove props and code for:
     - shuffle offsets
     - visible-only subsets
     - fly-in animation
     - next-pallet target outline
     - gap heatmap overlay
     - follow camera / forklift token hooks if no longer used
   - Ensure every cargo mesh uses exact dimensions from `PlacedBox` with no shrink/expand scale.
   - Keep only non-geometric outlines (`Edges`) for separation between touching boxes.

4. **Remove visual objects that can be mistaken for cargo geometry**
   - Remove decorative wooden pallets under non-pallet cartons.
   - For true `packageType: "pallet"`, render the palletized unit inside its exact bounding box, but avoid any decorative elements extending outside the packed dimensions.
   - Keep drums/cartons/crates visually distinguishable, but ensure the rendered mesh never exceeds its packed AABB.

5. **Harden packer rules against grid/support drift**
   - Review `evaluatePlacement`, height-map writes, snap pass, and `wouldBeLegal` in `src/lib/freight/packing-advanced.ts`.
   - If needed, make the placement airlock stricter by validating each committed candidate with the same final geometry logic before pushing to `placedInternal`.
   - Keep gap rules simple: flush allowed, overlap blocked, door/ceiling reserve enforced.

6. **Remove leftover video dependencies**
   - Remove `mp4-muxer` and `webm-muxer` from dependencies if no remaining source code uses them.
   - Clean comments and prop descriptions that still mention 2D/video/recording.

7. **Add simulator-specific accuracy tests**
   - Extend `src/lib/freight/packing-advanced.accuracy.test.ts` with tougher cases:
     - the current user-visible cube/mixed-carton cases
     - low-fill spread cases
     - stacked non-grid-aligned dimensions
     - pallets and drums
   - Add assertions that every placed box has:
     - no pairwise AABB overlap beyond epsilon
     - `z = 0` or a matching supporter plane below
     - no door/ceiling breach
     - no renderer-only visual offset path

8. **Run verification**
   - Run the full Vitest suite.
   - Run TypeScript/build checks.
   - Search for leftover `loading-video`, `mp4-muxer`, `webm-muxer`, `shufflePreview`, `gapHeatmap`, `flyIn`, and recording references in active 3D code.

## Expected result

The 3D preview will show a static, exact final packing result only. Any carton that appears in 3D will be at the same coordinates used by the packing validator. Advisory loading rules can still be shown as text, but they will no longer move, animate, hide, or overlay cargo in a way that makes the simulation look physically wrong.