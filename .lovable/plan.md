

## Make the "Get your container optimization plan" banner feel alive — a tiny 3D cargo scene in motion

### What the user is asking

Looking at the uploaded screenshot: the small dark-navy promo banner that already lives **inline in the calculator heading row** (the one with the orange "View plan" button, the "FREE" pill, and the orange container icon on the right). They want the static SVG container icon replaced with **something 3D and moving — like cargo**. A tiny moving scene baked into the banner, not a separate full-width section.

### Where this lives today

`src/routes/freight-intelligence.tsx` lines 585–644 — the desktop inline promo banner shown only when `active === "cbm"`. Right side currently has a flat SVG of a stack of three orange containers (lines 609–617). There's also a slimmer mobile variant lower down (lines 696–720) without the icon.

### The plan

**1. New component: `src/components/freight/cargo-banner-scene.tsx`**

A self-contained CSS-3D micro-scene, ~80 px tall on desktop:

- **A perspective stage** (`perspective: 600px`, `transform-style: preserve-3d`) sized to slot into the banner's right side where the current SVG sits
- **A real 3D shipping container** built from 6 divs (front, back, left, right, top, bottom) in brand-orange with corrugated ridge lines drawn via `repeating-linear-gradient` and tiny ASTROMAR text on the side panel — looks like an actual ISO container, not a flat icon
- **Continuous gentle motion**: the container slowly rotates on Y-axis (`@keyframes spin-y` 12s linear infinite) and floats up/down ~3 px (`@keyframes float` 4s ease-in-out infinite) so it always reads as "alive" without being distracting
- **A second smaller container** behind it on a slower offset rotation, half-opacity, to give depth — like a stack passing by
- **A ground shadow** as a flattened ellipse beneath that scales inversely with the float, so the container actually feels grounded
- **A faint motion trail** — 3 small orange dots drifting right-to-left across the back plane on a 3s loop, suggesting the container is moving forward through space
- **`prefers-reduced-motion` gate**: if the user has reduced motion on, animations stop and the container holds at a nice 3/4 hero angle (no jitter, no spin)
- **Pure CSS**, no Three.js, no new deps, no canvas — keeps bundle weight zero and renders instantly

**2. Edit `src/routes/freight-intelligence.tsx`**

- **Desktop banner (lines 609–617)**: replace the static `<svg>` container icon block with `<CargoBannerScene />`, positioned exactly where the SVG sat (absolute, right-3, vertically centered, hidden below `lg`)
- **Mobile banner (lines 696–720)**: keep as-is — too cramped for the 3D scene, the `Sparkles` icon stays
- No changes to copy, layout, the orange "View plan" button, or the surrounding heading row

### Files touched

- `src/components/freight/cargo-banner-scene.tsx` *(new)*
- `src/routes/freight-intelligence.tsx` *(swap one icon block)*

### Out of scope

- The mobile promo strip (stays simple)
- The calculator, optimizer, compare/history, FAQ, footer
- No new dependencies (no Three.js / R3F — pure CSS 3D)
- No changes to colors, copy, or the banner's outer container

