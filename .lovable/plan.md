# Multi-Commodity Packing Test (10–20 SKUs, Single Container)

## Goal
Confirm the packer handles realistic mixed-cargo manifests with 10–20 distinct SKUs inside a **single container** — zero overlap, zero floating boxes, no weight overflow, exact CBM accounting, and graceful overflow handling when the manifest exceeds capacity.

> Note: multi-container loading has been removed from the app, so every scenario packs into one container only. SKUs that don't fit must be reported as `unplaced` with a reason — never silently dropped or overlapped.

## Why this matters
Existing suites cover single-SKU dense packs and 2–3 SKU mixes. Real freight manifests routinely have 10–20 line items in a single container. This is the missing coverage band.

## What I'll build

A new test file `src/lib/freight/packing-advanced.multi-commodity.test.ts` with three scenarios, each packed into one container:

1. **12-SKU general cargo → 40HC (fits)** — cartons + pallets + drums of varied dims/weights, sized to fit. Asserts 100% placement.
2. **18-SKU e-commerce mix → 40GP (fits tightly)** — small-to-medium stackable cartons, mixed rotations. Asserts ≥95% placement and high utilization.
3. **20-SKU industrial mix → 20GP (intentional overflow)** — heavy drums (non-stackable), tall crates, bags, bales. Manifest deliberately exceeds 20GP capacity. Asserts: nothing overlaps, every SKU reports honest `placed/unplaced` counts, `placedWeightKg ≤ maxPayloadKg`, no silent drops.

For each scenario, assert:
- No pairwise AABB overlap (>0.5 mm any axis) — reuse helper from `accuracy.test.ts`.
- Every placed box either on floor or supported within 2 mm.
- `placedWeightKg ≤ container.maxPayloadKg`.
- Sum of placed cartons' CBM equals `placedCargoCbm` within 0.0001 m³.
- `validateAdvancedPack()` returns zero OVERLAP / FLOATING / DOOR_GAP / CEILING_GAP violations.
- Per-item stats: `planned === placed + unplaced` for every SKU; overflow scenario must have `unplaced > 0` for at least one SKU with a populated `reason`.

## Live UI verification
Load `/freight-intelligence`, build a 15-SKU manifest in the CBM calculator, run the pack, and confirm:
- 3D view renders all placed SKUs with distinct colors, no visual overlap.
- Loading rows panel lists every SKU.
- Totals match (sum of per-SKU CBM = manifest total CBM).
- Any unplaced items surface in the limit-explanation panel.

## Deliverable
Pass/fail report per scenario with timing, placed counts, utilization %, unplaced reasons, and any violations found. If a regression surfaces, I'll diagnose root cause before recommending a fix (fix would be a follow-up turn).

## Files
- **Create**: `src/lib/freight/packing-advanced.multi-commodity.test.ts`
- **Read-only**: `packing-advanced.ts`, `geometry-validator.ts`, `gap-rules.ts` (no source changes)
