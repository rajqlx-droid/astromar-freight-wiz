# Extended End-to-End Packing and Geometry Fix — COMPLETE

Status: ✅ All 8 work items shipped. 43 tests passing. The shared geometry validator is now the single source of truth across packer, compliance, scenario runner, worker, HUD, and 3D viewer.

## What is additionally broken
1. **3D false-overlap rendering**: floor cargo is visually lifted by a rendered wooden pallet in `src/components/freight/container-3d-view.tsx`, while stacked cargo uses raw pack `z`. This can make clean stacks look interpenetrated in 3D even when the pack math is legal.
2. **No final geometry validator**: `src/lib/freight/packing-advanced.ts` rejects bad candidates during placement, but there is no shared post-pack validator that rechecks the final placed set for pairwise overlap, neighbour gaps, wall/door/ceiling clearance, and unsupported stacks.
3. **Support / gap logic is still placement-local**: candidate checks are done box-by-box against the current state. After snap passes and final placement, the system does not produce a canonical “physics audit” object from the final geometry.
4. **Row slack ceiling is approximate for mixed rows**: `loading-rows.ts` uses the narrowest footprint to estimate `maxAchievableUtilizationPct`, which can still misclassify mixed-size rows and leave avoidable empty bands.
5. **HUD drift still exists**: `loader-hud.tsx` still recomputes compliance locally instead of rendering the exact optimiser-side audit/report.
6. **Coverage gaps in tests**: current tests cover irreducible slack and cube stacking, but not final-state overlap detection, stacked mixed-SKU support, snap-induced regressions, or 3D/view-model alignment.

## Implementation

### 1. Add a shared final geometry validator
Create a shared validator in `src/lib/freight` that consumes the final `placed[]` set and produces a canonical audit report for:
- pairwise 3D overlap/interpenetration
- neighbour gap violations only when boxes overlap vertically
- wall side clearance
- door reserve breach
- ceiling reserve breach
- unsupported / weakly supported stacks using geometric overlap
- non-stackable cargo carrying load above it
- fragile/sealed columns carrying extra load above them

This validator becomes the single source of truth for “hard physical violation” decisions.

### 2. Tighten `packing-advanced.ts`
Update the packer so final placement uses the same validator logic the audit uses:
- use orientation-aware height checks consistently
- validate the final snapped candidate before commit using the shared validator rules
- ensure snap-to-neighbour cannot create post-snap gap or overlap regressions
- explicitly track when a candidate was rejected by geometry, support, stack-weight, wall, door, or ceiling constraints
- expose richer diagnostics so unplaced cargo can be distinguished from “rejected because unsafe to stack or fit”

### 3. Make compliance consume the shared validator
Refactor `src/lib/freight/compliance.ts` so it stops inferring hard failures indirectly and instead maps the final geometry validator result into compliance items.
- RED only for true physical failures
- YELLOW for efficiency/shut-out/slack advisories
- preserve the irreducible-slack fix, but base it on more exact row geometry

### 4. Improve row geometry in `loading-rows.ts`
Replace the current approximate `maxAchievableUtilizationPct` logic with a more exact row-floor packing ceiling based on the actual bottom-layer footprints present in that row.
- calculate the true occupied floor intervals along width and depth
- distinguish unavoidable slack from poor arrangement
- keep gap warnings only for reducible voids

### 5. Pass optimiser audit end-to-end
Update `scenario-runner.ts`, `packing-worker.ts`, `use-packing-worker.ts`, and `container-load-view.tsx` so the optimiser returns:
- chosen pack
- canonical validator/audit report for that chosen pack
- shut-out totals
- all-legal flag
- hard violation reasons

The UI should render that report directly instead of recomputing locally.

### 6. Fix 3D visual alignment
Update `src/components/freight/container-3d-view.tsx` so the rendered box positions match the physical pack model exactly.
- remove or rebalance the extra visual pallet lift that makes floor cargo appear higher than packed coordinates
- keep pallet visuals decorative only if they do not change perceived contact planes
- verify stacked boxes, roof clearance, and floor contact all visually match `placed[]`

### 7. Update HUD behaviour
Update `src/components/freight/loader-hud.tsx` to consume the optimiser-provided audit/validator result directly.
- GREEN: legal pack, no shut-out
- AMBER: legal max-loaded pack with shut-out or efficiency warnings
- RED: actual physical failure from validator
- display score separately from legal/blocked state

### 8. Expand tests
Extend tests to cover:
- mixed-size stacked loads with exact support validation
- final-state overlap detection on forced-bad fixtures
- post-snap gap preservation
- non-stackable cargo never carrying upper load
- fragile/sealed columns not accepting further stacking
- 3D alignment expectations for floor vs stacked cargo coordinates
- mixed-row irreducible slack vs reducible slack

## Technical details
- Keep 100% geometric dimensions; do not reduce CBM by default.
- Only real cargo dimensions plus gap/clearance rules may reduce effective loaded CBM.
- Use one shared geometry/physics validator for packer, compliance, worker, and HUD.
- Separate physical illegality from loading inefficiency.
- Keep the optimiser legal-first; only fall back when every strategy is illegal, and surface that explicitly.

## Files likely involved
- `src/lib/freight/packing-advanced.ts`
- `src/lib/freight/compliance.ts`
- `src/lib/freight/loading-rows.ts`
- `src/lib/freight/scenario-runner.ts`
- `src/lib/freight/packing-worker.ts`
- `src/hooks/use-packing-worker.ts`
- `src/components/freight/container-load-view.tsx`
- `src/components/freight/loader-hud.tsx`
- `src/components/freight/container-3d-view.tsx`
- freight geometry/compliance test files

## Out of scope
- No change to container dimensions or gap-rule constants
- No multi-container stuffing
- No default capacity haircut or safety margin rollback