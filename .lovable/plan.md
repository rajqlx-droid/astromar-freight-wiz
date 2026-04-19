

## Consolidated plan — fix floating cargo + add sideways/orientation flags

Yes, this combines both: the **support-aware skyline packer fix** AND the **new per-item rotation flags** for better optimization.

### 1. New per-item input flags
Add to `CbmItem` in `src/lib/freight/types.ts`:
- `allowSidewaysRotation: boolean` — packer may swap L↔W (yaw 90° on the floor)
- `allowAxisRotation: boolean` — packer may tip box onto its side (swap H with L or W)

Existing `stackable` and `fragile` flags stay as-is.

### 2. UI — two new checkboxes per cargo row
In `src/components/freight/cbm-calculator.tsx`, next to existing "Stackable":
- ☐ Can lay sideways (rotate 90° on floor)
- ☐ Can stand on side (tip onto side — off by default, hidden if fragile)
Small info tooltips on each.

### 3. Packer rewrite — kills the floating pink box
Replace shelf-fit in both `src/lib/freight/packing-advanced.ts` and `src/lib/freight/packing.ts` with a **support-aware skyline packer**:

- **Skyline height-map** — quantise floor into ~100mm cells; track top Z per cell. New box's resting Z = `max(heightMap)` under its footprint. No more air gaps, no floating boxes.
- **Support check** — require ≥ 90% of footprint cells at the same top Z (≤ 10% overhang allowed for realism).
- **Multi-orientation evaluation** driven by the new flags:
  - Always: original L×W×H
  - If `allowSidewaysRotation`: + W×L×H
  - If `allowAxisRotation` AND not fragile: + L×H×W and H×W×L
- **Best-fit scoring** — for each carton, evaluate all allowed orientations × candidate (x, y); pick combo with: lowest resting Z → tightest to back-left → least wasted footprint.
- **Hard constraints**:
  - Non-stackable → resting Z = 0 (floor only)
  - Fragile → placed last on top; cells under it sealed
  - `maxStackWeightKg` → walk column under new box, reject if any supporter exceeds limit
  - Heavy items first toward back (low X) for COG stability

### 4. Auto-propagation
3D view, 2D top-down view, and loading video all consume `placed[]` coordinates → fix appears everywhere automatically. No changes needed in those files.

## Files touched
```text
EDIT  src/lib/freight/types.ts                   — add allowSidewaysRotation, allowAxisRotation
EDIT  src/components/freight/cbm-calculator.tsx  — two new checkboxes per cargo row
EDIT  src/lib/freight/packing-advanced.ts        — skyline packer + multi-orientation + constraints
EDIT  src/lib/freight/packing.ts                 — same skyline rule for basic mode
```

## Out of scope
- Per-axle weight distribution
- Wall-bracing / dunnage simulation
- Auto-detecting orientation flags from item dimensions

