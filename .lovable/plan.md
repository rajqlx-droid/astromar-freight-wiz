

## Add geometry-aware fit check to container recommender

The current recommender only does CBM math. For your 16-pallet case (29 m³ in a 30 m³ "20ft GP") it says "fits" — but the 3D packer only places 4 because tall pallets can't stack inside 2.39 m of height. We need to ask the actual 3D packer "can you physically place every piece?" before declaring a container a fit.

### What "geometry skill" means here

Three real-world facts the recommender will now respect:

1. **Material nature** — stackable vs. non-stackable, max stack height, allowed rotations (already in `CbmItem` / `packing-advanced.ts`).
2. **Container inner dimensions** — true L × W × H (not just CBM), e.g. 20ft GP ≈ 5.90 × 2.35 × 2.39 m.
3. **Physical placement** — run `packContainerAdvanced(items, container)` and require `placedCartons === totalCartons`. CBM and weight remain as sanity gates.

### Plan

**1. Geometry-aware single fit** (`src/lib/freight/container-recommender.ts`)
- Rewrite `fitSingle(items, weightKg)` to iterate smallest → largest container and accept only when packer places **every** piece AND CBM ≤ usable AND weight ≤ payload.
- Pre-filter with CBM check so we only run the packer on plausible candidates (keeps it <50ms even for 200+ items).

**2. Geometry-aware multi-split** (`splitMulti`)
- Replace proportional CBM split with real simulation: pack into a 40HC, take un-placed pieces, recurse into the next container until everything is placed. Last container is the smallest preset that physically holds the leftover.

**3. New reason code**
- Add `"exceeds-single-geometry"` to `ContainerRecommendation["reason"]` for the "CBM fits but geometry doesn't" case (your exact scenario).
- `container-suggestion.tsx` shows: *"16 pallets won't physically fit in a 20ft GP — height/footprint caps real load at 4 pieces. Recommending 40ft HC."*

**4. Auto-pick in viewer** (`src/lib/freight/packing.ts` + `src/components/freight/container-load-view.tsx`)
- `pickOptimalContainer` becomes geometry-aware: signature changes to accept `items`, picks smallest container where the packer places every piece.
- `container-load-view.tsx` passes `items` when calling it (the "Auto" pill).

**5. Wire-through** (`src/components/freight/cbm-calculator.tsx`)
- Recommendation memo passes `items` (already available) into `recommendContainers`.

### Files touched

- `src/lib/freight/container-recommender.ts` — rewrite `fitSingle` + `splitMulti`, add reason code
- `src/lib/freight/packing.ts` — `pickOptimalContainer(items, weight)` geometry-aware
- `src/components/freight/container-load-view.tsx` — pass items to picker
- `src/components/freight/container-suggestion.tsx` — render new reason text
- `src/components/freight/cbm-calculator.tsx` — pass items to recommender

### Expected result for your 16-pallet test

Recommendation flips from **"1 × 20ft GP"** → **"1 × 40ft HC"** (or 40ft GP if it geometrically fits there), the auto-selected container in the 3D viewer matches, and all 16 pallets render placed. A clear reason badge explains the escalation.

### Out of scope

- No changes to packing algorithm itself (already correct — it's the recommender that was lying).
- No UI redesign beyond the reason-text update.
- Air calculator and other tabs untouched.

