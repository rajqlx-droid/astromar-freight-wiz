# Approved scope — execute on approval

The live preview already calls `worker.optimise(...)` (i.e. `pickBestPlan`) inside `container-load-view.tsx`. Remaining work:

## 1. `src/lib/freight/scenario-runner.ts`
- `pickBestPlan(items, container, previousStrategyId?)`:
  - **Full-fit ranking** (every plan placed everything): keep current — densest CBM → most cartons → compliance.
  - **Partial-fit ranking** (any plan has shut-out): **most cartons placed → most CBM → most weight → fewest red violations → compliance score**. Apply to BOTH legal pool and red-fallback pool.
  - **Stickiness:** if `previousStrategyId` matches a candidate within 1% `placedCargoCbm` and same `placedCartons`, keep it.

## 2. `src/lib/freight/packing-advanced.ts`
- Spread-mode trigger: `volumeFill < 0.40` AND (≤1 SKU OR ≤8 cartons) AND strategy ∈ {`auto`,`mixed`}. (Was `< 0.65`.)
- Always run X-snap (remove the `if (!spreadMode)` guard at line 759).
- Add second snap pass: `snapAxis("y"); snapAxis("x")` after the first.
- Adaptive `placeStep`: `>200 → 100`, `>60 → 75`, else `50`.
- CoG-rescue: if tight pack returns `|cogOffsetPct| > 0.18`, retry that strategy with spread enabled and pick whichever pack has lower |cogOffsetPct|.

## 3. `src/lib/freight/packing-worker.ts` + `src/hooks/use-packing-worker.ts`
- Forward optional `previousStrategyId` through the `optimise` request.
- Add `cancelAll()` to the hook: bumps `seqRef`, rejects pending promises with sentinel `"Cancelled: superseded"`, resets `inflight`. Auto-recreate worker if >2 cancellations in <500 ms.

## 4. `src/components/freight/container-load-view.tsx`
- Track previous `activeContainer.id` in a ref. On change:
  1. `worker.cancelAll()`
  2. reset `singlePack` to `makeEmptyPack(newContainer)`, `planMeta` to `null`, sticky strategy ref to `undefined`
  3. fire fresh `worker.optimise(items, container, undefined)`
- On manifest/items change (not container change), pass current sticky `previousStrategyId`.
- Catch the `"Cancelled: superseded"` error silently.

## 5. Tests — `src/lib/freight/scenario-runner.test.ts`
- New: partial-fit ranking — when manifest exceeds container, the winner has the highest `placedCartons` of all 4 strategies.
- New: stickiness — passing `previousStrategyId` keeps the previous winner when within 1% / same carton count.
- New: container-change semantics — calling without `previousStrategyId` ignores stickiness.

## 6. Run vitest
- `bunx vitest run` after changes. Update only snapshots where `placedCartons` improved or held while bounding box shrank. Reject any regression.

**Approve to execute.**