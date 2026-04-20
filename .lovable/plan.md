

## Plan: Weight-limited badge + PDF gauge bars

Two surgical additions on top of the KPIs we just shipped.

### 1. "Weight-limited cargo" badge (results card)

**Where**: render inside `ResultsCard`, between the header bar and the items list, when an opt-in flag is set on the result.

**Trigger logic**: lives in `src/components/freight/cbm-calculator.tsx` — after computing `u` (Container Utilization) and `wu` (Weight Utilization) inside the `useMemo`, set `weightLimited = wu - u > 15` and pass it through on the result object as a new optional field `notice` (a structured object, not raw markup).

**Wiring**:
- `src/lib/freight/types.ts` — add `notice?: { tone: "warn" | "bad" | "info"; title: string; body: string }` to `CalcResult`.
- `src/components/freight/cbm-calculator.tsx` — when `weightLimited`, attach:
  - title: "Weight-limited cargo"
  - body: "Adding more boxes won't help — this load hits the container's weight cap before it fills the volume. Consider a higher-payload container (e.g. 40HC heavy-duty) or split across two shipments."
  - tone: `"warn"` (amber)
- `src/components/freight/results-card.tsx` — render a small amber pill banner with `AlertTriangle` icon when `result.notice` is set. Sits just above the KPI list; included in PDF too via `print-area` (no `no-print` class).

**Visual**: amber background (`bg-amber-50 border-amber-300 text-amber-900`), one line title + one line body, ~px-5 py-2.5, matches the existing card aesthetic.

### 2. PDF gauge bars in Results table

**Where**: `src/lib/freight/pdf.ts`, the existing autoTable for `result.items`.

**Approach**:
- Switch the second column to `columnStyles: { 1: { minCellHeight: 26 } }` so there's vertical room.
- Add a `didDrawCell` hook (sibling to existing `didParseCell`):
  - Skip non-body / non-column-1 / no-`gauge`-value cells.
  - Use `data.cell.x/y/width/height` and the cell's text bounding box to draw a 60×4pt rounded bar to the **right of the value text** (right-aligned to the cell's right padding), with three zone fills:
    - red zone: 0–70% of bar width, `[254, 226, 226]`
    - amber zone: 70–85%, `[254, 243, 199]`
    - green zone: 85–100%, `[209, 250, 229]`
  - Then a 3pt black-bordered white dot at `x = barX + (gauge/100) * barW`.
- Color tone fills already applied via `didParseCell` stay; the bar sits in the empty cell space to the right.

**Bar geometry**: bar width 60pt, height 4pt, centred vertically in the cell (`y + height/2 - 2`). Right edge anchored 8pt from the cell's right edge.

### Files touched
- `src/lib/freight/types.ts` — add `notice` field to `CalcResult`.
- `src/components/freight/cbm-calculator.tsx` — compute & attach `notice` when `wu - u > 15`.
- `src/components/freight/results-card.tsx` — render notice banner above KPI list.
- `src/lib/freight/pdf.ts` — add `didDrawCell` gauge bar renderer + `minCellHeight` for value column.

### Out of scope
- The verification step (load cartons + pallets, click Optimize, hover tooltips, export PDF) is something only you can do in the preview. Once the changes are live I'll list the exact things to spot-check.

### Risk
- `didDrawCell` runs *after* fill, so the gauge sits on top of the tone fill — fine, contrast is good (red dot on red fill remains readable because of the white border ring).
- Increased row height (~26pt) makes the Results table slightly taller — well within the page budget; no layout reflow concerns since this table runs before the snapshots block which already does `y > 600` page-break checks.

