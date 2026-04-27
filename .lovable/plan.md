## Problem

When the user clicks **Play** (or steps with **Next**) in the 3D viewer, the incoming cargo visually appears to land on top of (or pass through) already-placed cargo. The user wants to verify this is only a visual animation issue and not a real packer overlap, and have it fixed either way.

## What's happening (analysis)

The 3D viewer renders every box at its packer-validated coordinates, and the packer is already gated by `geometry-validator.ts` (1 mm neighbour rule, 1 mm wall rule, support test, etc.). So the **resting positions are legal**. The visible problem is in the fly-in animation:

1. **Staging path tunnels through neighbours.** In `container-3d-view.tsx` (CargoBox, lines 1259-1320) the box stages at `(slot.x + 0.55·containerL, slot.y + 0.7·containerH, slot.z)` and travels in two phases — horizontal glide for 45 % of the duration, then vertical drop. When the slot is in a back row, the horizontal glide path runs at `0.7·H` above the floor, which is **lower than the top of already-placed full-height stacks** (e.g. bales stacked to ~2.4 m in a 2.39 m container). The descending box appears to land on top of the wrong neighbour.
2. **Drop column collision.** The vertical descent goes straight down to the slot. If the slot is below an already-placed stacked box (cross-row stacking auto-included by `visiblePlacedIdxs`), the descent visually clips that supporter.
3. **No live overlap audit.** There is no on-screen way to confirm that the final positions are legal, so the user can't tell "visual artefact" from "real bug".

There is no evidence that the packer itself produces overlapping placed boxes — `geometry-validator.ts` already rejects any plan with `OVERLAP`/`NEIGHBOUR_GAP`/`FLOATING` and the optimiser only commits legal plans. The fix is to make the animation respect the actual cargo skyline, and to surface a verification badge so the user can see at a glance.

## Plan

### 1. Lift the staging height above the cargo skyline

In `src/components/freight/container-3d-view.tsx` `CargoBox`:

- Accept a new prop `cargoSkylineM: number` (the max top-Y of any already-visible neighbour box, in scene metres) from `SceneContents`.
- Compute `stageOffsetY = max(currentLogic, cargoSkylineM - cy + 0.25)` so the horizontal glide is always at least 25 cm above every other visible box.
- `SceneContents` derives the skyline once per `flyInKey` from `pack.placed` filtered by `visiblePlacedIdxs` minus `flyInIdxs`, and passes the same value to every CargoBox in the current step.

### 2. Stage from above instead of from the door

Change the staging point so the box drops **straight down** from above its slot, with a tiny door-side approach:

- Phase 1 (0..0.35): horizontal glide from `+stageOffsetX` to `+0.05·containerL` at `stageOffsetY`.
- Phase 2 (0.35..1): vertical descent from `stageOffsetY` to `0`.
- Reduce `stageOffsetX` to `min(currentLogic, distance from slot to door + 0.5 m)` so back-row boxes don't have to traverse the entire container.

This keeps the natural "comes in through the door" feel while guaranteeing no visual intersection with the cargo skyline.

### 3. Add a live overlap-audit badge to the HUD

In `loader-hud.tsx` (or the existing badge area near `READY · Press ▶`):

- On each step, run `validateGeometry(pack)` over the **currently visible subset** (`visiblePlacedIdxs`) and surface a small chip:
  - Green "✓ No overlaps" when the audit returns `allLegal === true`.
  - Red "✕ N overlap(s)" with a tooltip listing the offending placed indices when not.
- This is cheap (already-cached audit) and gives the user proof that the resting state is geometrically clean even when the animation flashes past.

### 4. Console diagnostic for the current session

Add a one-shot `console.info` in `SceneContents` on mount that logs `validateGeometry(pack).violations` so the user can confirm the packer's final state is clean for this particular bale + bag + drum scenario shown in the screenshot.

### 5. Verification

- Run the existing `vitest` suite (`packing-advanced.regression.test.ts`, `geometry-validator.test.ts`, `scenario-runner.test.ts`) — no test logic changes, just behaviour parity check.
- Manually walk through Play and Next on the bale + bag + drum scenario in the screenshot and confirm no visual collision.

## Technical details

| File | Change |
|---|---|
| `src/components/freight/container-3d-view.tsx` | Add `cargoSkylineM` prop to `CargoBox`; compute it in `SceneContents` from the visible-but-not-flying boxes; rework `stageOffsetY` / `stageOffsetX` / `PHASE_SPLIT`; emit one-shot `console.info` of `validateGeometry(pack)`. |
| `src/components/freight/loader-hud.tsx` | New "Audit" chip showing live `validateGeometry` result for `visiblePlacedIdxs`. |
| `src/lib/freight/geometry-validator.ts` | Export a thin `validateSubset(pack, visibleIdxs)` helper that runs the existing checks against a filtered placed array. No rule changes. |

No packer logic or gap rules change. The 1 mm clearance, 100 mm door reserve, 80 mm ceiling reserve, and support ratio rules are untouched.
