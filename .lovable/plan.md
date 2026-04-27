## Goal

Stress-test the 3D loader across **every container** (20GP, 40GP, 40HC) with **multiple realistic cargo mixes**, observe the Play/Next walkthrough from every camera preset (Iso, Front, Side, Top, Inside), catch visual errors, and fix them.

Resting positions are already proven legal by `validateAdvancedPack` (the on-mount `console.info` confirms this every load). The hunt is for **animation / rendering artefacts** that don't reflect a real packer bug.

## Test matrix

| # | Container | Cargo mix | What it stresses |
|---|---|---|---|
| 1 | 20GP | 60 cartons + 8 drums + 6 bales | Mixed shapes, short container, tight back-row staging |
| 2 | 20GP | 100 same-size cartons stacked 3-high | Dense vertical stack — supporter reveal order |
| 3 | 40GP | 40 bales (ground) + 30 bags on top | Bag-on-bale stacking, jute texture on/off |
| 4 | 40HC | Tall stack to ceiling (2.55 m) of pallets | Skyline ≈ ceiling — fly-in glide must clear |
| 5 | 40HC | Mixed crates + drums + non-stackable | Tilt-rotated boxes during fly-in |
| 6 | 40HC | 8 oversized cubes (1.22 m) | Huge boxes traversing long container |

For each cell: walk through with **Next** one step at a time at every camera preset, then run **Play** at 0.5× and 2×. Capture screenshots / observations.

## Expected / suspected visual issues to verify

From reading `container-3d-view.tsx` (lines 1276–1372) the current animation has these latent risks:

1. **`stageOffsetY` ignores the *incoming* box's own height.** `minClearOverSkyline = max(0, cargoSkylineM − cy + 0.25)` measures from the **centre** of the new box. When the new box is tall (e.g. a bale 1.2 m high) and the skyline is also tall, the bottom of the staging box can still dip below the skyline by ~0.5·hm. Likely → tall incoming boxes clip neighbours during glide.
2. **Phase-2 vertical descent path.** Phase 1 ends at `dx = 0` (directly above the slot) at full `stageOffsetY`. If a *taller* box was just placed in an adjacent column on the door-side, the descending box can clip its top corner because the skyline is computed once per step, not continuously.
3. **`distToDoor` cap can be negative for boxes past the door midpoint.** `containerL/2 − slotXFromOrigin + 0.5` — for a slot near the +X (door) face this is small or near zero, so back-row boxes still get a long traverse but front-row boxes barely move; the box can appear to "pop" rather than fly in. (Cosmetic, not a collision.)
4. **No per-step audit during walkthrough.** The HUD chip exists, but there is no *recorded* per-step pass/fail set we can show in the test matrix. Need a way to confirm "step N showed clean" for every container × scenario.
5. **Camera framing on Top / Side presets** can put the staging point off-screen, making the fly-in look like a teleport from outside the frame. Cosmetic but disorienting.
6. **Pallet-on-pallet stacks**: when a stacked box's supporter is auto-included by `visiblePlacedIdxs` (lines 369–388), the supporter appears in the same step as its stacker — visually two boxes pop in together. Confusing during a "one box per click" walkthrough.

## Plan

### Step 1 — Verification harness (programmatic, fast)

Add `src/lib/freight/__dev__/walkthrough-audit.test.ts` that, for each scenario in the matrix:

- Builds the `CbmItem[]` mix and the container preset.
- Runs `pickBestPlan` to get the plan.
- Reproduces `visiblePlacedIdxs` exactly the way `container-load-view.tsx` does (including the supporter-inclusion loop).
- For every step `k = 0…N`, calls `validateAdvancedPackSubset(pack, visibleAtStep_k)` and asserts `allLegal === true`.

This proves that **at every revealed frame** the resting positions are physically legal, independent of any animation. If a step ever fails, we know it's a real packer/reveal-order bug, not a fly-in artefact.

### Step 2 — Fix `stageOffsetY` height calculation

In `CargoBox` (`src/components/freight/container-3d-view.tsx`):

- Change `minClearOverSkyline` to measure from the **bottom** of the incoming box, not its centre:
  `const minClearOverSkyline = Math.max(0, cargoSkylineM − (cy − hm/2) + 0.25);`
  This guarantees the **bottom face** of the flying box is at least 25 cm above any neighbour's top, regardless of incoming box height.
- Cap `stageOffsetY` so the box never visually punches through the ceiling. Compute:
  `const ceilingHeadroomM = containerH − (cy + hm/2) − 0.05;`
  `const stageOffsetY = Math.min(stageOffsetYRaw, Math.max(0.4, ceilingHeadroomM));`
  When a 40HC is packed near the roof we still get a believable arc; we just don't intersect the roof skin.

### Step 3 — Continuous-skyline check during descent

The skyline is currently captured once when `flyInKey` changes. That's correct because nothing else moves during the step, so a recompute would yield the same value. We keep it, but add one safety: if the descending column's slot has a stacked supporter that is itself in `flyInIdxs` (rare — only happens when the stepper batches stacker+supporter into one step), descend along the supporter's top instead of `0`. Patch the Phase-2 endpoint:

```
const slotFloorM = (box.z) / MM_PER_M; // resting bottom-Y in scene
// dy goes from stageOffsetY → 0 ; final position lands at cy + 0
// (cy = slotFloorM + hm/2). No change unless we ever animate supporters.
```

In practice, the current "auto-include supporter in earlier step" rule already prevents this; we just document and assert it in the harness so a future change can't regress.

### Step 4 — Front-row "pop" fix

Replace the `distToDoor` formula with a **minimum traverse** so even front-row boxes get a short visible glide (not a static drop):

```
const distToDoor = Math.max(0.8, containerL / 2 − slotXFromOrigin + 0.5);
const stageOffsetX = Math.min(Math.max(1.0, containerL * 0.35), distToDoor);
```

Front-row boxes now glide ~0.8–1.0 m before descending, which reads as "carried in by the loader" instead of "appears from the slot".

### Step 5 — Per-step audit chip in the HUD (display-only)

`src/components/freight/loader-hud.tsx` already runs `validateAdvancedPackSubset`. Add a tiny rolling counter:
`Step k/N · ✓ clean` (green) or `Step k/N · ✕ overlap` (red, with offending placed indices on hover). This gives the user the same proof during interactive Play that the harness gives in the test.

### Step 6 — Optional: stage-clearance gizmo (debug only)

Behind a `?debug=fly-in` URL flag (read once in `SceneContents`), render a translucent yellow plane at `cargoSkylineM + 0.25 m` while a box is flying in. This makes the clearance rule visible during QA so future regressions are spotted in seconds.

### Step 7 — Manual visual sweep

After Steps 2–5 land, walk the test matrix in the preview and confirm:
- No box visually intersects another at any step in any scenario × container.
- Front-row boxes glide visibly instead of popping.
- Tall incoming bales/pallets in 40HC clear the skyline cleanly.
- Side / Top / Inside presets show the same clean fly-in as Iso.

## Files

| File | Change |
|---|---|
| `src/lib/freight/__dev__/walkthrough-audit.test.ts` | **New.** Harness asserting every revealed-step subset is legal across the test matrix. |
| `src/components/freight/container-3d-view.tsx` | Fix `stageOffsetY` (bottom-of-box reference + ceiling cap), tighten `stageOffsetX` minimum, optional debug plane. |
| `src/components/freight/loader-hud.tsx` | Show per-step audit chip with offending indices on hover. |

No packer logic, no gap rule, no compliance scoring changes. The 1 mm neighbour rule, 100 mm door reserve, 80 mm ceiling reserve, and 0.85 support ratio remain untouched.
