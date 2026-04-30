# Viral-Traffic Readiness Test Suite

Run 5 tests to verify the freight calculator can handle 100+ concurrent users without crashing, then deliver a single readiness report with pass/fail per test and fixes for anything that fails.

## Tests to run

1. **Edge fetch storm** — 200 parallel `fetch()` requests against the published URL (`astromar-freight-wiz.lovable.app`) for HTML + main JS chunks. Measure status codes, p50/p95/p99 latency, throughput. Pass: 100% 2xx, p99 < 1500ms.

2. **Worker memory leak test** — Vitest test running 10 sequential 650-carton packs. Measure `process.memoryUsage().heapUsed` delta. Pass: heap growth < 50 MB, every pack < 5s.

3. **Concurrent worker simulation** — Node script spawning 20 parallel `worker_threads`, each running a 250-carton pack. Verify all 20 return identical results to a single-run baseline (determinism + no shared state). Pass: all complete, results match, wall-clock scales near-linearly.

4. **Bundle size audit** — Inspect existing `dist/` build output (or trigger one). Report total initial JS, worker chunk size, any chunks > 500 KB. Pass: initial < 300 KB gzipped, worker < 200 KB gzipped.

5. **Throttled browser smoke test** — Browser tool against preview with 4× CPU throttle, run 250-carton scenario, verify UI responsive, 3D renders, no console errors.

## Deliverable

A markdown report with a results table, any failures explained, fixes applied (if needed), and a green/yellow/red viral-readiness verdict. No new app features — this is verification + targeted fixes only.

## Files likely touched (only if a test fails)

- `src/lib/freight/packing-advanced.ts` — only if memory leak or determinism issue found
- `vite.config.ts` — only if bundle audit reveals a chunk that needs splitting
- New file `scripts/load-test/*.ts` for tests 1 + 3 (kept out of the app bundle)
- New file `src/lib/freight/packing-advanced.stress.test.ts` for test 2

## Out of scope

Backend rate limiting, k6/Artillery API tests (no API exists in calculator path), DB pool tests (no DB used).
