## Goal

Fix two related bugs on the optimization page:

1. **40ft GP bias**: the 3D viewer's "Auto" choice shows 40ft GP for low-CBM cargo that should fit a 20ft GP (and disagrees with the recommendation banner above it).
2. **Persistent "Calculating…"**: the Auto pick runs a heavy synchronous packer on the main thread inside `useMemo`, blocking the UI and leaving the spinner stuck.

Root cause: `ContainerLoadView` calls `pickOptimalContainer(items)` synchronously on every items change. That function runs the full multi-strategy `pickBestPlan` against every container preset on the main thread. Meanwhile, the recommendation banner uses the same logic via the worker and may pick 20GP — so the two displays disagree, and the main-thread version freezes the page.

## Changes

### 1. `src/components/freight/container-load-view.tsx`
- Remove the `pickOptimalContainer(items)` call from the render path.
- Derive `autoContainer` from the `recommendation` prop (already passed in by `cbm-calculator.tsx`):
  - If `recommendation?.units[0]?.container` exists → use it.
  - While the recommendation is still pending (first render / no prop) → fall back to a cheap CBM-only pick using `recommendContainersFast(totalCbm, totalWeight)` so the Auto pill shows a sensible label immediately instead of defaulting to 40HC.
- Keep the existing worker `optimise()` call that produces the actual 3D pack — that part already runs off-thread and is correct. Just stop racing it with a second main-thread sweep.

### 2. `src/components/freight/cbm-calculator.tsx`
- No structural change needed; it already passes `recommendation` into `ContainerLoadView`. Confirm the prop is wired (it is, line 813) and that `recommendation` is computed via the worker path elsewhere in this file.

### 3. Cleanup
- Remove the now-unused `pickOptimalContainer` import from `container-load-view.tsx`.
- Leave `pickOptimalContainer` in `packing.ts` (still used by tests and other callers); just stop calling it from the React render path.

## Expected result

- For low-CBM loads, the Auto pill and the 3D viewer match the banner (e.g. "Auto · 20ft GP").
- No main-thread freeze; "Calculating…" only shows briefly while the worker returns the real pack, then disappears.
- Banner recommendation and 3D viewer always agree on container choice.

## Out of scope

- No changes to the recommender's 20GP-first policy or the worker protocol.
- No visual/HUD changes.
