## Problem (from top-down view)

Cargo is dense against one side wall and the other side is empty, with boxes piling up vertically before the floor row across the width is finished. That is the opposite of how a real loader stows a container — they pack the **back wall first** (wall-to-wall AND floor-to-ceiling against the rear bulkhead), then advance one row forward, fill that row densely, and so on.

## Root cause

In `src/lib/freight/packing-advanced.ts` the **tight-mode placement score** (line 655) is:

```text
score = x * 10_000  +  ev.z * 100  +  y * 0.1  +  (1 - supportRatio) * 50
```

- `y * 0.1` — lateral spread is essentially free, so the packer never feels pressure to extend a row sideways.
- `ev.z * 100` — going up costs only ~100 per mm of height.
- For a 600 mm carton, advancing in `y` by one carton width costs `60`, stacking it on top costs `60 000`. But because `y` is essentially free, two adjacent floor candidates at `(x=0, y=0)` and `(x=0, y=600)` score within 60 of each other — any tiny support-ratio noise tips the winner toward the same Y again, and the snap order at lines 776–782 (`x → y → y → x`) drags everything to the back-left corner.

Result: cargo piles up in one back corner instead of forming a dense back wall, then a dense second row, etc.

## Fix — surgical changes in `packing-advanced.ts`

### 1. Densify the back wall first (X-row, then fill width AND height before advancing)

Replace the tight-mode score at line 655 with an explicit priority order:

```text
score = x * 10_000_000               // back-to-front rows dominate
      + (rowFull ? ev.z : 0) * 1     // height is FREE inside the current row…
      + (newRow  ? ev.z : 0) * 100_000  // …but expensive once we'd start a new row
      + y * 1_000                    // within a row, fill width left-to-right
      + (1 - supportRatio) * 50      // tiebreak
```

Where `rowFull` = "this candidate's `(x, y)` is in the same X-row as the current frontier and a stable column already exists below". Practically this is implemented as: **if `ev.z > 0` AND the supporters are all in the current back-most row, treat this as densifying the back wall — score it cheaply.** Otherwise, treat going up as expensive.

Net effect:
- The back-most row becomes a **wall**: cartons fill across the full width AND stack up to `C.h - CEILING_RESERVE_MM` before the next row opens.
- Once the back wall is dense, the next row (one carton-depth forward) is filled the same way: width-first, then stacked floor-to-ceiling.
- And so on row by row toward the door — exactly how real loaders stow.

### 2. Track a per-row Y-frontier and a per-row Z-frontier

Add next to the existing `frontierX` (line 253):

```ts
let frontierY = 0;   // current lateral fill position inside the back-most row
let frontierZ = 0;   // current vertical fill height for that row's current column
```

Update rules:
- After committing a floor placement at the current `frontierX`: `frontierY = max(frontierY, placed.y + placed.w + minGap)`.
- When the row is full across the width (`frontierY + smallestCartonW > C.w`): start stacking — keep `frontierX`, reset `frontierY = 0`, advance `frontierZ` to the row's lowest column top.
- When the row is also full to the ceiling: advance `frontierX` to the next row, reset `frontierY = 0`, `frontierZ = 0`.

The scorer prefers candidates whose `(x, y, z)` is closest to `(frontierX, frontierY, frontierZ)` so the back wall genuinely densifies before any forward movement.

### 3. Fix the snap order so lateral position is preserved

Lines 776–782 currently snap `x → y → y → x`. The leading `snapAxis("y")` pulls every carton toward `y = 0` (one side wall) and undoes the row-fill from change #2.

Change to:

```ts
snapAxis("x");   // back-wall snap (keep — densifies the back wall)
snapAxis("x");   // second pass closes sub-stride x slack
// no y-snap toward y=0 — frontierY already placed the carton correctly
```

For single-SKU light loads the existing CoG-spread mode is unchanged — it intentionally biases to the centre line and is gated separately.

### 4. Keep the stack-completion bonus

The `-5_000` bonus at line 674 (fires when `supportRatio ≥ 0.98`) is correct and stays. With the new score it can no longer beat a fresh floor slot in the **same** row, only beat advancing X — which is exactly the back-wall densification we want.

## What the user will see after the fix

Top-down view, in order as cargo loads:
1. **Back wall fills first** — wall-to-wall across the full width AND floor-to-ceiling.
2. **Second row fills next** — same wall-to-wall, floor-to-ceiling discipline, one carton-depth forward.
3. **Third row, fourth row…** — same pattern, marching toward the door.
4. Mandatory `DOOR_RESERVE_MM = 100` gap at the front (unchanged).

Side view: no lopsided pile against one wall. Each row is a complete vertical slab.
Result: **more cartons per container** because the back area is fully used (floor + walls + height) before the next row opens.

## Files touched

- `src/lib/freight/packing-advanced.ts` — score reweight, `frontierY`/`frontierZ` tracking, snap-order change. ~40 lines net.

## Tests

- `src/lib/freight/packing-advanced.regression.test.ts` — add **"back wall densifies first"**: for a 200-carton homogeneous load, the smallest-X column must be filled to ≥ 90 % of `(C.w × (C.h - CEILING_RESERVE_MM))` before any carton is placed at `x > smallestCartonL × 1.5`.
- Add **"row fills width before height"**: for a load that fits in one floor layer, every placed carton must have `z === 0`.
- `src/lib/freight/packing-advanced.accuracy.test.ts` — `placedCartons` must improve or hold across all existing fixtures.
- `src/lib/freight/scenario-runner.test.ts` — existing partial-fit + stickiness tests must still pass.
- Run `bunx vitest run` and reject any regression in `placedCartons`.

**Approve to execute.**