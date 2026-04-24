# End-to-End Packing Pipeline Fix

Combines both previously-proposed plans into a single implementation pass. Goal: eliminate "VIOLATIONS / EXPORT BLOCKED" false positives that come from logic mismatches between the optimiser, recommender, audit, and HUD — while preserving the 100% geometric capacity + 50 mm gap rule.

## Hard rules (unchanged)
- 100% geometric container dimensions in `src/lib/freight/packing.ts` (20GP 33.23 m³, 40GP 67.78 m³, 40HC 76.34 m³). No stowage haircut.
- Universal 50 mm neighbour/wall gap, 100 mm door, 80 mm ceiling (`src/lib/freight/gap-rules.ts`).
- `SUPPORT_MIN_RATIO = 0.85` everywhere (packer + audit). No hanging, no overlap.
- Single 40HC max — no multi-container stuffing.

## Root causes found in audit
1. **Split-brain pipeline**: `pickOptimalContainer` in `packing.ts` runs a single-strategy pack, while the 3D loader uses `pickBestPlan`. The auto-selected container can disagree with the rendered plan, producing red HUD on a plan the optimiser already rejected.
2. **Irreducible-slack false positive**: `FLOOR_GAP` audit in `compliance.ts` flags rows whose width utilisation is below ~90% even when cargo footprint × n + (n+1)·50 mm physically cannot exceed the inner width (e.g. 1066.8 mm cubes in 2350 mm — max 2 across = 90.8%). HUD then reports RED on a physically optimal pack.
3. **Capacity drift**: `container-recommender.ts` still applies legacy "usable CBM" haircuts (~85%), inconsistent with the 100% rule and causing the recommender to under-promise vs. what the optimiser actually places.
4. **Blocked vs. shut-out conflation**: When cargo legitimately exceeds 40HC capacity, every strategy returns residue; the HUD shows "EXPORT BLOCKED" instead of distinguishing "physically legal pack, but cargo shut out".
5. **Compliance recompute drift**: UI recomputes compliance from the pack instead of consuming the optimiser's report, so two slightly different audits can disagree on the same plan.

## Changes

### 1. `src/lib/freight/packing.ts`
- `pickOptimalContainer` calls `pickBestPlan` (via the worker path when available, sync fallback otherwise) and selects the container whose densest legal plan maximises placedCargoCbm. Removes the single-strategy shortcut so picker + visualiser always agree.

### 2. `src/lib/freight/scenario-runner.ts`
- `pickBestPlan` already exists. Add to the returned `BestPlan`:
  - `meta.shutOut: { cartons: number; cbm: number; weightKg: number } | null`
  - `meta.allLegal: boolean` (true if at least one strategy passed all hard checks)
- Keep current fallback ordering (legal-first, then fewest reds, then highest score) but tag the result so the UI can distinguish "best legal pack with shut-out" from "no legal pack found".

### 3. `src/lib/freight/loading-rows.ts`
- Add `maxAchievableUtilizationPct` to `RowGroup`, computed from cargo footprint, gap rule, and inner width/length: `floor((W - wallMin·2 + minGap) / (cargoW + minGap))` × cargoW / W.
- Used by the audit so a row at its physical maximum cannot trip a slack warning.

### 4. `src/lib/freight/compliance.ts`
- `FLOOR_GAP` rule: compare actual utilisation against `min(targetPct, maxAchievableUtilizationPct)`. If the row is already at its geometric ceiling, do not flag.
- Keep `SUPPORT_MIN_RATIO = 0.85` (already aligned).
- Geometric-overlap support check stays as fixed previously.
- Distinguish hard violations (overlap, hanging, gap < 50 mm with vertical overlap > 1 mm, door/ceiling < min) from soft warnings (slack, fill efficiency). Only hard violations trigger RED.

### 5. `src/lib/freight/container-recommender.ts`
- Remove the 0.85 / "usable CBM" haircuts. Capacity headroom checks use raw geometric CBM.
- `fitSingle` consumes `pickBestPlan` (already wired) and propagates `meta.shutOut` into the recommendation so the UI shows shut-out totals instead of "blocked".

### 6. `src/lib/freight/packing-worker.ts` & `src/hooks/use-packing-worker.ts`
- `optimise` response includes the new `meta` (shutOut, allLegal) and the optimiser's compliance report so the UI never recomputes.
- Hook exposes the meta on the resolved value.

### 7. `src/components/freight/container-load-view.tsx`
- Consume `meta.shutOut` and `meta.allLegal` from the optimise result and pass to the HUD instead of recomputing.

### 8. `src/components/freight/loader-hud.tsx`
- Three states instead of two:
  - GREEN — `allLegal` and no shut-out: "READY TO LOAD".
  - AMBER — `allLegal` and shut-out > 0: "MAX LOADED · SHUT-OUT REPORT" with cartons/CBM/kg left behind.
  - RED — `!allLegal`: "EXPORT BLOCKED" with the specific hard-violation reasons from the optimiser's compliance report.
- Show the compliance score as "Score: NN" without coupling colour to score thresholds.

### 9. Tests
- Extend `src/lib/freight/scenario-runner.test.ts`:
  - 1066.8 mm cubes in 40HC → AMBER state, no FLOOR_GAP false positive, shut-out reported correctly when manifest exceeds 76.34 m³.
  - Manifest fits cleanly → GREEN, zero shut-out.
  - Forced overlap fixture → RED with the overlap reason surfaced.
- Add a `compliance.irreducible-slack.test.ts` covering the new `maxAchievableUtilizationPct` gate.

## Out of scope
- No change to gap values, support ratio, or geometric capacities beyond what's listed.
- No multi-container suggestions.
- No re-introduction of the Scenario Comparison UI — the sweep stays internal.
