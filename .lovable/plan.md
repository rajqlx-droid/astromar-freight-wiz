

## Plan: Rebrand + enhanced PDF analytics for all 6 tools

### Part 1 — Rebrand to "Smart Tools Everywhere"

Find/replace user-facing brand strings only. Keep `astromar.*` localStorage keys intact (renaming would wipe existing user history).

**Files touched:**
- `src/routes/__root.tsx` — page `<title>`, og:title, twitter:title, description meta → "Smart Tools Everywhere — Freight Intelligence Suite".
- `src/routes/freight-intelligence.tsx` — head meta block; visible header brand block (line ~356: "Astromar" → "Smart Tools"; "Freight Tools" subtitle stays); footer company line ("© Smart Tools Everywhere · Freight Intelligence"). Keep contact email/phone as-is (those are real business contact details, not brand).
- `src/lib/freight/pdf.ts` — header band line 72 already says "Smart Tool"; bump to "Smart Tools Everywhere", subtitle "Freight Intelligence Suite" stays. Footer line 531 likewise.
- `src/components/freight/history-panel.tsx` — CSV filename prefix `astromar-history-...` → `smart-tools-history-...`.

Out of scope: localStorage keys (`astromar.freight.*`, `astromar-theme`), business email/phone, the `Astromar Logistics Pvt Ltd` company name in the footer credit (real company, separate from product brand). I'll flag these in a final note for the user.

### Part 2 — Enhanced PDF analytics across all 6 tools

Goal: each PDF gets a tool-appropriate **Key Metrics** block (compact 2-column KPI grid above the existing Result table) and a tool-specific **Analytics** section (mini chart/breakdown). Keep the layout tight — everything fits on page 1 alongside existing inputs/results.

**A. Shared infrastructure (`src/lib/freight/pdf.ts`)**

Add two reusable helpers used by all 6 tools:

1. `drawKpiGrid(doc, y, kpis: { label, value, tone? }[])` — renders KPIs as a 4-column grid of bordered tiles, ~110×42pt each, with bold value + small label + optional tone color. Returns new `y`.
2. `drawHBar(doc, x, y, w, h, segments: { label, value, color }[])` — horizontal stacked-bar visualisation with inline labels. Used for cost breakdowns (landed, export, compare).

Add a new optional `analytics` field to `PdfExtras`:
```ts
analytics?: {
  kpis?: { label: string; value: string; tone?: "good" | "warn" | "bad" }[];
  breakdown?: { title: string; segments: { label: string; value: number; color: [number,number,number] }[] };
  comparison?: { title: string; rows: { label: string; values: number[]; format?: "money" | "days" | "kg" }[]; columns: string[] };
};
```

Render order on page 1: header → KPI grid (if present) → inputs table → per-line breakdown → results table → analytics breakdown bar → existing snapshots/load report. Page-break checks already in place.

**B. Per-tool analytics payload (built in each calculator component, passed via `resolveExtras` / new direct `extras` prop)**

Promote `inputsTable` prop on `ResultsCard` to also accept an inline `extras.analytics`. Each calculator builds the payload from its own state — pure additive change, no calculator math touched.

| Tool | KPIs (4 tiles) | Analytics chart |
|---|---|---|
| **CBM / Load** | Total CBM · Total weight · Avg density (kg/m³) · Container utilization % | Already has snapshots + load report (no extra chart needed) |
| **Air Volume** | Actual kg · Volumetric kg · Chargeable kg · Volumetric premium % | Stacked bar: actual vs volumetric weight with chargeable line |
| **Landed Cost** | Goods value · Total duty · GST/VAT · Total landed | Stacked bar: Goods / Freight+Ins / Duty / GST share of total |
| **Export Price** | Total cost · Total CIF · Total selling · Blended margin % | Stacked bar: Cost / F+I / Margin share of selling price |
| **Air vs Sea** | Sea total · Air total · Days saved · Cheaper option | Side-by-side bars: freight + interest + handling for each mode |
| **Risk / Demurrage** | Free days · Chargeable days · Demurrage · Risk level (tone-coloured) | Horizontal "risk thermometer" bar 0–100 with marker at exposure% |

KPI tones use the existing traffic-light convention (e.g. risk High = bad, Low = good; export margin <10% = warn).

**C. Wiring**
- `src/components/freight/results-card.tsx` — accept optional `extras` prop and merge with `resolveExtras()` result before calling `downloadResultPdf`.
- `src/components/freight/mobile-result-bar.tsx` — same `extras` pass-through.
- Each of the 6 calculator components — build a small `pdfExtras` object and pass it through. Keeps calculator math files (`calculators.ts`, `packing-advanced.ts`) untouched.

### Compact-layout discipline
- KPI grid: 4 tiles per row, max 8 KPIs per page (2 rows). Tile font sizes: value 12pt bold, label 7pt grey.
- Analytics chart height: 60pt max so KPI grid + chart together stay under ~150pt vertical budget.
- All new sections respect the existing `y > 600` page-break checks; nothing pushes the snapshots off page 1 for typical CBM payloads.

### Files touched
- `src/routes/__root.tsx`, `src/routes/freight-intelligence.tsx`, `src/components/freight/history-panel.tsx` — brand strings.
- `src/lib/freight/pdf.ts` — KPI grid + analytics renderers, expanded `PdfExtras`.
- `src/components/freight/results-card.tsx`, `src/components/freight/mobile-result-bar.tsx` — accept `extras` prop.
- `src/components/freight/{cbm,air,landed,export,compare,risk}-calculator.tsx` — build & pass per-tool analytics payload.

### Out of scope
- localStorage key rename (would erase users' saved history).
- Calculator math (`calculators.ts`, `packing-advanced.ts`) — purely a presentation enhancement.
- The `loading-rows` PDF page (already heavily detailed; no analytics needed there).

### Risks
- Bigger PDF first page — KPI grid + chart + existing tables. Mitigated by tight 60pt chart height and page-break guards.
- Calculator components grow ~25 lines each for the analytics payload. Acceptable; pure data shaping, no logic change.
- Brand keeps two names side-by-side (product = "Smart Tools Everywhere", company in footer = "Astromar Logistics Pvt Ltd"). I'll surface this for user confirmation post-approval.

