
# Use only the inner length up to the door (no door-gap reclaim)

## User clarification

Previous plan proposed reclaiming the 100 mm `DOOR_RESERVE_MM` to fit a 12th 1000 mm row. User now says: **only the inner dimension up to the door may be used.** That means the door reserve stays mandatory and 11 rows (of 1000 mm cargo) is the correct, final answer for a 40HC. The wedge of 932 mm + the 100 mm reserve at the door end is intentional and must remain empty.

## What this changes vs. the previous plan

- **Drop** all packer changes that consumed the door reserve.
- **Drop** the validator downgrade — `DOOR_GAP` stays a hard violation.
- **Drop** the new "12 rows fit" accuracy test — keep the existing 11-row behaviour.
- **Keep** the diagnostics so the user can see exactly why the 12th row cannot fit.

## Implementation

### 1. Packer (`src/lib/freight/packing-advanced.ts`)
- No behaviour change. `usableLengthMm = C.l - DOOR_RESERVE_MM` stays.
- Add a dev-only console log (gated by `import.meta.env.DEV`) at the start of each pack:
  `[pack] inner=12032 door=100 usable=11932 rowDepth=1000 rows=11 slack=932`
  This is purely informational and runs once per pack call.

### 2. Validator (`src/lib/freight/geometry-validator.ts`)
- No change. `DOOR_GAP` remains a hard violation — boxes are not allowed within the 100 mm door reserve.

### 3. AUDIT panel chip (`src/components/freight/container-load-view.tsx`)
Add a "Length budget" chip computed from the active pack and active container:

```
Length budget — 11 rows × 1000 mm = 11,000 mm of 11,932 mm usable
                (12,032 mm inner − 100 mm door reserve).
                932 mm slack at door end. A 12th row needs 1000 mm.
```

When all rows fit perfectly (zero slack, e.g. odd cargo sizes that divide evenly), show the simpler form without the trailing sentence.

### 4. Door-end label in 3D (`src/components/freight/container-3d-view.tsx`)
At the door end of the container, render a small chip (only when `showDimensions` is on) showing the slack and the door reserve:

```
Door reserve 100 mm · slack 932 mm
```

No box ever overlaps the reserve, so this is a static label tied to the container preset and the deepest placed-box X.

### 5. Tests (`src/lib/freight/packing-advanced.accuracy.test.ts`)
- No change. `DOOR_GAP` stays in the strict-violation group.
- The existing 11-row behaviour for 1000 mm cubes in 40HC is the correct expectation.

## Files
- `src/lib/freight/packing-advanced.ts` — dev-only log line
- `src/components/freight/container-load-view.tsx` — Length budget chip
- `src/components/freight/container-3d-view.tsx` — door-end slack label

## Out of scope
- Door-gap reclaim (rejected — contradicts the spec).
- Ceiling reserve, side-wall gaps, neighbour gaps (unchanged).
- Packer algorithm (unchanged).
