

## Goal
Generate an MP4 video that teaches a loader, in true 3D, how to pack the container row-by-row using the **same rules** the app's 3D viewer follows: back-wall-first columns, heavy-on-bottom, fragile near the door, non-stackables on the floor, gap awareness, and tilted/turned rotation hints.

## Video structure (~25s @ 30fps, 1920×1080)

1. **Intro (0–3s)** — Title "How to load your container", container dims, total cartons, ETA. Empty wireframe container does a slow 360° orbit so the loader sees length × width × height.
2. **Rules recap (3–6s)** — Four icon cards: Heavy ↓ Bottom · Back wall first · Fragile near door · No-stack stays on floor.
3. **Row-by-row load (6–22s)** — One mini-scene per row from `buildRows()`:
   - Camera arcs iso → side → top-down → iso so you see all 3 dimensions of that row.
   - Boxes drop in with stagger: bottom layer first, then stacked layers.
   - Side caption: `Row N of M · X cartons · Y kg · against {back wall | row N-1}`.
   - Tilted/turned boxes flash a hazard band + "ROTATE H↔L" overlay.
   - Rows with a gap warning pulse a red heatmap on the void + caption "Add dunnage here".
4. **Door close (22–24s)** — Camera pulls back, doors swing shut, seal applied.
5. **Outro (24–25s)** — Summary: utilization %, total weight, COG offset, "Match this in the trailer."

## Approach
Build a Remotion project under `remotion/` (per the Remotion skill: musl compositor fix, ffmpeg symlinks, programmatic render script with `chromeMode: "chrome-for-testing"` and `muted: true`).

3D scene uses `@react-three/fiber` + `three` inside Remotion, with the camera driven by `useCurrentFrame()` + `interpolate()` (no OrbitControls — every frame is deterministic).

To guarantee the video matches the app's logic, the Remotion scene **imports the existing packing math directly**: `packAdvanced` and `buildRows` from `src/lib/freight/`. Same boxes, same positions, same row order as the in-app viewer.

## Visual direction
- Palette: cargo teal `#14b8a6`, dark slate bg `#0f172a`, amber `#f59e0b` for fragile/hazard, red `#ef4444` for gaps, off-white `#f5f5f4` text.
- Typography: **Space Grotesk** (display) + **Inter** (body) via `@remotion/google-fonts`.
- Motion system: spring entrance for boxes (`damping: 18, stiffness: 180`), smooth ease for camera, snappy fade for captions. One transition style between scenes (`fade`).

## Output
- `/mnt/documents/loading-guide.mp4`
- All Remotion source committed under `remotion/` so the video can be re-rendered/iterated later.

## Three quick choices before I build

**1. Scenario source**
- (A) **Use my current scenario** — I add a "Generate loading video" button to the Container Load Optimizer that snapshots the current pack + container into `remotion/public/scenario.json`, then renders. Video matches exactly what you just packed.
- (B) **Generic demo** — Hard-coded 20ft GP + mixed cartons + 1 fragile pallet. No app changes, faster.
- (C) **Both** — Render generic demo this turn, wire up the per-scenario button in a follow-up.

**2. Length / detail**
- Quick (~15s, montage), **Standard (~25s, recommended)**, or Detailed (~40s with per-row 360° orbit, COG explainer, dunnage close-ups).

**3. Voiceover**
- Captions only (no audio, smaller file), or ElevenLabs narration (needs ElevenLabs API key in the project).

Reply with your picks (e.g. "A, Standard, captions only") and I'll build and render.

