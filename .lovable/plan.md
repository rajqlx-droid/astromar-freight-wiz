

## Status check against the original two-part plan

**Part 1 — In-browser video preview**: NOT BUILT
- No `loading-video-button.tsx`
- No `loading-video.ts` engine
- No `mp4-muxer` dependency
- 3D scene has no frame-recording API
- Results card has no "Generate Video" button

**Part 2 — Smart container recommendation**: BUILT ✓
- `container-recommender.ts` exists with 30/60/70 CBM thresholds
- `container-suggestion.tsx` banner with Apply button
- Multi-container tabs in `container-load-view.tsx`
- Wired into `cbm-calculator.tsx`

**Also pending from earlier approved plans:**
- `load-report-panel.tsx` per-container roll-up (plan said edit, but file may still show single-container totals only)
- `pdf.ts` multi-container PDF (one section per container)

## What's left to build

### 1. Loading video feature (full Part 1)
- ADD `src/lib/freight/loading-video.ts` — frame timeline (30fps, ~20s), camera + box interpolation, WebCodecs `VideoEncoder` + `mp4-muxer` encoder, `MediaRecorder` WebM fallback for Safari < 17
- ADD `src/components/freight/loading-video-button.tsx` — button + Dialog with `<video controls autoPlay muted>` preview, speed buttons (0.5× / 1× / 2×), step-counter overlay synced to `currentTime`, 720p/1080p toggle, Download MP4 button, revoke object URL on close
- EDIT `src/components/freight/container-3d-view.tsx` — expose imperative `setFrame(n)`, `setBoxTransform()`, `captureFrame()` via ref
- EDIT `src/components/freight/results-card.tsx` — mount the new button next to Download PDF (one per container tab for multi-container)
- ADD npm: `mp4-muxer` (~15 KB gzip)

### 2. Multi-container roll-up (finish Part 2)
- EDIT `src/components/freight/load-report-panel.tsx` — per-container summary + top-level "Total shipment" roll-up
- EDIT `src/lib/freight/pdf.ts` — one section per container with combined cover page totals

## Files touched
```text
ADD   src/lib/freight/loading-video.ts
ADD   src/components/freight/loading-video-button.tsx
EDIT  src/components/freight/container-3d-view.tsx
EDIT  src/components/freight/results-card.tsx
EDIT  src/components/freight/load-report-panel.tsx
EDIT  src/lib/freight/pdf.ts
ADD   npm: mp4-muxer
```

## Out of scope (unchanged)
- Voiceover / music / captions
- Server-side video rendering
- Real-time freight pricing
- Refrigerated / open-top container types

