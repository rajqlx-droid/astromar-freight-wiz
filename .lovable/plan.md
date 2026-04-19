

All finalised. Locking the full scope below — one approval, one build pass.

## Final Build Plan: Searates-style CBM Container Load Optimizer

### Capacity model (locked)
```text
20ft GP : inner 5,900 × 2,352 × 2,393 mm  → cap 30 m³
40ft GP : inner 12,032 × 2,352 × 2,393 mm → cap 60 m³
40ft HC : inner 12,032 × 2,352 × 2,700 mm → cap 70 m³
```
Auto-pick: smallest container where cargo CBM ≤ cap. If > 70 m³ → multi-container split (e.g. "1 × 40ft HC + 1 × 20ft GP").

### Visual (100% Searates parity)
- **Isometric 3D SVG container** — open-top wireframe (floor + back wall + left wall) in light grey.
- **3-face shaded cartons** — top lightest, front mid, right darkest, color-coded per item group (teal, orange, purple, blue, pink, yellow palette).
- **Top stats bar**: Used volume `47.2 / 60 m³ (78%)` with progress bar (green <80% / amber 80–95% / red >95%), used weight, packages loaded, container type.
- **Container switcher pills**: `Auto · 20ft GP · 40ft GP · 40ft HC`.
- **Color legend grid** below: swatch → "Item 1 — 40×30×30 cm × 10 pcs · 50 kg".
- **Multi-container view** when cargo > 70 m³: stacked mini isometric containers with per-container fill %.
- **Empty state**: dashed isometric outline + "Add cartons to generate loading plan".
- **Disclaimer**: "Indicative loading pattern based on stowable capacity (30/60/70 m³). Actual stow depends on weight distribution, carton orientation, and dunnage."

### Packing algorithm
Shelf-fit / FFD by volume — sort cartons largest-first, place along length, wrap rows by width, stack layers by height. Pure JS, ~80 lines, deterministic, SSR-safe. Cap at 200 rendered cartons; show "+N more (pattern repeats)" if exceeded.

### Files
```text
src/lib/freight/packing.ts                       NEW — container presets (30/60/70 caps), inner dims, FFD shelf-pack, optimal picker, multi-container splitter, color palette
src/components/freight/container-load-view.tsx   NEW — isometric SVG renderer, 3-face shaded cartons, stats bar, switcher pills, legend, multi-container view, empty state
src/components/freight/cbm-calculator.tsx        EDIT — insert <ContainerLoadView items={items} /> below items list, above results
```

### Tech notes
- Pure SVG (no three.js / canvas) — small bundle, SSR-safe, prints in PDF.
- Isometric projection: 30°, `x' = x − z·cos30°`, `y' = y − z·sin30°`.
- Honours `prefers-reduced-motion`.
- Zero new dependencies.

### Out of scope (deferred)
- WebGL drag-rotate, weight-axle distribution, mixed-orientation optimal solver.

Click **Implement the plan** below to ship.

