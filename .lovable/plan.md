

## What user wants

Looking at the uploaded screenshot, the blue circle is the empty area to the **right of the Weight field** in each item row. The user wants two things:

1. **Per-row stats** displayed in that empty space: this row's **CBM** (qty × L×W×H) and its **Volumetric Weight** (CBM × 1000 ÷ 5).
2. **Per-package editable units** — each item row should have its own length unit (cm/mm/m/in/ft) and weight unit (kg/g/lb), instead of a single shared unit at the top. Today only Item 1 shows the unit pills and they apply globally.

## Approach

### 1. Per-row units (data model)
- Extend `CbmItem` in `src/lib/freight/calculators.ts` with optional `lenUnit?: LengthUnit` and `wtUnit?: WeightUnit`. Default to the global preference when missing.
- Update `emptyCbmItem()` to seed both from the persistent defaults — but since that helper is pure (no React), we'll just leave them undefined and resolve at render time inside `cbm-calculator.tsx`.

### 2. Per-row unit pills (UI)
- In `cbm-calculator.tsx`, move the `UnitSelector` + `WeightUnitSelector` compact pills out of the "only when idx === 0" block and render them on **every** row, next to the "Item N" title (already where they sit today, just no longer gated on idx).
- Each row's pills read/write `it.lenUnit` / `it.wtUnit` via `update(it.id, …)`. The first time a user changes Item 1's unit it also updates the persistent default (so new rows inherit it); subsequent rows are independent.
- Replace `showLen`/`setLen`/`showWt`/`setWt` to take a row-resolved unit instead of the shared one.

### 3. Per-row CBM + Vol-weight stat block (the blue area)
- Add a compact summary block to the right of (or below, on mobile) the 5-input grid showing:
  - **CBM**: `(L × W × H × qty) / 1,000,000` in m³ (4 decimals)
  - **Vol. weight**: `CBM × 1000 / 5` in kg (2 decimals)
  - **Total weight**: `qty × weight` in kg (small, muted)
- Layout: change the row's grid so inputs span the left columns and the stat block sits in a right-side card-within-card. On mobile it stacks below the inputs.
- Visual: light navy-soft background, two highlighted numbers, brand-orange accent on the headline (CBM). Updates live as user types.

### 4. Files to edit
- `src/lib/freight/calculators.ts` — add optional unit fields to `CbmItem`.
- `src/components/freight/cbm-calculator.tsx` — render per-row pills, per-row stat block, resolve per-row units in show/set helpers.
- No changes needed to packing/3D/PDF — they read cm/kg from the model and stay correct.

### Notes / non-goals
- Air calculator and other calculators stay on shared units (out of scope; user only asked about page 1 = CBM).
- Existing global unit pills on Item 1 keep working (they update Item 1's row unit AND the persistent default for new rows).
- Storage shape: `length/width/height` stay in cm and `weight` stays in kg internally — only the display unit is per-row, so saved calculations remain compatible.

### ASCII of the new row layout (desktop)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ● Item 1   [LEN cm▾] [WT kg▾]              [Packing options] [⎘][🗑] │
│ ┌──────────────────────────────────────┐  ┌────────────────────────┐ │
│ │ L  | W  | H  | Qty | Wt              │  │ CBM      0.0720 m³     │ │
│ │ 60 | 40 | 30 | 20  | 5               │  │ Vol. wt  14.40 kg      │ │
│ └──────────────────────────────────────┘  │ Total wt 100.00 kg     │ │
│                                            └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

On mobile the right card stacks under the inputs.

