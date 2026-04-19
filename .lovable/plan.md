

## Goal
Wire the loading-guide video to the user's **actual current scenario** from the Container Load Optimizer, and offer a **40s detailed version** with no download-speed penalty.

## Download speed answer (short)
File size for 1080p H.264 @ 30fps:
- 25s standard ≈ **7 MB** (~1s download on broadband)
- 40s detailed ≈ **11–13 MB** (~1.5–2s download)

That's a negligible difference — the bottleneck is **render time in the sandbox** (10-min cap), not download. We do NOT need to speed up frames or drop quality. I'll render the 40s version at native 30fps with full detail.

## What I'll build

### Part A — Wire to current scenario (the real ask)
1. **Snapshot button** in `container-load-view.tsx`: "🎬 Generate loading video" — serializes the current `PackResult` + container dims + boxes to JSON.
2. **Bridge file** `remotion/public/scenario.json` — written when the button is clicked (via a download-then-instructions flow, since the browser can't write to the sandbox repo directly). For automation in the sandbox, I'll add a small node script `remotion/scripts/snapshot-from-app.mjs` that reads a posted JSON or a fixture.
3. **Refactor** `remotion/src/scenario.ts` → `scenario-loader.ts`:
   - Reads `staticFile('scenario.json')` via Remotion's `calculateMetadata()` so duration auto-scales to row count.
   - Falls back to the hard-coded demo scenario if `scenario.json` is missing.
   - Maps the app's `PackResult.placedBoxes` → Remotion `Box[]` (same coordinate system already).

### Part B — 40s detailed version
Extend `LoadingGuide.tsx` timing:
- Intro 90f → **120f** (slower 360° orbit, dims call-out)
- Rules 90f → **90f** (unchanged)
- Per-row 96f → **150f** with added **per-row 360° micro-orbit** in the last 40 frames
- New **COG explainer scene** (90f) — shows weight-weighted centroid as a glowing marker sliding into position with target safe-zone band
- New **Dunnage close-up scene** (60f) — zooms into the gap on row 4, adds animated dunnage block sliding in
- Door close 60f → **75f**
- Outro 30f → **45f**
- **Total: ~1200f = 40s @ 30fps** (no frame-rate tricks, no quality loss)

### Part C — Render
- Re-run `node scripts/render-remotion.mjs` → `/mnt/documents/loading-guide-v2.mp4`
- QA via ffmpeg frame extraction at 6 timestamps
- Keep v1 (`loading-guide.mp4`) untouched as the 25s baseline

## Files to touch
- `remotion/src/scenario.ts` → split into `scenario-demo.ts` + `scenario-loader.ts`
- `remotion/src/LoadingGuide.tsx` → extended timing + 2 new scenes (COG, Dunnage)
- `remotion/src/Root.tsx` → use `calculateMetadata` for dynamic duration
- `remotion/scripts/render-remotion.mjs` → output `/mnt/documents/loading-guide-v2.mp4`
- `remotion/public/scenario.json` → fixture (mirrors current optimizer state when button is wired)
- `src/components/freight/container-load-view.tsx` → add "Generate loading video" button that downloads `scenario.json` (user drops it into `remotion/public/` to re-render with their exact pack)

## Honest caveat
Browser → sandbox-filesystem in one click is not directly possible. The button will:
1. Download `scenario.json` to the user's machine, AND
2. Trigger a follow-up message with the JSON contents inlined so I can write it to `remotion/public/scenario.json` and re-render.

For this turn, I'll render the 40s detailed video using the **demo scenario** so you have something concrete to watch immediately, and ship the snapshot button so future renders are scenario-specific.

