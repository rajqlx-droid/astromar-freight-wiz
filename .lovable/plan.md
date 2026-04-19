

## Goal
Upgrade the Container Load View into a true interactive 3D planner that helps customers visualize how mixed cargo (different sizes, weights, stackable/non-stackable) fits into a container — at the highest quality.

## What customers will see

1. **Real 3D container** (react-three-fiber + three.js)
   - Drag to orbit, scroll/pinch to zoom, double-tap to reset
   - Translucent container walls so cargo inside is always visible
   - Floor grid in metres, dimension labels on edges
   - Soft shadows, ambient + directional lighting for depth

2. **Camera presets** (one-tap buttons): Iso · Front · Side · Top · Inside walkthrough

3. **Per-item cargo cards** (above the 3D view)
   Each item gets:
   - Color swatch (matches the 3D box color)
   - **Package type**: Carton · Pallet · Crate · Drum · Bag (icon + affects render style)
   - **Stackable toggle**: when OFF, that item is forced to floor level only and gets a red ⚠ "no-stack" stripe on top of its 3D boxes
   - **Fragile toggle**: visually flagged (hatched pattern), packed last/on top
   - **Max stack weight (kg)**: heavier items can't be placed above this item

4. **Smarter packer** (`src/lib/freight/packing.ts`)
   - Sort: non-stackable first → heaviest → largest volume
   - Non-stackable items reserve full vertical column (nothing stacks on them)
   - Fragile items only placed in the top layer
   - Respect max-stack-weight per item
   - Multi-orientation: try 3 rotations per box, pick best fit
   - Returns per-item placement stats (placed/unplaced count, reason if unplaced)

5. **Live load report panel** (right side on desktop, below on mobile)
   - Per-item: planned qty / placed qty / status badge (✓ Fits, ⚠ Partial, ✗ Won't fit)
   - Total CBM used / capacity (progress bar)
   - Total weight / payload limit (progress bar)
   - Center of gravity indicator (good / forward-heavy / rear-heavy)
   - Unplaced cargo warning with reason ("3 cartons of Item B didn't fit — exceeds height after stacking Item A")

6. **Legend & how-to-load guide** (collapsible)
   - Color → Item mapping
   - Loading sequence: "Load Item A first (back wall, floor), then Item B on top, finish with Item C (fragile, top layer)"
   - Numbered loading steps shown as a small storyboard

7. **Multi-angle PDF export** (per earlier approval)
   - Captures Iso, Front, Side as PNG snapshots
   - Adds the load report table + loading sequence to the PDF
   - SVG fallback retained for SSR / print-only environments

## Technical changes

```text
ADD  src/components/freight/container-3d-view.tsx        — react-three-fiber scene, OrbitControls, camera presets, snapshot API
ADD  src/components/freight/load-report-panel.tsx        — per-item status, CBM/weight bars, COG indicator, warnings
ADD  src/components/freight/loading-sequence.tsx         — numbered storyboard of how to load
ADD  src/lib/freight/packing-advanced.ts                 — smarter packer: stackable/fragile/max-stack-weight/orientation
EDIT src/lib/freight/calculators.ts                      — extend CbmItem with: packageType, stackable, fragile, maxStackWeightKg
EDIT src/components/freight/cbm-calculator.tsx           — add package-type select + stackable/fragile toggles + max-stack-weight field per item; mount new 3D view
EDIT src/components/freight/container-load-view.tsx      — keep as SSR fallback; lazy-load 3D view on client
EDIT src/lib/freight/pdf.ts                              — accept 3 PNG snapshots + load report rows; render multi-angle layout
ADD  npm: three, @react-three/fiber, @react-three/drei   — ~150KB gzip total
```

### Performance / safety
- 3D view lazy-loaded (`React.lazy` + `Suspense`) so initial bundle stays light
- SSR-safe: only mounts after `useEffect` (prevents hydration mismatch)
- `prefers-reduced-motion` respected (auto-rotate off, snap transitions instead of tween)
- Render cap: 500 boxes max in 3D (above that, group identical items into a single instanced mesh)
- Falls back to existing SVG view if WebGL unavailable

### Out of scope (deferred)
- Drag-and-drop manual placement
- Weight-axle distribution numbers (only directional COG indicator for now)
- Saving custom load plans server-side

