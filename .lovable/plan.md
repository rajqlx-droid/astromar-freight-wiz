

## Fix: Page Unresponsive on Realistic Loads (50+ cartons)

### Diagnosis

The "Page Unresponsive" dialog fires because every input commit triggers **6 synchronous full packing runs** on the main thread:

- `runAllScenarios` runs the packer **4 times** (one per strategy)
- `multiPacks` runs it once per recommended container
- `unitStats` (in cbm-calculator) runs it **again** per recommended container — duplicate work
- Plus `singlePack` fallback in some code paths

For 50 cartons of 55×55×55cm in a 40HC:
- ~67,680 candidate positions per box per orientation
- Gap-check loop scans all already-placed boxes per candidate
- Result: **~85M operations per pack × 6 packs ≈ 500M ops blocking the main thread**

The 300-qty `scaleFactor` guard doesn't help — 50 cartons is well below the cap.

### Fix Plan

**1. Eliminate duplicate packing work**

In `cbm-calculator.tsx`, `unitStats` calls `packContainerAdvanced` per recommended container — but `ContainerLoadView` already does the same work via `multiPacks`. Replace `unitStats` with a lightweight CBM-only estimate (no 3D packing) for the badge counts in the suggestion banner. The exact placed/total count will be reconciled when the viewer renders.

**2. Drop scenario count from 4 to 1 by default, gate the rest behind a user action**

Most users only need the recommended "best" pack. Running 4 strategies on every keystroke commit is the dominant cost. Change `ContainerLoadView` so `scenarios` only contains `["row-back"]` initially. Add an explicit "Compare strategies" button that, when clicked, runs the remaining 3 strategies and reveals the comparison table. This cuts cost by 75% in the common case.

**3. Cap the placement scan inside `packContainerAdvanced`**

In `packing-advanced.ts`, after a box has been placed near the back of the container, skip scanning the entire container length for the next box of the same size — start from the topmost active row. Two concrete bounds:

- After placing N boxes, track the max-X reached (`frontierX`) and limit each new box's scan to `min(C.l, frontierX + 2 × maxBoxLen)`. This is correct because the back-to-front scoring guarantees no better placement exists further forward.
- Increase `PLACE_STEP_MM` from 50 to 100 when total cartons > 30. The snap-to-neighbour pass at the end already recovers sub-stride precision, so packing density is preserved.

**4. Move the heavy packing call off the render path**

Wrap each `useMemo` that calls `packContainerAdvanced`/`runAllScenarios` in a `useDeferredValue` of its inputs, so React can interrupt the calculation if the user keeps typing. This won't reduce CPU but it stops the "Page Unresponsive" browser dialog by keeping the event loop responsive between scheduling slices.

**5. Increase the debounce window for very large manifests**

In `cbm-calculator.tsx`, change the debounce from a flat 400ms to `400ms` for ≤20 cartons and `800ms` for >20 cartons. Lets the user finish typing a full quantity like "50" before a single pack run fires.

### Files to edit

- `src/lib/freight/packing-advanced.ts` — add frontier-bounded scan + adaptive `PLACE_STEP_MM`
- `src/lib/freight/scenario-runner.ts` — accept a `strategiesToRun` parameter (default `["row-back"]`)
- `src/components/freight/container-load-view.tsx` — gate the 3-extra-strategy run behind a "Compare strategies" toggle; wrap pack memos with `useDeferredValue`
- `src/components/freight/cbm-calculator.tsx` — replace `unitStats`'s `packContainerAdvanced` call with a CBM/qty estimate; adaptive debounce window

### Expected impact

For 50 cartons × 55cm in a 40HC:
- Single strategy + frontier scan + step 100mm: **~5–8M ops** (was ~85M per pack)
- Total per commit: **~5M ops, 1 pack** (was ~500M ops, 6 packs)
- Estimated render time on a typical laptop: **~150ms** (was 6+ seconds → "Page Unresponsive")

Strategy comparison still available on demand via the new button — same UI, opt-in cost.

### Notes

- No UI removed. The strategy comparison table still works the same way once revealed.
- `selectedStrategyId` state stays intact so once strategies are computed, "Load" still applies them.
- The accuracy of `unitStats` badges in the suggestion card drops from "exact placed count" to "estimated by CBM" — the viewer's tabs still show exact counts. If exact counts matter at the suggestion-card stage, we can run those packs in a Web Worker as a follow-up.

