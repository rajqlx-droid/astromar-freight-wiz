

## Revised gating — CBM always works, only optimization is gated

You're right. Current behavior blocks the popover too aggressively. Fix: **CBM math is never gated. Packing options are only required when the user explicitly requests container optimization.**

### New flow
1. User fills dimensions + qty + weight → **CBM, chargeable weight, totals calculate immediately** (no warnings, no amber chips, no popover pressure).
2. Container suggestion banner is **replaced with a CTA card**: *"Get container optimization plan"* button.
3. Clicking the CTA checks: do all rows have `packingConfirmed === true`?
   - **Yes** → run optimization, show `<ContainerSuggestion>` + unlock 3D view, Loading Video, PDF download.
   - **No** → open a single modal listing unconfirmed items with inline toggles (stackable / fragile / sideways / axis / max stack weight) + "Apply to all" + Confirm button. On confirm → run optimization automatically.
4. Once optimized, a small "Edit packing options" link stays visible so user can re-tune and re-run.

### UI changes in `cbm-calculator.tsx`
- Remove the per-row amber "⚠ Packing options required" pressure chip.
- Per-row packing chip becomes **neutral/optional** by default (small grey "Packing options" link). Only turns green summary chip *after* user has confirmed.
- Replace gated banner with the **"Optimize container loading" CTA card** (always visible once at least one row has dimensions).
- Add a new **"Confirm packing options" modal** (reuses existing popover toggles in a list per item + Apply-to-all + Confirm button).
- 3D view, Loading Video, Download PDF are hidden (not greyed) until optimization has been requested at least once.

### State
- Keep `packingConfirmed: boolean` on `CbmItem` (already added).
- Add local UI state `optimizationRequested: boolean` in `cbm-calculator.tsx` — flips to true after user confirms in the modal. Drives whether `<ContainerSuggestion>` + 3D + Video + PDF render.

### Other calculators
Unchanged. (Air, Landed, Export, Compare, Risk never showed packing options.)

### Hydration warning
Already fixed in the previous turn (`freight-intelligence.tsx` footer span). The runtime error in context is stale from before the fix — verify and leave alone if resolved.

## Files touched
```text
EDIT  src/components/freight/cbm-calculator.tsx       — remove amber pressure, add Optimize CTA + confirm-packing modal, optimizationRequested state
EDIT  src/components/freight/container-suggestion.tsx — remove "blocked" warning variant (no longer needed)
EDIT  src/components/freight/results-card.tsx         — hide (not disable) 3D / Video / PDF until optimizationRequested
```

## Out of scope
- Changing the packing-options field set
- Changes to other calculators
- Persisting `optimizationRequested` across reloads (session-only is fine)

