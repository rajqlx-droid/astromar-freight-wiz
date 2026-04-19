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
    label: "CBM",
    sub: "Sea / Volume",
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
    tip: "Pro tip: GST is charged on (CIF + Duty), not just on product cost. Update Duty% to your HSN's BCD rate.",
  },
  {
    key: "export",
    label: "Export Price",
    sub: "FOB / CIF / Margin",
    emoji: "📈",
    tip: "Pro tip: FOB excludes insurance. CIF = FOB + Insurance. Selling Price applies your margin on top of CIF.",
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
    tip: "Pro tip: Most Indian ports give 5 free days. Beyond that, daily demurrage stacks fast — and may double after 14 days.",
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
