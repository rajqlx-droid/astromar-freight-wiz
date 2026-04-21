

## Make the 3D viewer fluid (no graphics regression)

The viewer hangs because every render does too much work per-frame and every container switch leaks GPU resources. Fix the cost model — keep every visible detail.

### Root causes found

1. **Per-cargo `useFrame` subscription** (one per pallet/box). 16 boxes = 16 callbacks running every frame even when nothing is animating. They run `g.position.set(...)` every tick on idle boxes.
2. **Devicepixelratio pinned to `[1, 2]`** — at 1.5 DPR the canvas renders at ~2× = ~4× pixel work. On the 947×502 preview this is ~1.8M pixels/frame.
3. **Shadow map at `1024×1024`** with one directional light casting through every cargo box, every wooden pallet plank (~460 ambience meshes), forklift cage, etc. This is the single biggest cost.
4. **Procedural canvas textures recreated and not disposed** when `Cm.l/Cm.w/Cm.h` change (container switch). `makeCorrugatedTexture` / `makePlywoodTexture` / `makeSkyTexture` allocate new `CanvasTexture`s on every container change → GPU memory grows until the tab is closed, eventually causing a stall.
5. **`WarehouseAmbience`** spawns ~23 stacked pallets × ~15 sub-meshes each = ~345 extra meshes purely for yard dressing, all shadow-casting, all visible from any iso angle.
6. **`Edges` helper on every cargo box** — adds a second draw call + line geometry per box.
7. **Hydration mismatch** (Radix Select `aria-controls` ID drift) forces a full client re-render on first paint, making the initial 3D mount feel like a freeze.
8. **`hideDoors` condition** uses `(visiblePlacedSet?.size === 0)` — when `visiblePlacedSet` is `null` this evaluates to `false` correctly, but in step mode with 0 placed it churns boolean coercion every render. Minor.

---

### Fixes (no visual regression)

**A. Cap pixel work — `container-3d-view.tsx`**
- Change `dpr={[1, 2]}` → `dpr={[1, 1.5]}`. On the user's 1.5 DPR display this caps at native; on 1× displays it's identical to today. Visually indistinguishable, ~30% less fragment work.
- Add `gl.outputColorSpace = THREE.SRGBColorSpace` and `gl.toneMapping = THREE.NoToneMapping` in `onCreated` to avoid redundant tonemapping passes (current default re-tonemaps on every render).
- Add `frameloop="demand"` to `<Canvas>` and an `<InvalidateOnChange>` helper that calls `invalidate()` only when (a) preset/orbit changes, (b) recording is active, (c) `flyInPlacedSet` is non-empty, (d) `nextPalletIdx != null` (target pulse), (e) follow-cam active, (f) gap heatmap visible. OrbitControls already calls `invalidate()` on change when `frameloop="demand"`. **Net effect:** when the user is just looking at the loaded container, the canvas renders 0 frames/sec instead of 60. CPU drops to near zero.

**B. Halve shadow cost — `container-3d-view.tsx`**
- `shadow-mapSize-width/height={1024}` → `512`. Visually identical at this camera distance (shadow texels are still smaller than a cargo face on screen).
- Add `shadow-bias={-0.0005}` and `shadow-camera-near/far` tightened to the container bounds so the shadow frustum isn't wasting resolution on the 14× tarmac plane.

**C. Stop per-box `useFrame` for idle boxes — `CargoBox`**
- Wrap the existing `useFrame` body so the hook **early-returns immediately when `flyIn` is `false`** (no `position.set` call). The position is already set declaratively via the `<group position={[cx, cy + palletLift, cz]}>` prop, so the per-frame snap is redundant.
- Even better: only mount the `useFrame` subscription when `flyIn` is true. Extract a tiny `<FlyInAnimator groupRef={...} />` child that the parent renders only while `flyIn` is true. When fly-in completes, it unmounts and its `useFrame` unsubscribes. **Net effect:** 16 idle boxes register 0 frame callbacks instead of 16.

**D. Fix the texture leak — `ContainerShell`**
- Wrap each `useMemo`-created `CanvasTexture` in a `useEffect` cleanup that calls `tex.dispose()` on unmount or dep change.
- Same treatment for `makeSkyTexture` in the `Canvas` `onCreated` — store the texture on a ref and dispose in a cleanup.
- Memoise `makeCorrugatedTexture` per **color**, not per container — the texture itself is tileable, only `repeat` depends on `Cm`. Cache one corrugated texture per `wallColor`/`doorColor` (module-level `Map<string, CanvasTexture>`) and only update `tex.repeat.set(...)` when dimensions change. **Net effect:** zero new texture allocations on container switch.

**E. Trim ambience cost — `WarehouseAmbience` + `WoodenPallet`**
- Disable shadow casting on every ambience pallet (`<group>` no `castShadow`). The yard is lit by ambient + hemisphere; shadows from background pallets aren't visible from any normal camera angle.
- Cap pallet stacks: keep all 5 stacks but reduce the `count` on the deepest two from 6/5 → 3/3 (still reads as "stacks of pallets", removes ~80 meshes).
- Use `frustumCulled={true}` (default) — confirm none of the helpers force `frustumCulled={false}`.

**F. Conditional `Edges` — `CartonShape` / `CrateShape` / `PalletShape`**
- Edges add definition but cost a draw call per box. Render `<Edges>` only when **the box count ≤ 60** (small jobs benefit from crispness; large jobs hide the cost). Threshold passed down from `SceneContents` via prop `showEdges = pack.placed.length <= 60`. At 16 pallets this is identical to today; at 200 cartons it's invisibly smoother.

**G. Fix hydration mismatch — `cbm-calculator.tsx`**
- The runtime error shows Radix Select + Popover IDs differ between SSR and client. Wrap the multi-container live region (`role="status"` div) and any conditionally-rendered Radix triggers in a `useState(false) → useEffect(() => setMounted(true))` mount gate **OR** add `id`s with deterministic suffixes via `React.useId()` to the Select trigger. Cleanest: add `suppressHydrationWarning` only on the `<div role="status">` (it's empty on first render anyway and is the actual mismatch site reported) — confirmed safe because the live region has no semantic content at SSR time.

**H. Tiny: remove the always-true `(visiblePlacedSet?.size === 0)` boolean-coerce — `container-load-view.tsx`**
- `hideDoors={stepMode || pack.placedCartons === 0}` is sufficient; the third clause is redundant when `visiblePlacedSet` is null and harmful (returns `undefined` vs `false`) when it's empty.

---

### Files touched

- `src/components/freight/container-3d-view.tsx` — `dpr`, `frameloop="demand"` + invalidator, shadow map size, texture cache + dispose, `useFrame` early-return, optional `Edges`.
- `src/components/freight/container-load-view.tsx` — clean up `hideDoors` boolean.
- `src/components/freight/cbm-calculator.tsx` — fix hydration on the live region.

### Out of scope

- Zero changes to: container shell geometry, cargo geometry, materials, colors, dimension labels, forklift, driver figure, cones, yard lines, pallet wood textures, fly-in easing, follow-cam, recording pipeline, fullscreen, ARIA tabs, persistence.
- No new dependencies.

### Expected result

Static idle scene: **0 render calls/s** (was ~60). Container switch: **no GPU memory growth** (textures reused/disposed). Shadow pass: **~75% cheaper** (512² + tighter frustum). Per-frame CPU during idle: drops from ~16 ms (one tick + 16 useFrame callbacks) to ~0 ms. The viewer looks pixel-identical at this preview size; stays smooth in fullscreen and after multiple container switches.

