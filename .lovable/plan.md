

## Mock flow walkthrough — confirms the bug and the fix

**Current broken flow** (verified by reading the code):

1. User types `120` into a length field → `setDraftItems` → debounce commits → `setItems(...)` in parent
2. New `items` array → cbm-calculator effect at line 380 fires (deps: `[showOptimization, items, worker]`) → calls `worker.recommend(items)`
3. Inside the hook, `send()` calls `setInflight(n + 1)` → triggers re-render of cbm-calculator
4. **Re-render runs `usePackingWorker()` again → returns a brand-new object literal** (lines 130–153) → `worker` identity changed
5. Effect fires AGAIN even though `items` didn't change → another `recommend()` → another `setInflight` → another new `worker` object → another effect fire → ...
6. React caps at ~50 cycles → **error #185 "Maximum update depth exceeded"**

The same pattern hits `container-load-view.tsx` twice (lines 160–179 for `multi`, 183–216 for `scenarios`), so the loop is triggered from three places simultaneously once the user reaches the 3D view.

**Mock flow after fix**: Methods are wrapped in `useCallback([])`, so `worker.recommend` / `worker.multi` / `worker.scenarios` keep the same identity across renders. Effects depend on those stable function refs instead of the whole `worker` object. `setInflight` still re-renders the consumer, but the effect deps are unchanged → effect does NOT re-fire → no loop. The optimize → recommendation → 3D viewer → snapshots → loading-video pipeline runs once per real input change.

This will work. Plan below.

---

## Plan: stabilize `usePackingWorker` and fix three effect deps

### 1. `src/hooks/use-packing-worker.ts`

- Import `useCallback` and `useMemo` (already imports `useEffect, useRef, useState`).
- Wrap `pack`, `scenarios`, `multi`, `recommend` in `useCallback(..., [])` — they only read mutable refs (`workerRef`, `seqRef`, `pendingRef`) and stable setters, so empty deps are safe.
- Extract `send` and `ensureWorker` as inner helpers inside the same `useCallback` closures (or hoist them as `useCallback([])` too) so they don't re-allocate.
- Return `useMemo(() => ({ pack, scenarios, multi, recommend, pending: inflight > 0 }), [pack, scenarios, multi, recommend, inflight])`. The object identity still changes when `pending` flips, but no effect depends on the whole object after step 2.

### 2. `src/components/freight/cbm-calculator.tsx` (line 398)

Change effect dep from `worker` → `worker.recommend`:
```ts
}, [showOptimization, items, worker.recommend]);
```

### 3. `src/components/freight/container-load-view.tsx` (lines 179 and 215)

```ts
// line 179
}, [deferredItems, isMulti, recommendation, worker.multi]);

// line 215
}, [hasCargo, isMulti, deferredItems, recommendation, activeTab,
    deferredContainer, compareStrategies, worker.scenarios]);
```

### Verification (after switching to default mode)

1. `bunx tsc --noEmit` — type-check passes.
2. `bun run test` — all 13 sync-invariant tests stay green.
3. Browser smoke-test on `/freight-intelligence`:
   - Type cargo dimensions → no console error
   - Click **Optimize loading** → recommendation panel populates, no #185
   - Open 3D view → renders, snapshots capture
   - Click **Loading video** → pipeline completes
4. Verify `window.__cbmSyncMetrics?.effectCycleCount` does NOT climb without input.

### Rollback safety

If after these edits the error still reproduces, the next step is to add a `console.count("recommend-effect")` inside each of the three effects, reproduce once, and read the counts via `code--read_console_logs` — that will pinpoint which effect (if any) is still looping, which is hard evidence rather than guesses.

### Out of scope

No changes to packing math, recommender logic, 3D rendering, SSR config, tooltips, results-card, or items↔draftItems sync — those are unrelated to this loop.

