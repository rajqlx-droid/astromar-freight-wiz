

## Restore side-by-side layout: Inputs left, Results right

The user reports the layout regressed — results currently stack below the inputs instead of sitting beside them as before. Restore the two-column layout in the CBM/container calculator.

---

### What changed

Somewhere in the recent multi-container / accessibility / perf passes the responsive grid on `cbm-calculator.tsx` got flattened (or a wrapper lost its `lg:grid-cols-2` / `xl:grid-cols-3` classes), so the items panel and the results/3D viewer now render in a single column on desktop.

### Fix

**`src/components/freight/cbm-calculator.tsx`**
- Restore the desktop two-column shell:
  - Left column (≈ 5/12 or 1/2 width on `lg+`): items entry, package list, controls.
  - Right column (≈ 7/12 or 1/2 width on `lg+`): results card, container suggestion banner, 3D viewer.
- Use the previous Tailwind pattern: a parent `grid grid-cols-1 lg:grid-cols-12 gap-6` with `lg:col-span-5` (inputs) and `lg:col-span-7` (results), or whichever split was in use before — match the prior ratio exactly.
- Keep mobile behaviour as a single stacked column (`grid-cols-1`) so phones still flow vertically.
- Ensure the multi-container suggestion banner, results card, and 3D viewer all live inside the right column so they sit beside the inputs, not below.

### Verify

- Inputs on the left, results + 3D viewer on the right at `lg` (≥1024px) and above.
- On the current 947px preview viewport (below `lg`), the single-column stack is expected and correct — confirm with the user whether they want the side-by-side breakpoint lowered to `md` (≥768px) so it shows side-by-side at the current preview width too.
- Skip links, ARIA tabs, persistence, live region, and 3D perf optimizations all remain intact — this is a layout-only fix.

### Files touched

- `src/components/freight/cbm-calculator.tsx` — restore the two-column grid wrapper.

### Out of scope

- No changes to packer, recommender, 3D viewer, ARIA logic, or persistence.
- No new dependencies.

