

## What you're seeing

In the screenshot, the blue pallets show **two parallel dark lines** running along their shared seams — most visible on the front face of the blue stack (around the "5.90 m" label) and where blue meets green. That's not pallet borders rendering twice on one box; it's **two adjacent boxes each drawing their own edge line on the shared seam**.

## Root cause

Each box in `CargoBox` (line 1189) renders an `<Edges color="rgba(0,0,0,0.35)" />` outline around its full geometry. When two pallets sit perfectly flush (share a face), both boxes draw the edge at that exact shared seam, so the line is drawn twice. Combined with:

- z-fighting (two coplanar surfaces fighting for the same pixels at depth)
- a slightly transparent edge color (0.35 alpha) that **darkens when overlapped** — two 35% lines stacked = ~58%

…the seam appears as a noticeably darker double-stripe vs. the single edges around the outside of the stack. Same thing happens between the blue stack and the green carton wall — both draw their edge on the meeting plane.

So it's not a bug in the row logic or geometry; it's a **render artefact from drawing edges per-box without dedup**. It does look like a visual error to a user, though, because real pallets in a container don't have a doubled black seam between them.

## The fix

Three small, additive changes in `src/components/freight/container-3d-view.tsx` around the `<Edges>` line (1189):

1. **Use a fully opaque edge colour with very low contrast** instead of 35% alpha black. `#1f2937` at full opacity won't double-darken when two edges overlap, because pixel value is the same regardless of how many times it's drawn. (Alpha-blended overlaps are what cause the doubling.)

2. **Add `renderOrder` + a tiny `polygonOffset`** on the edge material so coplanar edges from neighbouring boxes resolve to the same depth deterministically rather than z-fighting. Drei's `<Edges>` accepts a material prop — set `polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}`.

3. **Inset the edge geometry by ~1 mm** (`scale={0.999}` on `<Edges>`) so each box's outline sits just inside its own face. Adjacent boxes' edges then no longer coincide on the shared seam at all — the seam reads as a clean single thin line where the two faces meet, and only the **outer perimeter** of the stack shows an outline. This is what the user expects: "proper line of their border" = one crisp border per visible silhouette.

Optional polish: when two neighbouring boxes share the **same colour and same item id** (true for stacked identical pallets), suppress the `<Edges>` altogether and let the stack read as one tall block. Out of scope unless you want it.

## Files to change

- `src/components/freight/container-3d-view.tsx` — line 1189 only. ~4 lines changed.

## Out of scope

- Row-grouping / packer logic (already fixed last turn).
- WoodenPallet styling or stack-merging behaviour.

