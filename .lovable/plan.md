

## Foundation-of-Loading Rules — make gaps and floating cargo block compliance

### What you saw in the screenshot

- Row 5 reports **"GAPS IN ROW · 15% VOID"** in red — yet the global badge still reads **"100 COMPLIANT ✓"**.
- The pallets at floor level appear to **float** with daylight visible underneath / between them.
- Compliance score (`src/lib/freight/compliance.ts`) only inspects: weight, CoG, placed%, utilisation%. It is **blind** to gaps, support quality, floor coverage, and ceiling clearance — the actual physical "foundation of loading" rules.

### What changes

**1. Extend `compliance.ts` with the 4 missing foundation rules**

Add these checks alongside the existing ones. Each contributes to the score and surfaces a violation card in the loader HUD:

| Rule | Check | Severity | Penalty |
|---|---|---|---|
| `FLOATING_CARGO` | Any placed box with `z > 1mm` whose support ratio < 0.9 (recomputed from the height-map snapshot) | RED | -25, blocks export |
| `FLOOR_GAP` | Any row's `wallUtilizationPct < 90%` (already computed in `loading-rows.ts`) | YELLOW (≥1 row) / RED (≥3 rows or any row < 75%) | -5 per row, capped at -20 |
| `FOUNDATION_WEAK` | Any stacked box whose supporters' combined `maxStackWeightKg` is exceeded, OR resting on < 60% solid contact | RED | -20 |
| `CEILING_CLEARANCE` | Any box with `z + h > C.h - CEILING_RESERVE_MM` (already tracked as `nearCeilingPlacedIdxs`) | YELLOW | -5 |

After these additions the badge in the screenshot would correctly read **"REVIEW REQUIRED"** (yellow) instead of "100 COMPLIANT".

**2. Surface gap data the scorer needs**

`computeComplianceReport` currently receives only `AdvancedPackResult`. Extend its signature to optionally accept the pre-computed `RowGroup[]` from `loading-rows.ts`:

```ts
computeComplianceReport(pack, { rows? })
```

When `rows` are provided, the FLOOR_GAP rule runs. All call sites in `cbm-calculator.tsx`, `scenario-runner.ts`, and the PDF generator pass the rows they already build.

**3. Eliminate the "floating cargo" visual artifact**

Two real causes, fixed independently:

- **Packer side** (`packing-advanced.ts`): the snap-to-neighbour pass already exists for X and Y. Add a **snap-down on Z** pass that, after each placement, lowers the box until its bottom touches either floor (`z = 0`) or another box's top. This closes the sub-stride vertical gaps that appear when a box was placed on a tall neighbour but a shorter neighbour was added later.
- **Renderer side** (`container-3d-view.tsx`): the apparent floor gap in the screenshot is partly a Z-fighting artifact between the floor mesh and box bottoms. Lift the floor mesh by 2mm and shrink box bottoms by 1mm so the floor is always behind the boxes from any angle.

**4. New "Foundation Audit" card in the load report**

Below the existing wall-efficiency strip, add a 4-row checklist:

```
Foundation Audit
✓  All boxes resting on floor or solid support
✗  Floor gaps in 2 rows  →  Re-shuffle (see row 5, row 12)
✓  No stack-weight overload
✓  Roof clearance OK (80mm reserve)
```

Clicking a failed row scrolls to that row in the existing loading-rows panel.

### Technical notes

- **Files touched**: `src/lib/freight/compliance.ts` (rules + signature), `src/lib/freight/packing-advanced.ts` (Z-snap pass), `src/components/freight/container-3d-view.tsx` (floor offset), `src/components/freight/loader-hud.tsx` (Foundation Audit card), `src/components/freight/cbm-calculator.tsx` + `src/lib/freight/scenario-runner.ts` + `src/lib/freight/pdf.ts` (pass rows into the scorer).
- **No data-model changes.** `RowGroup`, `AdvancedPackResult`, and `PlacedBox` already carry every field the new rules need (`wallUtilizationPct`, `gapWarning`, `nearCeilingPlacedIdxs`, `loadKg`, `maxStackWeightKg`).
- **Scenario comparison stays correct.** Because every strategy is re-scored with the same rules, the Best badge will still rank by truthful compliance instead of placed%-only ties.
- **Export gating.** `canApprove` (already used to block PDF export) now flips to `false` for any RED foundation violation, preventing loaders from sealing a container with floating cargo.

### Out of scope

- No changes to the packing algorithm's placement strategy, item rotation rules, or container presets.
- No changes to the 3D camera / loading video — those were addressed in the previous turn.
- No new dependencies.

