

## Goal
Two upgrades to the CBM Calculator:
1. **In-browser video preview** before download (not just download).
2. **Smart container recommendation** based on total CBM with auto-multi-container suggestions.

---

## Part 1: In-browser video preview

The previously-approved "Generate Loading Video" feature already produces an MP4 blob. Instead of downloading it directly, open a dialog with:
- `<video>` element with `controls` autoplay-muted preview of the generated MP4
- Playback speed buttons (0.5× slow-motion, 1×, 2×)
- Step counter overlay ("Step 4 of 12: Item B — Carton")
- "Download MP4" button below the player
- "Regenerate" button if user wants higher resolution (720p ↔ 1080p toggle)

File: edit `loading-video-button.tsx` to render a Dialog with `<video src={URL.createObjectURL(blob)} />` instead of triggering download immediately. Revoke the object URL on dialog close to free memory.

---

## Part 2: Smart container recommendation engine

### Container capacity reference (industry standard, usable CBM after dunnage ~85% of geometric)

| Container | Geometric CBM | Usable CBM (recommended max) | Payload |
|---|---|---|---|
| 20 ft GP | 33.2 | **28** | 28,000 kg |
| 40 ft GP | 67.7 | **58** | 26,500 kg |
| 40 ft HC | 76.4 | **68** | 26,500 kg |
| 45 ft HC | 86.0 | **76** | 27,500 kg |

### Recommendation algorithm (`src/lib/freight/container-recommender.ts` — new)

```text
function recommendContainers(totalCbm, totalWeightKg):
  // Single-container recommendation
  if totalCbm ≤ 28 and weight ≤ 28000  → suggest "1 × 20 ft GP"
  if totalCbm ≤ 58 and weight ≤ 26500  → suggest "1 × 40 ft GP"
  if totalCbm ≤ 68 and weight ≤ 26500  → suggest "1 × 40 ft HC"
  if totalCbm ≤ 76 and weight ≤ 27500  → suggest "1 × 45 ft HC"

  // Multi-container: greedy fill with largest, remainder gets best-fit
  else:
    n40hc = floor(totalCbm / 68)
    remainder = totalCbm - n40hc * 68
    add best-fit single container for remainder (20GP / 40GP / 40HC)
    return e.g. "2 × 40 ft HC + 1 × 20 ft GP"

  // Always show alternatives
  alternatives = [
    "Cost-optimal: <fewest containers>",
    "Volume-optimal: <highest utilization %>",
    "Split-friendly: <multiple smaller for partial deliveries>"
  ]
```

### Trigger threshold
- At total CBM ≥ **25** (approaching 20ft limit), show a soft suggestion banner.
- At total CBM ≥ **70**, show a prominent dialog: "Your shipment exceeds a single 40 ft HC. Add containers?"
- Also trigger when weight exceeds current container's payload, even if CBM fits.

### UI changes

**New component**: `src/components/freight/container-suggestion.tsx`
- Inline banner above the result card showing recommended container(s) with utilization bar
- "Apply this recommendation" button → auto-sets the container selector
- For multi-container: shows a stacked breakdown ("Container 1: 40 HC, 95% full · Container 2: 20 GP, 60% full") and packs each separately so the 3D view + load report show **per-container** plans tabbed

**Edit `cbm-calculator.tsx`**:
- After totalCbm calc, call `recommendContainers()`
- Render `<ContainerSuggestion />` banner when recommendation differs from current selection
- When multi-container, run packer per-container (split items greedily by volume, biggest items first into biggest container) and pass an array of pack results to a new `<MultiContainerView />`

**Edit `container-load-view.tsx`**:
- Accept `packResults: AdvancedPackResult[]` (array). Render tabs "Container 1 / Container 2 / ..." each with its own 3D + 2D view.
- Single-container case unchanged (renders directly without tabs).

**Edit `load-report-panel.tsx`**:
- Show per-container summary + a top-level "Total shipment" roll-up.

---

## Files touched

```text
ADD   src/lib/freight/container-recommender.ts   — capacity table + recommendation algorithm + multi-container split
ADD   src/components/freight/container-suggestion.tsx — recommendation banner + apply button
EDIT  src/components/freight/loading-video-button.tsx — dialog with <video> preview, speed controls, then download
EDIT  src/components/freight/cbm-calculator.tsx  — call recommender, render suggestion, support multi-container
EDIT  src/components/freight/container-load-view.tsx — accept array, render per-container tabs
EDIT  src/components/freight/load-report-panel.tsx — per-container + roll-up totals
EDIT  src/lib/freight/pdf.ts — multi-container PDF (one section per container)
```

No new dependencies. No API breaks for single-container case.

## Out of scope
- Real-time container pricing (no carrier API integrated)
- Refrigerated / open-top / flat-rack container types
- Per-port weight restrictions (some ports cap below 26.5 t)

