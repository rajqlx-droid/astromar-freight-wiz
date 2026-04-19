
## Heads-up before we build

Two important notes about your spec:

1. **Stack**: Your brief says Next.js 16, but this project is **TanStack Start + React 19 + Vite + Tailwind v4**. I'll build the same page with the same features on this stack. The page will live at `/freight-intelligence` as a TanStack route file.
2. **Scope**: This is a very large brief. To keep it shippable in one pass and high quality, I'll deliver a focused v1 of all 6 calculators with the most valuable features, and queue the nice-to-haves as follow-ups. Anything cut is listed under "Phase 2" so nothing is forgotten.

## What I'll build (Phase 1 — this turn)

### Routes
- `/freight-intelligence` — main tools page
- Update `/` (home) with Astromar hero + nav linking to tools (replaces placeholder)
- Stub routes: `/about`, `/services`, `/ftwz`, `/contact` (simple page each so header links resolve — TanStack requires real route files)

### Layout & Chrome
- **Sticky header**: Astromar wordmark left, nav center (Home/About/Services/FTWZ/Contact), navy "Tools" CTA + theme toggle right, mobile hamburger sheet. White bg, navy bottom border, shadow, z-50.
- **Sticky tab strip** (top-[60px], z-40): 6 horizontally-scrollable tabs with icon + label + sub-label, active = navy gradient + orange border + white text, keyboard arrow-key navigation, snap scroll on mobile.
- **Hero band**: light-navy → light-orange gradient, navy border, "Smart Freight Calculator" + subhead, decorative orange circle.
- **Dismissible info banner**: dynamic pro-tip per tab, 💡 icon, orange left border, X to dismiss (persisted in localStorage).
- **Breadcrumb**: Home › Tools › [Calculator].

### 6 Calculators (all real-time, debounced 300ms, fully accurate)
1. **CBM Calculator** — multi-item rows (add/remove/duplicate), L×W×H/qty/weight, computes Total CBM, Total Weight, Volumetric Weight (÷5000), Chargeable Weight.
2. **Air Volume Weight** — multi-item, ÷6000 divisor, comparison of actual vs chargeable + cost-impact warning.
3. **Landed Cost** — Product/Freight/Insurance/Duty%/GST%/Additional, currency selector (₹/$/€), full breakdown table + mini bar-chart of cost components.
4. **Export Price** — Cost/Freight/Insurance/Margin%/Additional/Qty → FOB, CIF, Selling Price, Profit, Margin%, per-unit; margin progress bar.
5. **Freight Compare (Air vs Sea)** — side-by-side card with freight + working capital interest + handling, time-savings value, break-even insight.
6. **Risk & Demurrage** — container type, days at port, daily rate, port + cargo dropdowns, free-days grace, color-coded risk badge (Low/Med/High), recommended insurance.

### Results Card (per calculator)
- Navy-bordered card, light-navy gradient, label/value rows with orange value pills and proper units (m³, kg, ₹, %, days).
- Action toolbar:
  - **Download PDF** — branded PDF (Astromar header, inputs, results, contact footer) using `jspdf` + `jspdf-autotable`.
  - **Copy** — formatted text to clipboard + toast.
  - **Save** — to localStorage (max 10 per calculator, named with timestamp).
  - **Print** — print-optimized stylesheet.
  - **Share** — encoded URL → clipboard, plus WhatsApp + mailto buttons.
  - **Email** — mailto with prefilled subject/body to sales@astromarfreezone.com.

### History Panel
- Right sidebar on desktop, drawer (Sheet) on mobile.
- Last 10 calculations across all tools, type filter, click to reload, delete, clear-all with confirm, **CSV export**.

### Validation, Help, A11y
- Zod schemas per calculator, inline error messages, red borders on invalid, required-field asterisks.
- Info tooltip next to each field with definition + example.
- Semantic form/fieldset/legend, ARIA labels, visible focus rings, full keyboard nav, WCAG-AA contrast.

### CTA + FAQ + Footer
- Navy-gradient CTA: "Need expert assistance?" with Contact (orange) + Schedule Demo (outline) buttons, phone/email/hours.
- Accordion FAQ: 5–6 Qs covering all calculators, with search filter.
- Footer: company info, address, quick links, contact, copyright.

### Theming & Tokens
- Add brand tokens to `src/styles.css`: `--brand-navy #1B3A6B`, `--brand-orange #F97316`, `--brand-navy-soft #f0f5fb`, `--brand-orange-soft #fff7ed`, plus dark-mode variants. Theme toggle persisted in localStorage.

### SEO
- Per-route `head()` with title, description, og:title, og:description for `/freight-intelligence` and each stub route.

### Tech
- New deps: `jspdf`, `jspdf-autotable` (PDF), `qrcode` (share QR).
- Reuse existing shadcn: Button, Card, Input, Label, Tabs, Sheet, Accordion, Tooltip, Select, Sonner (toasts), Dialog.
- Charts: lightweight pure-CSS bars (no recharts needed for the small breakdowns) — keeps bundle small.

## Phase 2 (not in this turn — call out & defer)
- Comparison-mode side-by-side scenarios per calculator
- Templates/presets library beyond container defaults
- Excel (.xlsx) export, JSON export, PNG screenshot export
- Voice input, video tutorials, chatbot widget
- Schema.org `SoftwareApplication` JSON-LD
- PWA / service worker offline support
- Analytics event wiring

If you want any Phase 2 item pulled into Phase 1, tell me which and I'll re-scope. Otherwise click Implement and I'll ship Phase 1.
