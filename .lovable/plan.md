

## Scope clarification: apply space optimization to all 6 freight tools

Yes — the same compact-layout treatment will be applied across all six calculators in the Freight Intelligence suite, not just CBM and Air.

### The 6 tools
1. **CBM Calculator** — full treatment (unit chips in header, 2/3/5 grid, compact NumberField)
2. **Air Freight Calculator** — full treatment (same as CBM + volumetric divisor inline with units)
3. **Landed Cost Calculator** — header condensing, tighter input grid, compact NumberField
4. **Export Price Calculator** — header condensing, tighter input grid, compact NumberField
5. **Risk / Margin Calculator** — header condensing, compact NumberField
6. **Compare Calculator** — tighter side-by-side columns, compact NumberField, condensed result rows

### What changes per tool

| Tool | Unit chips | Grid refactor | Compact NumberField | Header condense |
|---|---|---|---|---|
| CBM | yes | yes (2/3/5) | yes | yes |
| Air | yes | yes (2/3/5) | yes | yes |
| Landed Cost | n/a (currency only) | yes (2-col mobile) | yes | yes |
| Export Price | n/a (currency only) | yes (2-col mobile) | yes | yes |
| Risk | n/a | yes (2-col mobile) | yes | yes |
| Compare | n/a | tighten 2-col | yes | yes |

Currency selector (₹/$/€/£) is **out of scope for this pass** — flagged as a follow-up so this stays a pure layout/UX cleanup with zero logic changes.

### Files to edit
```text
src/components/freight/number-field.tsx        — add `compact` prop (hide steppers, tighter gap, segmented look)
src/components/freight/unit-selector.tsx       — add `compact` chip variant (32px, inline label)
src/components/freight/cbm-calculator.tsx      — inline unit chips in item header, new grid, compact fields
src/components/freight/air-calculator.tsx      — same as CBM + divisor chip
src/components/freight/landed-calculator.tsx   — condense header, 2-col mobile grid, compact fields
src/components/freight/export-calculator.tsx   — condense header, 2-col mobile grid, compact fields
src/components/freight/risk-calculator.tsx     — condense header, compact fields
src/components/freight/compare-calculator.tsx  — tighten columns, compact fields, condensed result rows
```

### Result
- Consistent compact look across all 6 tools.
- ~80–100px vertical space saved per tool on mobile.
- No orphan grid cells at any breakpoint.
- 44px input touch targets preserved; only ± steppers hide on tight layouts.
- Zero logic / calculation / validation changes.

### Out of scope
- Currency selector for Landed/Export.
- Visual redesign beyond spacing/density.
- Container Load View layout (already optimized).

