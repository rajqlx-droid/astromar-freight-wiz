

## What's wrong today
- "Play all" = rows pop in every 1.5s. No context, no per-pallet guidance, no orientation cues. A loader watching this learns nothing they couldn't get from a static image.
- It "runs like a train" because every row reveals as a single block of N boxes simultaneously.
- Fragile / non-stack / rotated flags exist in data but the 3D never highlights them at the moment they matter.
- No camera movement to show *where on the floor* the loader stands or *which pallet enters next*.

## Goal
Turn the walkthrough into a **per-pallet, dock-loader's POV simulation** with on-screen instructions tied to each box as it enters — so a real loader can pause at any point and know exactly what to do next.

## What I'll build

### 1. Per-pallet sequencing (not per-row)
Inside each row, sort boxes back→front, left→right, bottom→top (the actual loader hand-order). Reveal one pallet at a time with a short fly-in (~350ms) plus a 250ms settle pause. So Row 3 with 8 pallets takes ~5s, not 1.5s. The viewer can *see* the build order.

### 2. Loader instruction overlay (HUD)
A persistent top-left card that updates per pallet:
- **Step X / Y** — "Pallet 3 of 24"
- **Item name + dimensions** — "Item 2 — 1200×800×1100 mm, 420 kg"
- **Action verb** — `PLACE` / `STACK ON` / `ROTATE 90° THEN PLACE` / `INSERT DUNNAGE` / `CAP WITH FRAGILE`
- **Position cue** — "Back wall, left corner, floor" or "On top of pallet 2, centred"
- **Warnings inline** — ⚠ FRAGILE — load last in this row · ⚠ NO-STACK — leave top clear · ↻ ROTATE before placing

### 3. Spatial highlights on the active pallet
- Pulsing yellow outline on the **next** pallet's target slot before it flies in (so a paused viewer sees the target).
- Red dashed footprint on the floor when a gap forms (uses existing `gapHeatmapRow`).
- Green checkmark stamp on each completed pallet for 400ms.
- Orange arrow on rotated pallets pointing the rotation axis.

### 4. Camera that follows the work
Replace static iso during play with a **shoulder-of-loader cam**:
- Camera sits ~1.5m off the door, ~1.7m up (loader eye height).
- Pans laterally to track the active pallet's y-position.
- Lifts higher when stacking 2nd+ layer.
- Returns to free orbit when paused or completed.

### 5. Real playback controls
Replace the binary Play/Pause with: **⏮ Prev pallet · ⏯ Play/Pause · ⏭ Next pallet · 0.5× / 1× / 2× speed · "Jump to row N"** dropdown. Speed slider drives the per-pallet step duration (default 600ms total, 0.5×=1.2s, 2×=300ms).

### 6. Forklift token (lightweight)
A simple low-poly forklift sprite (just a coloured box with forks — no 3D model needed) that drives in from the door, lifts the active pallet, places it, reverses out. Toggleable in case it distracts. This is the visual anchor that makes it feel like a *load*, not an *animation*.

### 7. Stay synced with the right panel
The Loading-Rows-Panel row card highlights the current row, and we already scroll-to-view it. Add: highlight the current pallet's chip in the row's item-counts list too.

## Files to change
- `src/lib/freight/loading-rows.ts` — add `buildPalletSequence(pack)` returning ordered `{box, action, positionText, warnings, layer}[]`.
- `src/components/freight/container-3d-view.tsx` — add `activePalletIdx`, `nextPalletIdx`, `palletSequenceKey` props; render pulsing target, checkmark stamp, rotation arrow, follow-cam mode; CargoBox uses these to drive its fly-in instead of row sets.
- `src/components/freight/container-load-view.tsx` — replace row-stepper state with pallet-stepper state; new playback controls; HUD card overlay; speed setting.
- New: `src/components/freight/loader-hud.tsx` — the per-step instruction card overlay.
- New: `src/components/freight/forklift-token.tsx` — three.js group component.

## What I'm NOT doing (out of scope, ask if you want)
- Full GLB forklift model (low-poly box stand-in instead — keeps perf tight)
- Voiceover (you've kept captions-only as the rule)
- Re-rendering the Remotion video — separate workflow

