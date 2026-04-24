

## Why only 9 cartons fit, no stacking — and how to fix it

### Your input
- 30 cartons at **121.92 × 121.92 × 121.92 cm**, **500 kg each** (4 ft cubes)
- Container 40HC inner: 12032 × 2352 × 2700 mm

### Two separate things are happening

**1. Side-by-side: physically impossible (not a bug)**
Two cartons side-by-side = 2 × 1219.2 = **2438.4 mm**, but the 40HC inner width is only **2352 mm**. So only **1 carton per row** is geometrically possible. This is correct.

**2. Stacking: blocked by a quantization bug (the real problem)**
The packer should stack a second carton on top of each floor carton (2 × 1219.2 = 2438.4 mm < 2620 mm usable height). It refuses to, and the root cause is in `packing-advanced.ts`:

- The support check uses a **100 mm cell grid** (`CELL_MM = 100`).
- A 1219.2 mm carton footprint covers `ceil(1219.2/100) = 13` cells per side → **169 cells** under the footprint.
- The real carton only fills `(1219.2/100)² ≈ 148.6` cells worth.
- Support ratio = 148.6 / 169 ≈ **0.879**.
- The packer requires `SUPPORT_MIN_RATIO = 0.9`. **0.879 < 0.9 → stacking rejected.**

So every dimension that is not a clean multiple of 100 mm (122 cm, 75 cm, 45 cm, etc.) suffers from this quantization penalty even when the upper carton is *identical* to the one below it.

Result: 9 cartons line up floor-only along the 12 m length, then the remaining 21 spill into 2 more containers — exactly what your PDF shows.

### The fix

Change the support check so it measures **actual footprint overlap**, not quantized cell coverage. Two complementary changes inside `evaluatePlacement` in `src/lib/freight/packing-advanced.ts`:

1. **Identical-supporter shortcut.** If the only supporter directly below has the same `(l, w)` footprint and the same `(x, y)` corner (within 1 cm), treat support as 100% — a carton sitting flush on an identical carton is by definition fully supported.

2. **Real-area support ratio (fallback for non-identical stacks).** Instead of `supported / total` cells, compute the geometric overlap area between the new box footprint and the union of supporting boxes' top faces, divided by the new box's footprint area. This eliminates the cell-rounding penalty for any dimension.

3. **Lower the threshold safely.** Drop `SUPPORT_MIN_RATIO` from `0.9` to `0.85` as a defensive backstop. 0.85 is still safe for real-world stacking (industry standard for ISTA/CTU is 80–90%) and matches the quantization tolerance for sub-100 mm dimensions.

### Files touched

- `src/lib/freight/packing-advanced.ts` — update `evaluatePlacement` to return geometric overlap support ratio, add identical-stack shortcut, lower threshold to 0.85.

### Expected result for your scenario

- Floor row: 9 cartons along the 12 m length (unchanged — this is the geometric max for 1219.2 mm cartons with door reserve and gaps).
- Stack: a **second tier** of 9 cartons on top → 18 placed in one container.
- Remaining 12 cartons fit in a second container (also stacked 2 tiers, 9 + 3) → **2 containers instead of 3+** for this load.
- Weight per stacked column: 1000 kg, well under cargo limits.
- The "GAP — RE-SHUFFLE" warning will also go away because wall-utilization improves once the cargo is stacked rather than spread across 9+ rows.

### Safety / no-risk checklist

- The geometric support ratio is **stricter or equal** to the cell-based one in every realistic case — it cannot create floating cargo.
- Identical-stack shortcut only applies when the box below has the same footprint AND same XY corner — no risk of authorising weak stacks.
- `maxStackWeightKg`, `fragile`, `stackable=false`, sealed columns, and door/ceiling reserves are all untouched.
- 3D view, loading rows, report, and video read from `placed[]` and stay correct automatically.
- No type changes, no schema changes, no UI changes.

### Out of scope (intentionally not changed)

- Width-side packing — 2 cartons side-by-side is geometrically impossible in any standard ocean container; nothing to fix there.
- Strategy/scoring — the existing back-to-front + bottom-first scoring is correct once the support bug is removed.
- Cell size — keeping `CELL_MM = 100` for performance; the geometric overlap fix doesn't need a finer grid.

