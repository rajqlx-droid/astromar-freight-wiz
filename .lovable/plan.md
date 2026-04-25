# Fix 3D viewer: overlapping & hanging cargo

## What you're seeing vs what's actually happening

The packing math is correct (regression tests pass, 0 hard violations in the audit). The defect is **purely visual** — three rendering bugs in `container-3d-view.tsx` make tightly packed cartons look like they intersect or float:

1. **Every box is inflated by 0.1%.** Line 1255 renders the carton group with `scale={scale * 1.001}`. For a 1067 mm cube that is ~1 mm of extra geometry on every face. Neighbours sitting flush in the packer overlap visually by ~2 mm at every shared seam.
2. **Near-ceiling halo is 4% larger than its box.** Line 1342 paints an amber "warning lid" with `boxGeometry args={[lm * 1.04, 0.018, wm * 1.04]}`. That lid pokes into the four neighbouring cartons by ~40 mm per side — looks exactly like overlap.
3. **Pallet only renders when `box.z < 10 mm`.** Line 1212. After the z-snap pass the packer can place a floor-level carton at z = 12–30 mm (resting on a thin runner), and the decorative pallet disappears — leaving a visible air gap that reads as "hanging".

There is also one minor contributor: the tilt-stripe planes at lines 1300–1314 are offset by `+0.002` m (2 mm) outside the carton face. With the 0.1% inflation removed this is harmless, but worth tightening to `+0.0005` m.

## Plan

### 1. Remove the per-box mesh inflation
`src/components/freight/container-3d-view.tsx` line 1255 — change
`scale={scale * 1.001}` → `scale={scale}`.
This is the single biggest fix. Polygon-offset on the edges (line 1395-1397) already prevents z-fighting on shared faces, so the 1.001 hack is unnecessary.

### 2. Shrink the near-ceiling halo to fit inside the box footprint
`src/components/freight/container-3d-view.tsx` line 1342 — change
`boxGeometry args={[lm * 1.04, 0.018, wm * 1.04]}` →
`boxGeometry args={[lm * 0.98, 0.018, wm * 0.98]}` and lower its Y from `hm/2 + 0.012` to `hm/2 + 0.004`. The halo will sit on top of the carton without poking sideways into neighbours.

### 3. Seat any near-floor carton on a pallet, not just `z < 10 mm`
`src/components/freight/container-3d-view.tsx` line 1212 — change
`const onFloor = box.z < 10;` →
`const onFloor = box.z < 50;` (50 mm tolerance covers post-snap floor cartons sitting on dunnage runners). This eliminates the "missing pallet" gap that reads as floating.

### 4. Tighten tilt-stripe offsets
`src/components/freight/container-3d-view.tsx` lines 1300, 1304, 1308, 1312 — replace each `± 0.002` face offset with `± 0.0005`. Keeps stripes flush on tilted boxes without poking through neighbours.

### 5. Quick QA pass after the edits
Reload the freight intelligence page with the same 41 × 1067 mm cube scenario. Expected:
- Cartons sit shoulder-to-shoulder with crisp seams, no visible overlap.
- Floor row sits on visible wooden pallets across the entire base layer.
- Top-row amber halos sit on the lid, not on neighbouring boxes.
- HUD still shows GREEN, score 91, geometry audit clean (we are not touching the packer).

## Files to edit

- `src/components/freight/container-3d-view.tsx` (5 small edits, lines 1212, 1255, 1300-1314, 1342)

No packer, validator, or test changes are needed — the geometry was already correct after the previous fix; only the renderer was lying about it.
