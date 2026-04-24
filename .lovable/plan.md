## Optimise loading: run multiple internal scenarios, pick densest legal plan

When the user clicks **Optimise loading**, the system will silently try several packing strategies against the **full geometric container** and commit the densest plan that has zero physical violations. Cargo only gets reported as "shut out" if no strategy can fit it.

### Hard rules (the optimiser must NEVER violate these)

1. **Always use 100% of container inner dimensions.**
   - Use full `inner.l × inner.w × inner.h` from `CONTAINERS` in `src/lib/freight/packing.ts` (20GP 33.23 m³, 40GP 67.78 m³, 40HC 76.34 m³).
   - Do **not** apply any default safety derate, stowage factor, or "usable %" haircut to the container volume.
   - The only thing allowed to reduce achievable CBM is the **cargo's own dimensions + the 50 mm gap rule** when they geometrically refuse to tessellate. That's a packing outcome, not a configured cap.

2. **Gap rule comes from the cargo, not the container.**
   - Apply `getGapRule(packageType)` per item from `src/lib/freight/gap-rules.ts` (currently 50 mm lateral / 50 mm wall / door 100 mm / ceiling 80 mm for every package type).
   - Vertical stacking stays flush (the existing `zOverlapMm > 1` check in `packing-advanced.ts` is preserved).

3. **No hanging, no overlapping.**
   - Keep `SUPPORT_MIN_RATIO = 0.85` in `packing-advanced.ts`.
   - Keep all existing collision / wall / door / ceiling checks.

4. **Single container only — 40HC max.** The previously-removed multi-container logic stays removed. Anything that doesn't fit becomes Cargo Shut Out.

### Internal scenario sweep

**`src/lib/freight/scenario-runner.ts`** — add `pickBestPlan(items, container)`:
- Runs four strategies already defined: `row-back`, `weight-first`, `floor-first`, `mixed`.
- For each result, validates: zero overlaps, all `supportRatios >= 0.85`, no gap-rule violations, no door/ceiling reserve breach.
- Filters out any plan with violations.
- Picks the survivor with the **highest `placedCargoCbm`**; ties broken by highest `placedCount`, then lowest COG height.
- Returns `{ best: ScenarioResult, tried: ScenarioResult[] }` so the caller can show "tried N plans, picked X".

### Worker + hook plumbing

**`src/lib/freight/packing-worker.ts`** — add a new request kind:
```ts
{ kind: "optimise"; items: CbmItem[]; container: ContainerPreset }
```
Handler calls `pickBestPlan` and returns `{ kind: "optimise"; result: { best, tried } }`.

**`src/hooks/use-packing-worker.ts`** — expose `optimise(items, container)` that mirrors the existing `pack()` / `scenarios()` methods (id-based request, drops stale responses).

### Recommender update

**`src/lib/freight/container-recommender.ts`**:
- `fitSingle` and `computeShutOut` switch from a single `packContainerAdvanced` call to `pickBestPlan` so shut-out is only reported when **every** strategy fails to place an item.
- Shut-out CSV (already implemented) keeps showing unplaced packages, CBM, and weight — values now come from the densest plan.

### UI wiring

**`src/components/freight/cbm-calculator.tsx`**:
- The **Optimise loading** handler calls the new `optimise()` worker method instead of a single-shot pack.
- 3D loader, results card, PDF, and shut-out panel all consume `result.best.pack` — no new UI surface, no scenario comparison panel reintroduced.

### What stays untouched

- The removed Scenario Comparison UI, multi-container tabs, Support debug toggle, and forklift overlay all stay removed.
- `pack.supportRatios` continues to drive the existing "Stacking reduced" warnings.
- PDF, video recording, compliance report, and CSV export consume the chosen `best` plan unchanged.

### Files touched

- `src/lib/freight/scenario-runner.ts` (add `pickBestPlan`)
- `src/lib/freight/packing-worker.ts` (add `optimise` kind)
- `src/hooks/use-packing-worker.ts` (expose `optimise()`)
- `src/lib/freight/container-recommender.ts` (use `pickBestPlan`)
- `src/components/freight/cbm-calculator.tsx` (call `optimise()` from Optimise button)

### Risk

Low. No type changes leak to UI components beyond the calculator's optimise handler. Container dimensions and gap rules are unchanged — we're just searching harder within the existing physical constraints. Worst case the optimiser returns the same plan a single `packContainerAdvanced` call would have, never a worse one.
