

## Implement: Always-visible Optimize CTA + 3D Loading Plan discovery chip

### 1. `src/components/freight/cbm-calculator.tsx`

- Add stable anchor `id="cbm-optimize-cta"` to the "Get container optimization plan" card wrapper.
- Remove the `hasAnyDims &&` part of the gate at line 421 so the card always renders when `!showOptimization`.
- Disable the **Optimize loading** button when `!hasAnyDims`, and wrap it in a `Tooltip` showing "Enter cargo dimensions first" so users understand why it's greyed out.
- No changes to packing logic, the 3D viewer, or PDF export.

### 2. `src/routes/freight-intelligence.tsx`

- Beside the `"Load Optimizer Calculator"` heading (rendered only when `active === "cbm"`), add a small clickable pill:
  - Icon: `Sparkles` (lucide) + label `"3D Loading Plan"` + `ChevronDown` arrow.
  - Style: `rounded-full h-7 px-3 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 text-xs font-medium`.
  - On click: `document.getElementById("cbm-optimize-cta")?.scrollIntoView({ behavior: "smooth", block: "center" })`.
  - Responsive: full label on `sm+`, icon-only (`Sparkles` + `ChevronDown`) on smaller screens to keep the 948px header tidy.
- Pill renders only on the CBM tab; other tabs stay unchanged.

### Visual result

```text
Load Optimizer Calculator   [✨ 3D Loading Plan ↓]   ← new pill (CBM tab only)
CBM / Load Simulator
...
[ Item 1 ... ]
┌─ Get container optimization plan ─────────────┐    ← always visible now
│ See exactly how your cargo fits in 20'/40'…   │
│ [ Optimize loading ▶ ]   (disabled + tooltip  │
│                           until dims entered) │
└───────────────────────────────────────────────┘
```

### Files touched
- `src/components/freight/cbm-calculator.tsx` — gate change, anchor id, disabled state + tooltip on Optimize button.
- `src/routes/freight-intelligence.tsx` — header pill beside "Load Optimizer Calculator" with smooth scroll-to-anchor.

### Out of scope
- 3D viewer behavior, packing algorithm, PDF export, other calculator tabs.

