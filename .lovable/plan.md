# Tight-fit packing with door/ceiling gaps + visible 3D seams

## What you want

1. Cartons can sit **flush** against each other inside the container — no enforced lateral or wall gap. Tight packing maximises capacity.
2. **No physical overlap.** Two boxes may never share volume, even by 1 mm.
3. **Door reserve** (100 mm at the +X end) and **ceiling reserve** (80 mm under the roof) stay enforced.
4. In the 3D viewer every carton is visually distinct — clear seams between neighbours so the eye can see individual packages.
5. When the container is under-utilised (low CBM), the packer is allowed to **spread cargo out evenly along the length** to balance the centre of gravity, instead of jamming everything against the back wall.

## Plan

### 1. Switch lateral neighbour gap and wall gap to 0 (`src/lib/freight/gap-rules.ts`)
- Set every `minGap` and every `wallMin` to `0` for all six package types.
- Keep `doorMin: 100` and `ceilingMin: 80` exactly as today.
- Keep `maxGap` for the loose-stuff warning.
- `classifyGap` keeps working unchanged (just yields `ALLOWED` for any non-negative neighbour gap).

### 2. Strengthen the overlap guard everywhere (`src/lib/freight/packing-advanced.ts`)
- `wouldBeLegal` (line 460): change the overlap test from `ox > 1 && oy > 1 && oz > 1` to `ox > 0.5 && oy > 0.5 && oz > 0.5`. With the gap rule gone, this becomes the **only** thing standing between cartons and physical intersection — make it strict.
- `evaluatePlacement` candidate scan (lines 549-568): strip the now-redundant `gRule.wallMin`/`gRule.minGap` checks and the inter-item `gapViolation` block. The airlock at line 731 keeps every commit physically legal.
- `snapAxis` (lines 638-653): remove the `snapGapRule` neighbour-clearance and wall-min checks. Keep the strict overlap test (`xOv && yOv && zOv` already there) and tighten its threshold to 0 mm — touching is fine, intersecting is not.

### 3. Validator becomes overlap-only on the lateral axis (`src/lib/freight/geometry-validator.ts`)
- `HARD.MIN_NEIGHBOUR_GAP_MM = 0`, `HARD.MIN_WALL_GAP_MM = 0`. Door + ceiling stay 100 / 80.
- Drop the `WALL_GAP` and `NEIGHBOUR_GAP` violation paths (no longer reachable). Keep `OVERLAP`, `DOOR_GAP`, `CEILING_GAP`, `FLOATING`, `WEAK_SUPPORT`, `NONSTACK_LOADED`, `FRAGILE_LOADED`.
- `overlapVolume` threshold tightens: `dx <= 0` instead of `dx <= EPS_MM`. With no gap rule, EPS-tolerant overlap-rejection would silently allow 2 mm of intersection — flip it to strict.

### 4. Row planning matches the new tight rule (`src/lib/freight/loading-rows.ts`)
- Lines 372-387: set `minGap = 0` and `wallMin = 0` so the row preview shows the same carton count the packer actually achieves.

### 5. Container recommender matches (`src/lib/freight/container-recommender.ts`)
- Lines 374-399: with `rule.minGap = 0` and `rule.wallMin = 0` the existing math collapses to `Math.floor(C.w / shortSide)` automatically — no code change needed once `gap-rules.ts` is updated, but bump the helper string at line 399 so the user-facing reason no longer mentions wall clearance.

### 6. CoG-aware spread when the container is under-utilised (`src/lib/freight/packing-advanced.ts`)
- New input-derived heuristic computed once at the start of the pack loop:
  - `volumeFill = cargoCbm / container.capCbm`
  - `spreadMode = volumeFill < 0.65` (≈ container is under two-thirds full).
- When `spreadMode` is true, change the placement scoring at line 578 from `x * 10_000 + ev.z * 100 + …` to a CoG-balancing score:
  - Compute `targetX(i) = (i + 0.5) * stride` where `stride = (C.l - DOOR_RESERVE_MM) / expected_floor_count`.
  - Score: `Math.abs(x - targetX) * 100 + ev.z * 1000 + Math.abs(y - C.w/2) * 0.5 + (1 - ev.supportRatio) * 50`.
  - This lays cartons evenly along the container length instead of jamming them against the back wall, and biases the lateral position toward the centre line for balance.
  - When `spreadMode` is false (container is dense), keep today's back-to-front score.
- Snap-to-back (`snapAxis("x")`) is **disabled** in spread mode — it would undo the spreading. Y-snap stays so cartons still hug a side or sit centred.

### 7. 3D viewer — clear visible seams between cartons (`src/components/freight/container-3d-view.tsx`)
- `CargoBox` (line 1255): render the box geometry at `scale * 0.99` instead of plain `scale`. With cartons packed flush in mm coords, a 1 % visual shrink leaves a ~5–10 mm air gap on every shared face — enough to see each package as a distinct object without misrepresenting the actual fit.
- Edge outlines remain on for ≤60 boxes (line 589). For larger jobs, switch the threshold to 200 so multi-row stacks still show seams. The polygon-offset on `<Edges>` keeps lines crisp.
- Back-floor "ribbed" floor and pallet decorations are unchanged.

### 8. HUD copy + audit panel
- `src/lib/freight/compliance.ts` and any badge that references "50 mm gap" should now say **"Tight pack, door + ceiling reserve enforced"**. Quick text-only edit, no logic change.

### 9. Tests
- `src/lib/freight/packing-advanced.regression.test.ts`: add a "flush row" assertion — 11 × 1067 mm cubes in a 40HC must place all 11 with zero overlap and zero floating.
- `src/lib/freight/geometry-validator.test.ts`: drop the WALL_GAP / NEIGHBOUR_GAP test cases, add a strict overlap test (two cubes whose AABBs share 2 mm must report OVERLAP).
- Add a CoG-spread test: 6 × 1 m cubes (CBM ≈ 6 / 76 = 8 % fill) in a 40HC should land with placements along ≥ 60 % of the container length, not all clustered at x ≤ 6 m.

## Files to edit

- `src/lib/freight/gap-rules.ts`
- `src/lib/freight/packing-advanced.ts`
- `src/lib/freight/geometry-validator.ts`
- `src/lib/freight/loading-rows.ts`
- `src/lib/freight/container-recommender.ts` (string only)
- `src/lib/freight/compliance.ts` (string only)
- `src/components/freight/container-3d-view.tsx`
- `src/lib/freight/packing-advanced.regression.test.ts`
- `src/lib/freight/geometry-validator.test.ts`

## Acceptance check after implementation

- 41 × 1067 mm cubes in a 40HC: green HUD, no overlap, every row visibly seamed in the 3D view, all 41 placed (or honest 40/41 if door reserve binds).
- 6 × 1 m cubes in a 40HC (low fill): cartons distributed along the full length, lateral CoG within ±5 %, longitudinal CoG within ±10 %.
- Final geometry audit: 0 overlap, 0 floating, 0 door/ceiling violations.
