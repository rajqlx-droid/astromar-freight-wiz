/**
 * Shared types for the Freight Intelligence calculator suite.
 */

export type CalcKey =
  | "cbm"
  | "air"
  | "landed"
  | "export"
  | "compare"
  | "risk";

export interface CalcMeta {
  key: CalcKey;
  label: string;
  sub: string;
  emoji: string;
  tip: string;
}

export const CALCULATORS: CalcMeta[] = [
  {
    key: "cbm",
    label: "Load Optimizer / CBM",
    sub: "Load Simulation",
    emoji: "📦",
    tip: "Pro tip: For sea freight, chargeable weight uses CBM × 1000 ÷ 5. Add multiple item rows for mixed cargo.",
  },
  {
    key: "air",
    label: "Air Volume",
    sub: "Air Chargeable",
    emoji: "✈️",
    tip: "Pro tip: Airlines bill on the higher of actual vs. volumetric weight (L×W×H ÷ 6000). Watch the warning if volumetric exceeds actual.",
  },
  {
    key: "landed",
    label: "Landed Cost",
    sub: "Duty + GST",
    emoji: "💰",
    tip: "Pro tip: Add a row for each material/HS code. Duty is applied per line; GST/VAT is applied on (CIF + total duty).",
  },
  {
    key: "export",
    label: "Export Price",
    sub: "FOB / CIF / Margin",
    emoji: "📈",
    tip: "Pro tip: Add a row per product. Freight & insurance are split across lines by value share. Margin is set per line.",
  },
  {
    key: "compare",
    label: "Air vs Sea",
    sub: "Total cost compare",
    emoji: "⚖️",
    tip: "Pro tip: Sea freight is cheaper but ties up working capital longer. Increase your interest rate to see when air wins.",
  },
  {
    key: "risk",
    label: "Demurrage",
    sub: "Risk & Delays",
    emoji: "⚠️",
    tip: "Pro tip: Most ports give 5 free days. Beyond that, daily demurrage stacks fast — and may double after 14 days.",
  },
];

export interface ResultItem {
  label: string;
  value: string;
  /** Optional emphasis flag for the headline result. */
  highlight?: boolean;
}

export interface CalcResult {
  type: CalcKey;
  title: string;
  items: ResultItem[];
  /** Plain-text summary for share / email / clipboard. */
  text: string;
  /** Optional per-line breakdown (rendered into PDF, not the on-screen results card). */
  lines?: { headers: string[]; rows: string[][] };
}

export interface SavedCalculation {
  id: string;
  type: CalcKey;
  name: string;
  savedAt: number;
  /** Snapshot of the input form. */
  inputs: unknown;
  result: CalcResult;
}

/**
 * One cargo line item (used by Landed Cost & Export Price calculators).
 * Fields are optional per use-case — Landed uses dutyRate; Export uses margin.
 */
export interface CargoLine {
  id: string;
  description: string;
  hsCode: string;
  qty: number;
  unitValue: number;
  weightKg?: number;
  /** Used by Landed Cost only. */
  dutyRate?: number;
  /** Used by Export Price only. */
  margin?: number;
}
