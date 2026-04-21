

## Accessibility & persistence upgrades for multi-container selection

Four cohesive enhancements layered on top of the existing multi-container tab system: skip links, full ARIA tabs pattern, persistence, and live announcements.

---

### Part A — Skip-to-content + skip-to-viewer links

Two visually-hidden links that become visible on keyboard focus, letting users bypass the header/nav and jump straight to content or the 3D viewer.

**`src/routes/freight-intelligence.tsx`**
- Add two `<a>` elements at the very top of the layout (before the header):
  - `Skip to main content` → `href="#main-content"`
  - `Skip to 3D container viewer` → `href="#container-load-viewer"`
- Style: `sr-only focus:not-sr-only` with positioned focus state (`fixed top-2 left-2 z-[100]`), navy pill, white text, ring on focus.
- Add `id="main-content"` and `tabIndex={-1}` to the main content wrapper so the browser focuses it after the skip jump.
- The viewer skip target already exists (`id="container-load-viewer"` is set on the `Card` in `container-load-view.tsx`); add `tabIndex={-1}` there so it can receive programmatic focus when jumped to.

---

### Part B — Full WAI-ARIA tabs pattern for container buckets

Upgrade the existing `role="tablist"` / `role="tab"` implementation to the complete pattern.

**`src/components/freight/container-suggestion.tsx`**
- Add `aria-orientation="horizontal"` to the tablist container.
- Add `aria-roledescription="container bucket"` on each tab so AT users hear "Container 1, container bucket, selected" instead of just "tab".
- Roving tabindex is already implemented (active = 0, others = -1) — keep as is, but extract the keyboard handler into a stable `handleTabKeyDown(i, e)` helper for clarity.
- Add a hidden `<div role="tabpanel" id="container-bucket-panel-{i}" aria-labelledby="container-bucket-tab-{i}">` reference target inside the viewer Card, so each tab's `aria-controls` points to a real panel element (currently it points to the viewer Card id, which isn't a tabpanel role). Cleaner approach: in `container-load-view.tsx`, add `role="region"` + `aria-labelledby={\`container-bucket-tab-${activeUnitIdx}\`}` to the viewer Card so every selected tab "owns" the viewer region. Each tab's `aria-controls="container-load-viewer"` then resolves correctly.
- Add `aria-owns="container-load-viewer"` on the tablist so AT trees connect the buckets to the off-DOM-adjacent viewer below.

---

### Part C — Persist last-selected bucket across refresh and tab switching

**`src/components/freight/cbm-calculator.tsx`**
- New helper inside the component: read/write `localStorage["freight.activeUnitIdx"]` (number).
- Initialize `useState` with a lazy reader that returns the persisted index, clamped to `recommendation.units.length - 1`.
- Persist on every `setActiveUnitIdx` change via `useEffect`.
- Reset-to-0 effect (`recommendation.isMulti` / `units.length` change) only fires when the persisted index is out of range — so refreshing on a multi-container result keeps your last-viewed bucket selected.
- Storage key namespaced under `freight.` to match existing storage patterns (see `src/lib/freight/storage.ts`).

---

### Part D — ARIA live region for active bucket changes

**`src/components/freight/cbm-calculator.tsx`**
- Add a single visually-hidden `<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">` near the bottom of the calculator render.
- Drive its text content from a `useEffect` watching `activeUnitIdx` + `recommendation.units`:
  - Multi-container, on change: `"Now viewing container ${idx+1} of ${total}: ${name}, ${placed} of ${totalPieces} placed."`
  - Skip the announcement on first mount (use a ref guard) so users aren't bombarded on page load.
  - Clear the message ~2s after each change so the same message can be re-announced if the user clicks the same card again.

---

### Files touched

- `src/routes/freight-intelligence.tsx` — skip links + `id="main-content"` target.
- `src/components/freight/container-load-view.tsx` — `tabIndex={-1}`, `role="region"`, `aria-labelledby` on the viewer Card.
- `src/components/freight/container-suggestion.tsx` — `aria-orientation`, `aria-roledescription`, `aria-owns`, extracted keyboard helper.
- `src/components/freight/cbm-calculator.tsx` — localStorage persistence for `activeUnitIdx`, live-region announcer.

### Out of scope

- No changes to packer, recommender, 3D viewer internals, loader HUD, or single-container mode.
- No new dependencies; everything uses existing Tailwind utilities and browser APIs.
- Air calculator and other tabs untouched.

### Expected result

A keyboard user landing on `/freight-intelligence` can press Tab once to reveal "Skip to main content" and "Skip to 3D container viewer" links. Tabbing into the multi-container recommendation banner exposes a proper ARIA tablist where arrow keys move focus, Enter/Space activates a bucket, and a screen reader announces "Now viewing container 2 of 3: 40ft HC, 24 of 24 placed". Refreshing the page keeps the last-selected bucket active instead of snapping back to #1.

