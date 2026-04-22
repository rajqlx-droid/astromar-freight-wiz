

## Replace existing CTA banner with commercial poster, placed between Load Optimizer heading and Compare/History controls

### Placement (confirmed)

```text
┌─────────────────────────────────────────────┐
│  Calculator panel (CBM / Air / …)           │
├─────────────────────────────────────────────┤
│  "Container Load Optimizer" heading         │
├─────────────────────────────────────────────┤
│  ❮ COMMERCIAL POSTER (new) ❯                │  ← inserted here
├─────────────────────────────────────────────┤
│  Compare scenarios + History buttons        │
├─────────────────────────────────────────────┤
│  3D viewer / loader HUD / rows              │
├─────────────────────────────────────────────┤
│  FAQ / Footer                               │
└─────────────────────────────────────────────┘
```

And the existing dark-navy "Need expert assistance?" banner below the optimizer is **removed**.

### What gets built

**New file** `src/components/freight/commercial-poster.tsx` — a self-contained cinematic ad unit:

- Full-width band, ~340–440 px tall on desktop, scales gracefully down to ~220 px on mobile (948 px viewport included)
- Deep navy plate (`var(--brand-navy-strong)`) with layered SVG artwork:
  - Port-crane + container-ship skyline silhouette (pure SVG, no asset upload)
  - Dotted halftone overlay for print-ad texture
  - Bold diagonal orange slash (`var(--brand-orange)`) as the graphic device
- Top-left "ASTROMAR │ LOGISTICS" lockup, small-caps, like a print sign-off
- Hero claim: **"MOVE CARGO LIKE YOU MEAN IT."** — condensed all-caps, `clamp(2rem, 6vw, 4.5rem)`, leading-none
- Sub-claim: one short line — "End-to-end freight, customs and FTWZ — out of Chennai."
- Single high-contrast pill CTA "Talk to Astromar →" + tappable phone line `+91 99402 11014`
- Bottom credibility strip: "25+ YRS · 50K+ TEU MOVED · FTWZ LICENSED · CHENNAI" in tracked-out uppercase
- Subtle parallax on the diagonal slash + slow skyline drift on hover (desktop only, gated by `prefers-reduced-motion`)

**Edits to** `src/routes/freight-intelligence.tsx`:

1. Insert `<CommercialPoster />` immediately **after** the "Container Load Optimizer" section heading and **before** the Compare scenarios / History action row
2. **Delete** the existing post-optimizer CTA `<section>` (the dark-navy "Need expert assistance with your shipment?" block with phone/email chips and two buttons)

### Files touched

- `src/components/freight/commercial-poster.tsx` *(new)*
- `src/routes/freight-intelligence.tsx` *(insert one component, delete old CTA section)*

### Out of scope

- Calculator, 3D viewer, loader HUD, FAQ, footer — untouched
- No new dependencies — pure SVG + Tailwind tokens already in the theme
- Copy lives in one component; easy to edit later

