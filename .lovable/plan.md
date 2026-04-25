# Restore fly-in loading animation + gate the 3D view behind the optimiser

Three connected fixes for the Container Load Optimiser:

1. **Cargo flies in and fits into place** during the row walkthrough (the animation code still exists in `CargoBox` but `flyIn` is hard-wired off, so the scene currently appears fully loaded from frame 1).
2. **Defer the 3D scene until packing finishes**. Today, clicking *Optimize loading* shows the full container immediately because we render `Container3DView` with an empty pack while the Web Worker is still computing. Replace that with a compact "Computing optimal fit…" loader and mount the 3D view only once the worker returns the first real pack.
3. **Remove the unused 🚜 forklift toggle and tractor icon** from the HUD (already non-functional — `showForklift={false}` and `onToggleForklift={() => {}}`).

## What changes (technical)

### A. Re-enable per-pallet fly-in

`src/components/freight/container-load-view.tsx` (`SinglePlanBody`)

- Track which placed-box indices belong to the **current** pallet step:
  ```
  const flyInIdxs = useMemo(() => new Set(currentStep?.placedIdxs ?? []), [currentStep]);
  ```
  (The existing `PalletStep` type already exposes the indices of boxes loaded in that step — confirmed in `loading-rows.ts`.)
- Bump a numeric `flyInKey` every time `palletIdx` changes so `CargoBox` re-triggers the ease-out cubic.
- Pass `flyInIdxs` + `flyInKey` to `Container3DView` via two new (optional) props.

`src/components/freight/container-3d-view.tsx`

- Add `flyInIdxs?: ReadonlySet<number>` and `flyInKey?: number` props on `Container3DView` and `SceneContents`.
- In the `pack.placed.map(...)` block, pass `flyIn={flyInIdxs?.has(i) ?? false}` and `flyInKey={flyInKey}` to each `<CargoBox>` (the prop already exists, lines 946–947).
- Make sure `InvalidateOnChange` is set to `animate={true}` while any box is mid-flight so the demand-driven canvas keeps ticking. Simplest: pass `animate={!!flyInIdxs && flyInIdxs.size > 0}`.
- Keep the ground-truth invariant intact: the **resting** position is still the exact packed coordinate, so once the 600 ms ease finishes the box snaps to its validated slot — no overlap, no float.

Verification: the existing accuracy suite (`packing-advanced.accuracy.test.ts`) keeps protecting the resting geometry. Animation only affects transient transform; resting `position` is unchanged.

### B. Gate the 3D viewer until packing finishes

`src/components/freight/container-load-view.tsx`

- We already compute `isCalculating = worker.pending && activePack.placed.length === 0 && hasCargo`.
- In `SinglePlanBody` (or just before passing the pack to `Container3DView`), branch on it:
  - `isCalculating` → render a compact full-width card with a spinner and the message **"Computing optimal fit… preparing 3D view"**, keep the height (`h-[420px]`) so layout doesn't jump.
  - Otherwise → render `Container3DView` exactly as today.
- The `LoadReportPanel`, `LoadingSequence`, `LoadingRowsPanel` etc. should also show a slim "Calculating…" skeleton or be hidden until the first pack arrives, to avoid showing stale "0 of N loaded" rows.
- Plumb `isCalculating` from `ContainerLoadView` down to `SinglePlanBody` as a prop.

This means after clicking *Optimize loading*:
1. Worker spins up → user sees the spinner placeholder (NOT the empty container).
2. First valid pack returns → 3D scene mounts, doors open, walkthrough is ready.
3. User presses ▶ on the HUD → cargo flies in row-by-row.

### C. Remove the forklift toggle

`src/components/freight/loader-hud.tsx`

- Delete the 🚜 `<button>` block (lines ~319–333) and the divider above it.
- Remove `showForklift` and `onToggleForklift` from the `Props` interface and the function signature.

`src/components/freight/container-load-view.tsx`

- Drop the `showForklift={false}` and `onToggleForklift={() => {}}` props passed to `<LoaderHUD>`.

No other files reference these props (verified via `rg`).

## Out of scope

- The packer logic itself stays untouched — this is a pure rendering/UX change.
- No changes to the PDF capture path; snapshots still happen against the resting geometry.

After approval I will implement the three changes, run `tsc --noEmit`, and re-run the accuracy test suite to confirm the resting pack is unchanged.