# Packer regression fixes — found during live 3D preview test

## What I tested

I ran two real scenarios in the live preview (40ft HC, 1.5 ft cubes / 45.72 cm):

1. **650 cubes × 50 kg** — finished, but reported **"650 / 650 placed"** while simultaneously showing **Payload 32,500 / 26,500 kg · 100% (red)**. The packer placed cargo that exceeds the legal container payload.
2. **250 cubes × 10 kg** — UI stuck on **"Calculating…" for 80+ seconds** and never returned a 3D view. The recent "edge-aware candidates" change has made the worker effectively non-terminating for medium loads.

These two issues — plus the visual "same place loaded twice / zig-zag" the user is reporting — all trace back to the same recent commits in `packing-advanced.ts` and `scenario-runner.ts`.

## Root causes

### 1. Edge-candidate explosion (cause of the freeze and of cargo appearing in the same place)

In `src/lib/freight/packing-advanced.ts` (around lines 584–601), every placement now rebuilds candidate X/Y arrays from **every placed box's edges**, for **every orientation**, for **every remaining carton**:

```
xCandSet/yCandSet ← stride grid ∪ {p.x, p.x+p.l+gap, p.y, p.y+p.w+gap} for all p ∈ placedInternal
```

Combined with `evaluatePlacement` (itself O(n)), this is roughly **O(n³)** total. For 250 boxes that's hundreds of millions of operations → the worker times out before returning. The user sees the spinner forever, or, when it does return, the renderer eventually receives a partial / stale snapshot where two boxes appear to occupy the same slot because the candidate set picked an edge that wasn't yet committed.

### 2. Payload cap not enforced during placement

Search shows `container.maxPayloadKg` is only used in the **post-hoc utilization metric** (line 1063). There is **no early-exit check** inside the placement loop. The packer happily places 32.5 t into a 26.5 t container and still reports "650/650 placed". The UI then shows a contradiction: "100% loaded" + "100% red overweight". This is also why the user feels "loaded count vs 3D doesn't match" — legally, only ~530 of those cubes can actually ride.

### 3. Y-front edge candidate without a width-completion guard

`yCandSet` adds both `p.y` and `p.y + p.w + gap` from every placed box. When a back-wall row is partly built, the next carton can pick a `y` from a *different* row (e.g. the front of an already-stacked column), creating the "zig-zag tower" the user reported. The aligned-stack bonus added in the previous turn only fires for stacked items (z > 0), not for the floor row.

## Fix plan

### A. Bound candidate generation — restore performance and determinism

In `packing-advanced.ts`, replace the unconditional all-edges union with a windowed version:

- Only collect edges from boxes whose `x` lies in `[frontierX − maxItemLen, frontierX + 2 × maxItemLen]` (the active row + one row ahead).
- Cap each candidate set at `MAX_CANDIDATES_PER_AXIS = 64`. If the set exceeds the cap, keep the stride grid plus the closest 32 edge points to `frontierX` / current `yFrontier`.
- Skip edge-rebuild entirely when `placedInternal.length < 16` (small loads use the stride grid, which is already fine).

Expected effect: 250-cube run completes in <2 s; 650-cube run in <8 s; result quality unchanged because the dropped candidates lie outside the active row.

### B. Enforce payload cap inside the placement loop

In `packing-advanced.ts`, before accepting a placement:

```
if (container.maxPayloadKg > 0 &&
    placedWeightKg + c.weight > container.maxPayloadKg) {
  lastReason ||= "Container payload cap reached";
  break; // stop trying further cartons of this SKU
}
```

Track `placedWeightKg` as a running total alongside `placedInternal`. Surface the rejection in `whyNotPlaced` so the Load Report says "Stopped at 530 — payload cap" instead of falsely claiming 650/650.

### C. Floor-row width completion before any new row

Add a `currentRowYFrontier` tracker. While a back-row is being built (cartons at `x ≈ frontierX`, `z = 0`), restrict `yCandidates` to `{wallGap, currentRowYFrontier, currentRowYFrontier + lastPlacedW + gap}`. Only release this restriction once `currentRowYFrontier + o.w > C.w` (row full). This kills the zig-zag floor pattern the user is seeing.

### D. UI consistency check

In `scenario-runner.ts`, after `packContainerAdvanced` returns, assert `placedWeightKg ≤ container.maxPayloadKg`. If not, log a console warning and clamp `placedCartons` to the legal subset so the "Packages loaded" counter and the 3D view never disagree.

### E. Tests

Extend `packing-advanced.capacity.test.ts`:

- **Payload-cap test**: 650 × (45.72³ × 50 kg) into 40HC must place at most 530 cartons, and `placedWeightKg ≤ 26500`.
- **Performance budget**: 250 × 45.72³ cubes must complete in `< 3000 ms` on the test runner.
- **Floor-row contiguity**: for the 250-cube case, all `z=0` cartons must form a contiguous lattice (no gaps > 5 mm between neighbours in the same row).

## Files to change

- `src/lib/freight/packing-advanced.ts` — bounded candidate sets (A), payload-cap break (B), row-frontier guard (C).
- `src/lib/freight/scenario-runner.ts` — post-pack legality clamp (D).
- `src/lib/freight/packing-advanced.capacity.test.ts` — three new tests (E).

## Out of scope

- Visual styling of the 3D viewer (the THREE deprecation warning in console is harmless).
- Spread-mode CoG balancing (already constrained to <55% utilization in the previous fix; not implicated here).

Approve to implement A → E and re-test the same 250-cube and 650-cube scenarios in the live preview.
