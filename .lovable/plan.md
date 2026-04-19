

## Plan — Globalize calculators (concise)

### 1. Typable Port input
- Convert any `Port` field (currently a `Select`) to a plain typable `Input` with placeholder "Enter port name (e.g. Chennai, Shanghai, Rotterdam)".
- Free-text only, no dropdown, no suggestions list. State stays `string`.
- Files: `src/components/freight/risk-calculator.tsx` (and any other calc using port — verify on implementation).

### 2. Multi-line cargo — Landed Cost & Export Price
Replace single-product inputs with an invoice-style line-item table.

**Landed Cost line columns:** Description, HS code, Qty, Unit value, Weight (kg), Duty %.
Per-line subtotal = Qty × Unit value. Per-line duty = subtotal × Duty%.
Shared inputs (kept once at top): Freight, Insurance, Other charges, GST %.

**Export Price line columns:** Description, HS code, Qty, Unit cost, Margin %.
Per-line FOB = Qty × Unit cost; CIF derived from shared Freight + Insurance allocated by value share. Selling price per line = CIF × (1 + Margin%).

**Aggregation:**
- Totals row: Sum of subtotals, sum of duties, GST on (CIF + total duty), Grand Total Landed Cost.
- Export totals: Total FOB, Total CIF, Total Selling Price, blended margin %.

**Add / Remove / Duplicate row** controls (mirroring CBM calculator pattern).

### 3. Multi-currency with manual FX
- Add `currency` (string code, e.g. USD/EUR/INR/AED/GBP/CNY/JPY/SGD/AUD…) and `fxRate` (number) at the top of Landed Cost & Export Price.
- Currency is a typable `Input` (free text 3-letter code) — keeps things universal, no preset list maintenance.
- `fxRate` = how many units of base currency per 1 unit of selected currency. Default 1. Used only for display conversion in a small "≈ INR …" hint under each total. All math runs in the entered currency.
- Currency symbol/code shown in every input prefix and result line.

### 4. Types & calculators
- Extend `LandedInput` and `ExportInput` in `src/lib/freight/calculators.ts` to accept `lines: CargoLine[]`, `currency: string`, `fxRate: number`. Keep legacy single-product fields temporarily for migration — drop after wiring.
- New `CargoLine` shape exported from `src/lib/freight/types.ts`.
- Update `calcLanded` / `calcExport` to iterate lines and produce per-line + total result items.

### 5. PDF & Share
- `src/lib/freight/pdf.ts`: render line-item table for Landed/Export with currency code in headers.
- `results-card.tsx` / WhatsApp / Email summaries: include currency code + grand total only (per-line breakdown stays in PDF).

### 6. Out of scope
- Preset country VAT/GST table.
- Live FX API.
- Persisting currency/port across reloads.
- Touching CBM, Air, Compare, Risk math (only Risk gets the typable port swap).

### Files touched
```text
EDIT  src/components/freight/risk-calculator.tsx        — port: Select → Input
EDIT  src/components/freight/landed-calculator.tsx      — line-item UI + currency + FX
EDIT  src/components/freight/export-calculator.tsx      — line-item UI + currency + FX
EDIT  src/lib/freight/calculators.ts                    — new line-aware calc fns
EDIT  src/lib/freight/types.ts                          — CargoLine + currency fields
EDIT  src/lib/freight/pdf.ts                            — line-item tables, currency code
EDIT  src/lib/freight/storage.ts                        — persist new shapes (defaults for old saves)
```

