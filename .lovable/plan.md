

## Combined plan: multi-container sync + 3D viewer cleanup

Three approved-but-not-yet-implemented refinements rolled into one pass.

---

### Part A — Sync 3D viewer tab with multi-container recommendation

When the recommender returns a multi-container split (e.g. 1 × 40HC + 1 × 20GP), each banner card becomes a clickable bucket that drives the 3D viewer tab.

**1. Lift `activeUnitIdx` state** (`src/components/freight/cbm-calculator.tsx`)
- New `useState(0)` in the calculator. Compute `unitStats` (placed/total per unit) via a shared `useMemo` reusing `splitItemsAcrossContainers` + `packContainerAdvanced`.
- Pass `activeUnitIdx` + `onActiveUnitChange` to both `ContainerSuggestion` and `ContainerLoadView`.

**2. Clickable banner cards** (`src/components/freight/container-suggestion.tsx`)
- New optional props: `activeUnitIdx`, `onUnitSelect`, `unitStats`.
- Wrap each unit card in a `<button>` when `onUnitSelect` exists; active card gets `ring-2 ring-brand-navy`.
- Append per-card pill: `{placed} / {total} placed` (emerald if equal, amber otherwise).
- Footer hint: *"Click a container above to inspect it in the 3D viewer below."*
- On click → `onUnitSelect(idx)` then smooth-scroll to `#container-load-viewer`.

**3. Controlled tab + badges** (`src/components/freight/container-load-view.tsx`)
- Accept optional `activeUnitIdx` / `onActiveUnitChange` props (fall back to internal state when uncontrolled).
- Add `id="container-load-viewer"` on the outer Card.
- Each `TabsTrigger` gets a small placed/total pill matching the banner color logic.

---

### Part B — Move Loader HUD to bottom of 3D viewer

The "READY · Container empty…" card overlaps the container interior at top-right.

**`src/components/freight/loader-hud.tsx`**
- Wrapper: `absolute right-2 top-44 w-[240px]` → `absolute bottom-2 left-1/2 -translate-x-1/2 max-w-[min(560px,90%)]`.
- Convert vertical stack (instruction card + playback bar) into a single horizontal pill: instruction text on the left, playback controls on the right, thin divider between.
- Empty state collapses to a one-liner ("Ready — press ▶ to load the first pallet"). Full instruction details only appear once stepping starts.

---

### Part C — Hide doors when container is empty

Open swing doors render as large dark/yellow slabs blocking the camera when there's nothing inside to look at.

**`src/components/freight/container-load-view.tsx`**
- Extend `hideDoors` prop on `Container3DView` from `stepMode` only to `stepMode || pack.placedCartons === 0 || (visiblePlacedSet?.size === 0)`.
- Net effect: empty/auto containers render as a clean open-front box; doors reappear the moment cargo is placed.

No changes to door geometry, dimension labels, camera presets, or cargo rendering.

---

### Files touched (consolidated)

- `src/components/freight/cbm-calculator.tsx` — lift `activeUnitIdx`, compute `unitStats`, scroll-to-viewer handler.
- `src/components/freight/container-suggestion.tsx` — clickable cards, active ring, placed badges.
- `src/components/freight/container-load-view.tsx` — controlled tab props, scroll-target id, tab placed badges, extended `hideDoors` condition.
- `src/components/freight/loader-hud.tsx` — relocate to bottom-center, horizontal pill layout, compact empty state.

### Out of scope

- No changes to packer, recommender, door geometry, camera, or cargo rendering.
- 2D fallback, single-pallet stepper, recording/video pipeline untouched.
- Air calculator and other tabs untouched.

### Expected result

Clicking a banner card jumps the viewer to that container with a clear active outline and placed-count badges on both card and tab. Empty 3D scenes show the full container interior unobstructed, with a slim instruction bar pinned to the bottom instead of a card overlapping the cargo area.

