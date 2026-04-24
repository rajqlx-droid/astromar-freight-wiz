## Diagnose "floating + overlapping" cargo in 3D loading view

### What your screenshot tells us

- Cargo: **1066.8 × 1066.8 × 1066.8 mm** cubes (3.5 ft), 40 units, 40HC container.
- HUD: **40/40 placed**, **100 COMPLIANT**, last frame of the loading sequence ("STACK ON" step 40/40).
- Container inner: **12032 × 2352 × 2700 mm**.

### Geometric reality check (this load is solvable)

```
Width  : 2 × 1066.8 = 2133.6 mm  → fits in 2352 (218 mm slack) ✓ 2-wide
Length : 11 × 1066.8 = 11734.8 mm → fits in 12032 with 100 mm door reserve ✓ 11-long
Height : 2 × 1066.8 = 2133.6 mm  → fits in 2700 with 80 mm ceiling reserve ✓ 2-tier
Slots  : 2 × 11 × 2 = 44 ≥ 40 ✓
```

So 40 cubes **should** sit as a clean 2 × 11 × 2 grid (with 1 short row on top). The packer reporting "40/40 placed" matches this — the issue is what you see, not what was computed.

### What's actually wrong (3 candidate causes — to verify before fixing)

**1. Cargo loading rules ARE being honoured by the packer**
The current `packing-advanced.ts` enforces:
- Floor / skyline support (geometric overlap ≥ 0.85, no floating allowed at placement time).
- Inter-item `minGap` (carton = 20mm) enforced both during scan AND re-checked after the snap pass.
- Wall clearance `wallMin` (carton = 30mm), door reserve 100mm, ceiling reserve 80mm.
- Stack-weight, fragile-sealing, non-stackable on floor only.
- Z is set to the actual top of supporting cells — not floating.

So if 40/40 placed and 100 compliant, the **stored coordinates are valid** (no overlap, no float). The "audit" wouldn't return 100 if any of the rules above were violated.

**2. The visual you're seeing is the loading-video / row-step animation, not the rest state**
The HUD "Replay / 0.5× / 1× / 2×" controls are running `transformsForFrame` from `loading-video.ts`, which animates each box flying in from the door. At intermediate frames boxes are deliberately mid-air or staged outside the container — that is **animation staging**, not the final layout. We need to confirm whether the "floating + overlapping" you see is:
   - mid-animation (expected, harmless), or
   - the final frame after playback ends (a real bug).

The screenshot shows frame 40/40 = last frame, so this is the rest state — meaning we should look at the rendered geometry vs `pack.placed[i]`.

**3. Most likely real bug — Y stride collapses 2-wide rows into a single visual row**
The `score` weights are `x * 10000 + z * 100 + y * 0.1 + …`. The `y` weight is **0.1**, which is so low it's basically a tiebreak. Combined with the snap pass that slides to `y = 0` whenever support permits, every cube tends to snap to **y = 30 mm** (wall clearance). That gives a 2-wide row only if the SECOND cube in the same x-slot also fits — but the snap pass pulls each cube as far back-and-left as possible, so the second cube of a pair gets dropped at `y = 1066.8 + 30 + 20 = 1116.8 mm`, leaving a **1235 mm dead lane** along the right wall. Result: 40 cubes form a single-file row stacked 2-tall instead of a 2-wide × 2-tall arrangement → only ~20 columns × 2 tiers needed → 12.03 m / 1.087 m = 11 columns → cubes overflow into a cramped corridor and the visual reads as "all crammed together overlapping the wall".

That matches what your image shows: a continuous green wall with no visible 2-wide layout, the right side of the container looking empty, and "Pallet 40 of 40 · row 10 / 10".

### What I'll do (read-only investigation first)

1. Reproduce the 1066.8 mm × 40 case in the existing debug test harness and dump:
   - Final `pack.placed[]` coordinates (x, y, z, l, w, h).
   - Floor coverage, frontier X, supportRatios.
   - Confirm whether boxes are 2-wide or single-file along Y.
2. If single-file is confirmed → the fix is in the **scoring + snap order**, not the renderer:
   - Increase the y-weight in the score so the packer prefers filling the width before advancing forward (currently it doesn't — back-wall fill works in X, never in Y).
   - Add a "row-fill in Y" pass that, once a column is started at a given x, attempts to drop a sibling at `y = 0 + l + minGap` before moving to the next x.
3. If 2-wide is correct in the data but the **render** shows them overlapping → the bug is in `Container3DView`'s coordinate transform (likely a units mismatch where `mm` is rendered as `mm/1000` for position but `mm` for size, or vice versa).

### What I will NOT change in this investigation

- Packer support / floating rules (already correct — geometric overlap, real Z resting plane).
- Audit / compliance scoring.
- The animation system (fly-in is intentional staging during playback).

### Deliverable

A short diagnostic write-up with the actual `placed[]` dump for your 1066.8 × 40 case, the root cause identified (scoring vs renderer vs animation), and a follow-up plan for the targeted fix. No code changes in this step — once we confirm the cause I'll come back with a focused fix plan you can approve.

### Files I'll read

- `src/lib/freight/packing-advanced.ts` (already reviewed — scoring/snap confirmed as suspect)
- `src/components/freight/container-3d-view.tsx` (`CargoBox` transform pipeline + `transformsForFrame` end-state)
- `src/lib/freight/loading-video.ts` (`transformsForFrame` for final-frame correctness)
- `src/lib/freight/loading-rows.ts` (row grouping — relevant if rows are computed wrongly)

### Files I'll touch (in the follow-up plan, not now)

- Most likely just `src/lib/freight/packing-advanced.ts` (scoring weights + width-fill heuristic).
- Possibly nothing else if the renderer is innocent.
