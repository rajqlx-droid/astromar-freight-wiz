# Fit a 12th row by using 100% of the door gap (1000 mm cubes in 40HC)

## Audit recap (no bug in the packer)

Container 40HC inner length = **12,032 mm**. Current door reserve = **100 mm** (`src/lib/freight/gap-rules.ts`). Usable length today = **11,932 mm** → `floor(11,932 / 1,000) = 11` rows. The 932 mm wedge at the door end + the 100 mm door reserve = **1,032 mm of free length** — enough for a 12th 1000 mm row if the door gap is consumed.

## Decision: use 100% of the door gap

Per user instruction, allow cargo to occupy the door reserve when it unlocks an extra row. This reclaims the wedge in the screenshot and places the 10 unloaded pieces (10.00 m³) into a flush 12th row at the door wall.

## Implementation

### 1. Packer change (`src/lib/freight/packing-advanced.ts`)
- Replace `usableLengthMm = C.l - DOOR_RESERVE_MM` with `usableLengthMm = C.l` for the row-fit decision.
- Update the door-end guard at line 438 (`C.l - (x + l) < DOOR_RESERVE_MM - 1`) to allow `x + l ≤ C.l`.
- Tag boxes whose `x + l > C.l - DOOR_RESERVE_MM` with `placedInDoorGap = true` so the AUDIT chip + 3D label can flag them.
- Dev-only console line (`import.meta.env.DEV`):
  `[pack] inner=12032 door=100 usable=12032 rowDepth=1000 rows=12 slack=32 doorGapUsed=true`

### 2. Validator (`src/lib/freight/geometry-validator.ts`)
- Downgrade `DOOR_GAP` from a hard violation to an informational note (or skip the check) — door-gap occupancy is now an opt-in feature, not an error.

### 3. AUDIT chip (`src/components/freight/container-load-view.tsx`)
Add a length-budget line, computed live from the active pack:

```
Length budget — 12 rows × 1000 mm = 12,000 mm of 12,032 mm inner.
                32 mm slack. Door reserve consumed (100% door gap used).
```

Fall back to the standard `inner − 100 mm door reserve` line when no door-gap use is needed.

### 4. Door-end label in 3D (`src/components/freight/container-3d-view.tsx`)
When any placed box has `placedInDoorGap`, render a small chip at the door end: "Door gap used — 100%". Visible only when `showDimensions` is on.

### 5. Tests (`src/lib/freight/packing-advanced.accuracy.test.ts`)
- Remove the `DOOR_GAP` group from `assertAccurate` (no longer a violation).
- Keep `OVERLAP`, `FLOATING`, `CEILING_GAP` strict.
- Add a new test: 12 × 1000 mm cubes in 40HC → expect 12 rows fit (was 11).

## Files
- `src/lib/freight/packing-advanced.ts`
- `src/lib/freight/geometry-validator.ts`
- `src/lib/freight/packing-advanced.accuracy.test.ts`
- `src/components/freight/container-load-view.tsx`
- `src/components/freight/container-3d-view.tsx`

## Out of scope
- Ceiling reserve (still enforced — crossbeam clearance).
- Lateral / side-wall gaps (already 0 — flush to walls).
- Non-door-end packer logic (unchanged).
