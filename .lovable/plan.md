# High-contrast cargo colors + clear borders + adjacency-aware coloring

## Goal

Make every distinct cargo item in the 3D simulation immediately distinguishable, put a clear contrasting border on every package so any overlap between neighbours is obvious, and ensure the color picked for each placed box always **contrasts with whatever is touching it** — so two boxes flush against each other never share the same fill.

## Problems with the current rendering

1. **Palette is too short and too similar** — only 8 colors, the 9th SKU loops back to teal, teal/cyan and yellow/lime are nearly identical hues.
2. **Same-SKU adjacency** — when one SKU has 200 cartons, every neighbour is the same color, so internal seams are invisible.
3. **Borders are inconsistent** — drums, bales, and bags have no outline at all; cartons/crates/pallets have outlines but in fixed colors that disappear on dark or brown fills.

## What changes

### 1. New 20-color high-contrast palette (`src/lib/freight/packing.ts`)

Replace the 8-color `ITEM_COLORS` array with a curated **20-color** palette engineered for maximum hue separation and stable mid-tone luminance (so every box reads against both the dark container interior and the wooden pallet floor). The sequence interleaves warm/cool so the first 10 SKUs (covers virtually every real shipment) all sit on opposite hue arcs.

```text
#ef4444  red          #06b6d4  cyan
#f97316  orange       #3b82f6  blue
#eab308  amber        #8b5cf6  violet
#84cc16  lime         #ec4899  pink
#10b981  emerald      #f43f5e  rose
#14b8a6  teal         #a855f7  purple
#22c55e  green        #0ea5e9  sky
#facc15  yellow       #d946ef  fuchsia
#fb7185  coral        #2dd4bf  aqua
#fbbf24  gold         #c084fc  lavender
```

Modulo wraparound only kicks in past 20 SKUs.

### 2. Adjacency-aware color shifting (the "no two touching boxes share a color" rule)

This is the new piece. The packer assigns one base color per **SKU** (item index → palette). When we render, we walk the placed boxes and, for any box whose **neighbour shares its base color**, we shift the rendered fill to a contrasting variant so the seam is always visible.

How it works:

- A new helper `assignDisplayColors(placed)` runs once after packing (cheap — N²ish but N is bounded by container capacity, ~few thousand max, and we use a spatial hash keyed by 100 mm cell so it's effectively O(N)).
- Two boxes are "touching" if their AABBs share a face (`|gap| < 2 mm` in one axis and overlap in the other two).
- For each box we compute the set of base colors of its touching neighbours. If the box's own base color is in that set, we pick from **two precomputed shade variants** of the same hue (a lighter tint and a darker shade, both ~25 % luminance offset). We pick whichever variant differs most from every touching neighbour's current rendered color.
- Result: a single-SKU wall of 200 cartons renders as a **subtle 3-tone checkerboard** of the same hue family — the overall color still tells you "this is SKU A", but every individual carton has a visible border with its neighbour. Mixed-SKU loads keep their distinct base hues unchanged because the SKUs themselves already differ.
- Helpers exported: `lighten(hex, amount)`, `darken(hex, amount)`, `pickEdgeColor(hex)`.

This runs purely on the render side. The packer's `box.color` still holds the SKU base color (used by legends, the load report, the per-item stats panel). The 3D view consumes a parallel `displayColor` map.

### 3. Always-on contrast borders for every package type

Border color is computed from each box's **rendered** fill via `pickEdgeColor(fill)`: returns near-black `#0b1220` when the fill's perceived luminance ≥ 0.5, near-white `#f8fafc` otherwise. Used everywhere edges render.

Edges are added to the three shapes that currently lack them:

- **DrumShape**: `<Edges>` overlay on the cylinder (drei draws silhouette + crease lines).
- **BaleShape**: edges on the main bale box, in addition to the existing dark bands.
- **BagShape**: edges on the rounded sack body so two adjacent bags of the same SKU show a clear seam.

### 4. Adaptive edge colors for shapes that already have them

- **CartonShape**: replace fixed `#1f2937` with `pickEdgeColor(displayColor)`.
- **CrateShape**: replace `#3a2818` with `pickEdgeColor(displayColor)` (currently brown-on-brown is invisible).
- **PalletShape**: replace `#5a7a90` with `pickEdgeColor(displayColor)`.

Edges keep their `polygonOffset` settings to prevent z-fighting; new edges on drums/bales/bags use the same trick.

### 5. Slight luminance bump on hover (existing behaviour preserved)

Edge color flips to `tiltColor` on hover so the highlighted box reads as "selected" from far away.

## Files touched

- `src/lib/freight/packing.ts` — replace `ITEM_COLORS` with the 20-color palette; add `pickEdgeColor()`, `lighten()`, `darken()` helpers.
- `src/lib/freight/display-colors.ts` (**new**) — `assignDisplayColors(placed)` that returns `Map<boxId, hex>` using the touching-neighbour rule.
- `src/components/freight/container-3d-view.tsx` — call `assignDisplayColors` once per pack, plumb the resulting map down to `BoxMesh`, swap fixed edge colors for adaptive ones in `CartonShape` / `CrateShape` / `PalletShape`, add `<Edges>` to `DrumShape` / `BaleShape` / `BagShape`.

No changes to packing logic, gap rules, validators, or tests. `box.color` (the SKU base) is unchanged so legends, reports, PDF, and stats panels keep working.

## Out of scope (ask if you want any)

- A **legend chip strip** above the 3D view mapping base color → SKU id.
- A **toggle** to switch borders on/off (`showEdges` already exists internally; default stays on).
- Any change to environment colors (walls, floor, pallet wood, forklift, worker).
