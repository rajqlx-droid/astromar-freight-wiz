

## Goal

In the **Air Volume Weight** PDF, collapse each item's two-row "Inputs" entry into a **single row** so 4 items produce 4 rows instead of 8.

## Current behavior

In `src/components/freight/air-calculator.tsx` (lines 55–59), `inputsTable` emits **two rows per item**:

```
Item 1 L×W×H (cm)              | 51 × 34 × 26
Item 1 Qty / Actual Weight     | 6 pcs / 18.83 kg
Item 2 L×W×H (cm)              | 47 × 35 × 27
Item 2 Qty / Actual Weight     | 12 pcs / 9.36 kg
...
```

## New behavior

One row per item, with all dims + qty + actual weight + per-unit volumetric weight in a single value cell:

```
Item 1   | 51×34×26 cm · 6 pcs · 18.83 kg actual · 7.51 kg vol/pc
Item 2   | 47×35×27 cm · 12 pcs · 9.36 kg actual · 7.40 kg vol/pc
Item 3   | 61×40×31 cm · 16 pcs · 7.00 kg actual · 12.61 kg vol/pc
Item 4   | 66×40×31 cm · 16 pcs · 7.00 kg actual · 13.64 kg vol/pc
```

This keeps every input piece visible while halving the table height. The label column becomes simply `Item N`, and the value column packs L×W×H, qty, actual weight, and the per-piece volumetric weight (computed as `L×W×H / divisor`) separated by middle-dot dividers.

## Files touched

- `src/components/freight/air-calculator.tsx` — rewrite the `inputsTable = items.flatMap(...)` block to produce one row per item with combined value string.

No changes needed in `pdf.ts` (autoTable already renders whatever rows it gets), no changes in `results-card.tsx`, no logic/calculation changes — purely a row-formatting refactor in the air calculator's input summary.

## Notes

- Other calculators (Sea, Export, Landed, CBM, Risk) are untouched — only the Air calculator's PDF input table changes.
- Heading rows of the auto-table (`Input | Value`) and all KPI tiles, results, and analytics charts remain identical.

