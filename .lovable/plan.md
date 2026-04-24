## Remove "Support" debug toggle from the 3D view

The 3D viewer currently has a top-left "Support debug" pill that recolors cargo by support ratio (blue/green/lime/amber/red). You want it gone.

### What gets removed

**`src/components/freight/container-load-view.tsx`**
- Delete the `<SupportDebugToggle ... />` button rendered in the viewer toolbar (the top-left pill).
- Delete the `debugSupport` state (`useState(false)`) and stop passing `debugSupport` / `supportRatios` props to `<Container3DView>`.
- Delete the `SupportDebugToggle` component definition at the bottom of the file.

**`src/components/freight/container-3d-view.tsx`**
- Drop the `debugSupport` and `supportRatios` props from `Container3DView` and from the inner `Scene` + `CargoBox` components.
- Remove the translucent shell mesh inside `CargoBox` that renders the support-ratio color coding (the `{debugSupport && <mesh>...</mesh>}` block).

### What stays untouched (intentional)

- `pack.supportRatios` on `AdvancedPackResult` and the packer logic in `packing-advanced.ts` — they're still used by the user-facing "Stacking reduced" warnings in the calculator and by the regression tests. Only the visual overlay is removed.
- `nearCeilingPlacedIdxs` overlay and other 3D viewer toggles — unaffected.
- Forklift removal from prior turn — unaffected.

### Risk

Very low. The toggle is a leaf UI element with one consumer (the 3D viewer). No type changes, no data-flow changes, no impact on packer output, PDF, video recording, or compliance checks.

### Files touched

- `src/components/freight/container-load-view.tsx`
- `src/components/freight/container-3d-view.tsx`
