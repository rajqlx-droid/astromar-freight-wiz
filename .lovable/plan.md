## Goal

1. **Delete the 2D view** and the **Loading Video** feature from the calculator UI.
2. Make the **3D viewer the single source of truth**, rendering cargo at full size (no `0.99` shrink), with crisp edge outlines so individual packages stay distinguishable while staying physically accurate.
3. Lock in **zero-overlap, zero-floating, zero door/ceiling-violation** behaviour with new automated tests run across realistic mixed manifests.

## What changes in the UI (`src/components/freight/container-load-view.tsx`)

- Remove the `2D / 3D` pill toggle and the `is3D` state — the viewer always renders 3D.
- Remove the `<LoadingVideoButton />` import and JSX block, plus the `ensure3DReady` plumbing.
- Drop the `IsoContainer` + `IsoBox` + `shade` SVG fallback (lines 758–927) — no longer reachable.
- Simplify the right-hand control cluster to: collapse/expand toggle only.
- The "step mode" loader walkthrough (Play/Pause/Prev/Next/Reset HUD) stays — it runs entirely inside the 3D scene and is what visualises the loading order.
- Remove the `optimizationDisabledReason` branches that were specific to "disable 3D toggle" and "disable Loading Video" — keep the prop only as a soft banner if it's still used elsewhere; otherwise drop it.

## What changes in the 3D viewer (`src/components/freight/container-3d-view.tsx`)

- **Render at true scale.** Change the `<group … scale={scale * 0.99}>` (line 1256) back to `scale={scale}`. The current 1 % shrink fakes a visible seam by misrepresenting the carton size — that's the opposite of "100% accuracy". Cargo will sit physically flush, exactly as the packer placed it.
- **Keep the seam visible the honest way:** raise the edge-outline threshold so every box always shows a 1-pixel dark outline regardless of count. Replace `pack.placed.length <= 200` (line 590) with `true`. The `<Edges scale={0.999}>` wrapper inside each shape (already present) gives a crisp seam without changing geometry — that's the correct, non-deceptive way to separate touching cartons in 3D.
- **Strip the recording API.** Delete `beginRecording`, `endRecording`, `applyFrame`, `setRenderSize`, `restoreRenderSize`, the `recordingTimeline` / `currentFrame` state, and the `import { buildTimeline, … } from "@/lib/freight/loading-video"`. Keep `captureAngles` (PDF export still uses it) and `getCanvas`/`render`.
- Update the `Container3DHandle` interface accordingly.

## Files deleted

- `src/components/freight/loading-video-button.tsx`
- `src/lib/freight/loading-video.ts`

(Then `rg "loading-video"` should return zero hits across `src/`.)

## Accuracy hardening (already mostly in place — pin it with tests)

The packer + validator pipeline already enforces:
- `wouldBeLegal` airlock with strict 0.5 mm overlap rejection (`packing-advanced.ts`)
- `validateAdvancedPack` flags `OVERLAP`, `FLOATING`, `DOOR_GAP`, `CEILING_GAP` (`geometry-validator.ts`)
- Tight-fit gap rules (`gap-rules.ts`)
- CoG-aware spread mode for low-fill loads

We add a single comprehensive test suite, `src/lib/freight/packing-advanced.accuracy.test.ts`, that runs `packContainerAdvanced` + `validateAdvancedPack` across realistic manifests and asserts **`audit.allLegal === true`** plus zero `OVERLAP` / `FLOATING` / `DOOR_GAP` / `CEILING_GAP` violations for each:

| Scenario | Container | Cargo |
|---|---|---|
| Single SKU, dense | 40HC | 41 × 1067 mm cubes |
| Single SKU, light | 40HC | 6 × 1 m cubes (spread mode) |
| Mixed cartons | 20GP | 30 × 80 cm + 20 × 110 cm |
| Pallets | 40HC | 16 × Euro pallets 1200×800×1500 |
| Tall cargo | 40HC | 8 × 100×100×260 cartons (ceiling-near) |
| Heavy + light mix | 40GP | 10 × 600 kg drums + 30 × 20 kg cartons |

For each scenario the test also asserts:
- `pack.placed.length === pack.placedCartons` (no orphan rows)
- Every box has `b.z === 0` **or** sits on a supporter whose top face equals `b.z` within 2 mm (no floating)
- Pairwise AABB intersection volume ≤ 0.5 mm in every axis (no overlap)

## Implementation steps

1. Delete `loading-video-button.tsx` and `loading-video.ts`.
2. Edit `container-3d-view.tsx`: remove video imports, recording API, and the `0.99` shrink; force `showEdges = true`.
3. Edit `container-load-view.tsx`: remove 2D toggle, Loading Video button, IsoContainer fallback, related imports/state/props.
4. Update `Container3DHandle` consumers (only `container-load-view.tsx` and any PDF export path that calls `captureAngles` — that one stays untouched).
5. Add `packing-advanced.accuracy.test.ts` with the table above.
6. Run `bunx vitest run` — all existing 50/51 plus the new accuracy suite must pass. The previously failing CoG-spread test (longitudinal CoG ±25 %) gets revisited as part of the new accuracy run; if it still fails for the borderline 6-cube scenario, tighten the spread-mode score in `packing-advanced.ts` (lower the activation gate from `< 0.65` volume fill to `< 0.55` and bias `targetX` more aggressively toward container centre) and re-run.

## Acceptance check after implementation

- Calculator UI shows only the 3D viewer — no `2D` button, no "Loading Video" button.
- Hit "Optimize loading" with 41 × 1067 mm cubes in a 40HC: cargo renders at true size, every cube has a visible dark edge outline so individual packages are clear, no carton intersects another or floats, HUD audit reports `OK`.
- Hit "Optimize loading" with 6 × 1 m cubes in a 40HC: cargo distributes along ≥ 50 % of the container length, longitudinal CoG within ±25 %, audit clean.
- `bunx vitest run` — all packing/geometry/regression/accuracy suites green, no references to `loading-video` anywhere in `src/`.
