# Maximise-CBM Optimiser (internal scenario sweep)

## Goal
When the user clicks **Optimise loading**, silently run multiple packing strategies against the **single 40HC** target and commit the densest *legal* plan. Anything that won't fit becomes the Cargo Shut-out summary.

## Hard rules (always enforced)
- **100% geometric container dimensions** (no stowage haircut). Capacities stay at 20GP 33.23 m³, 40GP 67.78 m³, 40HC 76.34 m³ in `src/lib/freight/packing.ts`. Effective CBM is reduced **only** when carton dimensions + gap rules physically prevent a tighter fit — never as a default safety margin.
- **Universal 50 mm gap** between neighbours and walls (already in `src/lib/freight/gap-rules.ts`); door 100 mm; ceiling 80 mm.
- **No hanging / no overlap**: keep `SUPPORT_MIN_RATIO = 0.85` and the existing overlap guard in `packing-advanced.ts`.
- **Single container only** (40HC max). Multi-container stuffing stays disabled.

## Changes

### 1. `src/lib/freight/scenario-runner.ts`
Add `pickBestPlan(items, container)`:
- Runs all four strategies (`row-back`, `weight-first`, `floor-first`, `mixed`) via `packContainerAdvanced`.
- Filters out any pack whose `compliance` report contains hard violations (overlap, hanging, gap < 50 mm on neighbours with vertical overlap > 1 mm).
- Picks the survivor with the **highest `placedCargoCbm`**; ties broken by `placedCartons`, then `compliance.score`.
- Returns `{ best: ScenarioResult, all: ScenarioResult[] }` so callers can still inspect.
- Removes the existing `qty > 300` downscale shortcut for the optimise path (it silently shrinks the manifest and contradicts "use 100% dimensions"). Keep the safeguard only for the legacy `runAllScenarios` callers.

### 2. `src/lib/freight/packing-worker.ts`
Add a new request kind:
```ts
| { kind: "optimise"; items: CbmItem[]; container: ContainerPreset }
```
Handler calls `pickBestPlan` and posts back `{ kind: "optimise", result: { best, all } }`.

### 3. `src/hooks/use-packing-worker.ts`
Expose `optimise(items, container): Promise<{ best, all }>` mirroring the existing `pack`/`scenarios` methods, with the same stale-id guard.

### 4. `src/lib/freight/container-recommender.ts`
- `fitSingle` (and the 40HC path used by `recommendContainers`) calls `pickBestPlan` instead of a single `packContainerAdvanced` call so the shut-out maths reflects the densest legal pack.
- Shut-out totals = manifest − `best.pack.placedCartons` / `best.pack.placedCargoCbm` / placed weight. Reason string already covers volume / weight / geometry.

### 5. `src/components/freight/cbm-calculator.tsx`
- The **Optimise loading** action calls the new `optimise()` worker method.
- Commits `best.pack` to the 3D loader, results card, loading-rows panel and the downloadable shut-out CSV (already wired through `container-suggestion.tsx`).
- No new UI — the scenario sweep is invisible. Existing "Cargo shut out" alert + Download summary keep working.

### 6. Tests
- Extend `src/lib/freight/packing-advanced.regression.test.ts` (or a new `scenario-runner.test.ts`) with:
  - A manifest that fits → optimiser picks the strategy with the highest CBM and reports zero shut-out.
  - A manifest that exceeds 40HC → every strategy leaves residue; optimiser still returns the densest legal pack and the shut-out totals are > 0.
  - A pathological case where one strategy violates the 50 mm gap → that strategy is filtered out.

## Out of scope
- No multi-container suggestions.
- No new UI for the scenario sweep (Scenario Comparison stays removed).
- No change to gap values, support ratio, or geometric capacities beyond what's listed.
