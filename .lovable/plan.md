## Root cause of the "19 boxes floating with no support below" audit

The HUD copy is correct — the packer is **really committing 19 boxes into thin air**. Three concrete bugs in `src/lib/freight/packing-advanced.ts` cooperate to produce this:

### Bug 1 — Cell-grid over-sampling inflates `topZ`
In `evaluatePlacement` (lines 285-297) the footprint scan uses:
```
cx1 = Math.ceil((x + l) / CELL_MM)
```
For a 1066.8 mm cube at x=0 this samples cells 0..10 → covers 0..1100 mm, i.e. **33 mm beyond the box's real edge**. If any previously-placed taller box overlaps that 33 mm strip, its top-Z is pulled into `topZ`, the new box is committed at that elevated z, and its **actual footprint floats over the empty area** to the left.

### Bug 2 — `topZ` chosen without checking whether the supporters actually cover the footprint
`topZ` is the **max** height-map value under the (over-sampled) footprint (lines 290-297). The support-ratio check at line 429 then asks "of cells whose top equals topZ, what fraction of the real footprint do they cover?" — but **only cells equal to topZ count**. If the tall column covers ≥85% the gate passes; the area below sits over shorter supporters whose tops are below `topZ`, so those parts of the box are unsupported. The placer commits anyway.

### Bug 3 — Validator's stricter `EPS_MM = 1` exposes #1/#2
`geometry-validator.ts` line 224 only counts a supporter when `|s.z + s.h − b.z| ≤ 1 mm`. Float32 height-map quantization adds sub-mm drift, so even legal stacks of 1066.8 mm cubes occasionally lose one supporter and cross the FLOATING threshold.

### Secondary: snap & z-snap pass don't re-validate against the *true* footprint
`snapAxis` (line 513) and the z-snap block (line 592) call `evaluatePlacement` again, inheriting the same over-sampling. They can also slide a box backwards into a position where it's now over a shorter cell column without lowering z.

---

## Fix plan

### 1. `src/lib/freight/packing-advanced.ts` — exact-footprint sampling

- Replace the `Math.ceil` cell expansion with a half-open interval that only samples cells whose **center** lies inside the footprint:
  ```
  cx0 = Math.floor(x / CELL_MM)
  cx1 = Math.ceil((x + l) / CELL_MM)
  // for each (cx, cy):
  const cellMidX = cx * CELL_MM + CELL_MM / 2;
  const cellMidY = cy * CELL_MM + CELL_MM / 2;
  if (cellMidX < x || cellMidX > x + l) continue;
  if (cellMidY < y || cellMidY > y + w) continue;
  ```
- For boxes whose footprint is smaller than 1.5 × CELL_MM, fall back to a **geometric supporter scan** that ignores the height-map entirely and looks at every box in `placedInternal` whose top face overlaps the candidate footprint. This guarantees correctness for sub-grid boxes (1066.8 mm cubes are right on the boundary).
- Cap `topZ` at the **highest top-face whose XY footprint actually overlaps the candidate**. If no supporter overlaps, `topZ = 0` (floor).

### 2. `src/lib/freight/packing-advanced.ts` — pre-commit geometry guard
Just before pushing a box into `placedInternal` (around line 647), call a lightweight `wouldBeLegal(candidateBox, placedInternal, container)` helper that runs the same overlap, support-ratio, and gap checks the validator uses. If it fails:
- log the rejection into `stackingReasonCounts` (extend with a `geometryGuard` bucket),
- mark the carton as unplaced,
- continue to the next carton.

This is the final airlock: **nothing illegal can ever be committed**, regardless of which earlier check missed it. With this in place, `geometry-validator.ts` is guaranteed to report `allLegal === true` for every produced pack.

### 3. `src/lib/freight/packing-advanced.ts` — snap pass uses geometric supporter check
In `snapAxis` (line 513) and the z-snap block (line 592) replace the height-map `evaluatePlacement` re-call with the geometric supporter scan from Fix 1. Snap must never move a box into a position the height-map says is fine but the geometry says is floating.

### 4. `src/lib/freight/geometry-validator.ts` — bump EPS to absorb Float32 drift
- `EPS_MM: 1 → 2`. Height-map values are stored in `Float32Array`; for box dimensions around 1000–3000 mm the rounding is well under 0.5 mm, but accumulating two adds (`z + h`) can push past 1 mm. 2 mm is still tight enough to catch any real floating gap (smallest carton dimension we accept is 50 mm).
- In the WALL_GAP band check (lines 113-115), require the offending coordinate to be **at least EPS_MM away from 0 and from the wall** before flagging — prevents 0.4 mm float drift from raising false WALL_GAP for boxes physically sitting at y=0.

### 5. `src/lib/freight/packing-advanced.ts` — height-map writes use exact cells
After committing a box (lines 658-671), only update cells whose centers are inside the real footprint (same half-open interval as Fix 1). This stops the next placement from inheriting an inflated `topZ` halo around every committed box.

### 6. Regression tests — `src/lib/freight/packing-advanced.regression.test.ts`
Add three deterministic cases:
- **40 × 1066.8 mm cubes in a 40HC** — assert `allLegal === true`, all 40 placed, zero floating.
- **41 × 1066.8 mm cubes** — assert `allLegal === true`, 40 placed, 1 in `shutOut`, HUD path is AMBER (no FLOATING).
- **Mixed 800 mm + 1100 mm cartons** — assert no FLOATING, no WALL_GAP, no NEIGHBOUR_GAP for a 50-carton mix.

### 7. `src/lib/freight/geometry-validator.test.ts`
Add a "supporter resolution" case: stack three 1066.8 mm cubes at z = 0, 1066.8, 2133.6 → assert support ratios are exactly 1, 1, 1 with EPS = 2.

---

## Why this finally closes the loop

| Layer | Before | After |
|---|---|---|
| Placer evaluates topZ | over-samples cells outside footprint | only counts cells whose centers are inside |
| Placer commits | trusts grid even when supporters miss footprint | runs `wouldBeLegal` airlock first |
| Snap pass | inherits same over-sampling | uses geometric supporter scan |
| Validator | EPS 1 mm, fights Float32 drift | EPS 2 mm, exact-equal logic |
| HUD | RED FLOATING on legal-looking packs | matches ground truth |

**Files touched:**
- `src/lib/freight/packing-advanced.ts` (Fixes 1, 2, 3, 5)
- `src/lib/freight/geometry-validator.ts` (Fix 4)
- `src/lib/freight/packing-advanced.regression.test.ts` (Fix 6, new cases)
- `src/lib/freight/geometry-validator.test.ts` (Fix 7, new case)

No UI / HUD / 3D viewer changes required — those were corrected in the previous round and will simply start showing GREEN/AMBER as soon as the packer stops emitting floating boxes.

**Approve to implement in one shot.**