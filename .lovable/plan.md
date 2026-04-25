# Enforce 1 mm minimum gap between every cargo unit

## What changes for the user

Today every cargo type packs **flush** — adjacent boxes/bags/drums/bales touch face-to-face with 0 mm between them. You want a **hard 1 mm gap** between every pair of cargo units (and 1 mm to the side walls). Door 100 mm and ceiling 80 mm reserves stay exactly as they are.

Result during play and in the static view:
- No two cargo units share a face. Every neighbour pair has at least 1 mm of clear air between them, so visual or numeric overlap becomes impossible.
- The packer plans around this gap, so the count it reports is what physically fits with 1 mm separation. Capacity drops slightly for dense loads (typically 1–3% fewer pieces in a 40HC mixed pack).
- The walkthrough animation already lands each box at its real slot, so the 1 mm gap is visible at the moment the box seats.

## Files to change

### `src/lib/freight/gap-rules.ts`
Bump `minGap` from `0` to `1` mm and `wallMin` from `0` to `1` mm for every entry in `GAP_RULES_MM` (carton, pallet, drum, crate, bale, bag). Keep `doorMin = 100`, `ceilingMin = 80`, `WALL_SAFETY_MARGIN_MM = 0` (we'll read `wallMin` directly). Update the file's top comment from "may sit FLUSH" to "must keep ≥ 1 mm clear of every neighbour and side wall; door 100 mm / ceiling 80 mm reserves unchanged".

`classifyGap` already returns `WARN` when `gapMm < min` and `BLOCK` when `gapMm < 0`. With `min = 1`, a 0 mm flush touch becomes `WARN`, which lines up with the new rule (the packer below will refuse to create those touches in the first place).

### `src/lib/freight/packing-advanced.ts`
1. `wouldBeLegal(x, y, z, l, w, h, minGap)` — currently treats `_minGap` as unused. Rewrite the strict-overlap loop to require **clearance ≥ minGap** on at least one axis between the candidate and every already-placed box. Specifically: for each placed box `p`, compute axis-wise gaps `gx = max(p.x - (x+l), x - (p.x+p.l))`, `gy`, `gz`; reject the placement if `gx < minGap && gy < minGap && gz < minGap`. This treats touching faces as illegal (gap = 0 < 1) and keeps the existing overlap rejection (any negative gap).
2. Pass the per-package `minGap` into every `wouldBeLegal` call: replace the hard-coded `0` at line ~604 in the support search and the existing `getGapRule(c.packageType).minGap` at the final guard (line ~803) — both should resolve to `1`.
3. Wall reserve: when generating candidate `x`/`y` positions, clamp the search range so the box sits at least `wallMin` (= 1) inside the inner container on the −X, +Y, −Y sides. The +X side is already clamped by `DOOR_RESERVE_MM`. The +Z (ceiling) side is already clamped by `CEILING_RESERVE_MM`. The −Z (floor) side stays at 0 (boxes rest on the floor).

### `src/lib/freight/geometry-validator.ts`
Add a neighbour-gap check after the existing strict-overlap pass:
- For every pair `(a, b)` in the placed set, compute the same axis-wise gap as above. If `min(gx, gy, gz) < 1 mm − epsilon` (use `EPS = 0.5` mm for float drift) **and** the boxes are not the same instance, record the pair under a new violation type `neighbourGap` (separate from `overlap`).
- The result struct gains a `neighbourGapPairs: number[]` field listing the offending placedIdx values. Treated as a hard violation (same severity as overlap) so a bad pack is rejected by the optimiser sweep and never reaches the 3D viewer.

### `src/lib/freight/packing-advanced.accuracy.test.ts` and the regression test
Update fixtures whose expected placed counts assumed flush packing. The 6 accuracy cases each get their `expectedPlaced` recomputed by running the updated packer once and recording the new count (each test currently asserts an exact integer — they will drift by 0–3 pieces). The regression test's no-overlap and door/ceiling reserve assertions stay valid; add a new assertion that every pair of placed boxes has ≥ 1 mm clearance on at least one axis.

### `src/lib/freight/compliance.ts` and `loading-rows-panel.tsx` (text only)
Where the UI explains the gap policy ("flush packing legal", "tight pack" badges), update the wording to "1 mm minimum clearance between cargo units; door 100 mm, ceiling 80 mm reserves enforced."

## Files NOT touched

- `container-3d-view.tsx` — viewer already renders at exact slot coords; with 1 mm gaps those slots now naturally have visible separation. No shape-rendering tweaks needed.
- `container-load-view.tsx` — walkthrough/animation logic unchanged; supporter-expansion and L-shaped fly-in stay as-is.
- `display-colors.ts`, the 20-colour palette, and the adjacency contrast helper — unchanged.
- The packing Web Worker — it just calls `wouldBeLegal`, so it picks up the new gap automatically.

## Technical notes

- **Why 1 mm and not larger.** You asked for 1 mm. It's small enough that capacity barely changes (one row of bags in a 40HC loses at most 1 piece) but large enough that floating-point arithmetic can never collapse the gap into a visual touch. If after testing you want bigger gaps for drums (chocks) or bales (compression slack), only `GAP_RULES_MM` needs editing — the packer reads `minGap` per package type.
- **Validator epsilon.** The existing `OVERLAP_EPSILON = 0.5 mm` stays. The new neighbour-gap check uses `1 mm − 0.5 mm = 0.5 mm` as the rejection threshold so flush placements (gap = 0) fail and 1.0 mm placements pass without flicker.
- **Stack support.** Stacked boxes still rest directly on the supporter's top face (vertical gap = 0 on Z). The `gz < minGap` test alone wouldn't reject a legitimate stack because `gx` and `gy` overlap — and the rule we're encoding is "rejected only when ALL three axes are within minGap", which matches reality (a stacked box must overlap horizontally with its supporter, so it's not a "neighbour"). The validator's footprint-on-supporter check (separate code path) is unchanged, so floating boxes still fail.
- **Performance.** `wouldBeLegal` is already O(placed) per candidate. Adding the gap check is the same comparison with a 1 mm slack — no new loops, no perf regression.

## Verification

1. `bunx tsc --noEmit` — must stay clean.
2. `bunx vitest run src/lib/freight/packing-advanced.accuracy.test.ts src/lib/freight/packing-advanced.regression.test.ts src/lib/freight/geometry-validator.test.ts` — update accuracy fixtures, all must pass.
3. Manual: load 1 bale + 1 bag + 1 drum, click Play, scrub Next/Prev. Each unit lands with a visible hairline of space on every shared face. Static view shows the same.
4. Manual: dense 40HC mixed pack. Confirm count drops by at most a few pieces vs. the previous flush plan and that no two boxes visibly touch in the 3D scene.
