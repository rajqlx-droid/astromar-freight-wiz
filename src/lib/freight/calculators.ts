/**
 * Pure calculation helpers. No React, no DOM — easy to unit test.
 * All numbers are validated upstream; here we just compute.
 */

import type { CalcResult, CargoLine } from "./types";
import { nextId, seedId } from "./ids";

export const fmt = (n: number, digits = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-IN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";

export const fmtMoney = (n: number, currency = "₹") =>
  Number.isFinite(n) ? `${currency}${fmt(n, 2)}` : "—";

export const fmtInt = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString("en-IN") : "—";

export const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
};

/* ---------------- CBM ---------------- */
export type PackageType = "carton" | "pallet" | "crate" | "drum" | "bag";

export interface CbmItem {
  id: string;
  /** Always stored in cm internally. */
  length: number;
  /** Always stored in cm internally. */
  width: number;
  /** Always stored in cm internally. */
  height: number;
  qty: number;
  /** Always stored in kg internally. */
  weight: number;
  packageType?: PackageType;
  stackable?: boolean;
  fragile?: boolean;
  maxStackWeightKg?: number;
  allowSidewaysRotation?: boolean;
  allowAxisRotation?: boolean;
  packingConfirmed?: boolean;
  /** Per-row display unit for L/W/H. Falls back to global preference. */
  lenUnit?: "cm" | "mm" | "m" | "in" | "ft";
  /** Per-row display unit for weight. Falls back to global preference. */
  wtUnit?: "kg" | "g" | "lb";
}

export const emptyCbmItem = (seedIndex?: number): CbmItem => ({
  id: typeof seedIndex === "number" ? seedId("cbm", seedIndex) : nextId("cbm"),
  length: 0,
  width: 0,
  height: 0,
  qty: 1,
  weight: 0,
  packageType: "carton",
  stackable: true,
  fragile: false,
  maxStackWeightKg: 0,
  allowSidewaysRotation: true,
  allowAxisRotation: false,
  packingConfirmed: false,
});

export function calcCbm(items: CbmItem[]): CalcResult {
  let totalCbm = 0;
  let totalWeight = 0;
  let totalQty = 0;
  for (const it of items) {
    const cbm = (it.length * it.width * it.height) / 1_000_000;
    totalCbm += cbm * it.qty;
    totalWeight += it.weight * it.qty;
    totalQty += it.qty;
  }
  const volWeight = (totalCbm * 1000) / 5;
  const chargeable = Math.max(totalWeight, volWeight);

  return {
    type: "cbm",
    title: "CBM Calculator",
    items: [
      { label: "Total Items", value: fmtInt(totalQty) },
      { label: "Total CBM", value: `${fmt(totalCbm, 4)} m³`, highlight: true },
      { label: "Total Actual Weight", value: `${fmt(totalWeight)} kg` },
      { label: "Volumetric Weight (÷5000)", value: `${fmt(volWeight)} kg` },
      { label: "Chargeable Weight", value: `${fmt(chargeable)} kg`, highlight: true },
    ],
    text:
      `CBM Calculation\n` +
      `Total CBM: ${fmt(totalCbm, 4)} m³\n` +
      `Total Weight: ${fmt(totalWeight)} kg\n` +
      `Volumetric Weight: ${fmt(volWeight)} kg\n` +
      `Chargeable Weight: ${fmt(chargeable)} kg`,
  };
}

/* ---------------- Air Volume ---------------- */
export interface AirItem {
  id: string;
  length: number;
  width: number;
  height: number;
  qty: number;
  weight: number;
}

export const emptyAirItem = (seedIndex?: number): AirItem => ({
  id: typeof seedIndex === "number" ? seedId("air", seedIndex) : nextId("air"),
  length: 0,
  width: 0,
  height: 0,
  qty: 1,
  weight: 0,
});

export function calcAir(items: AirItem[], divisor = 6000): CalcResult {
  let volWeight = 0;
  let actualWeight = 0;
  let totalQty = 0;
  for (const it of items) {
    const v = (it.length * it.width * it.height) / divisor;
    volWeight += v * it.qty;
    actualWeight += it.weight * it.qty;
    totalQty += it.qty;
  }
  const chargeable = Math.max(actualWeight, volWeight);
  const diff = chargeable - actualWeight;
  const pct = actualWeight > 0 ? (diff / actualWeight) * 100 : 0;
  const warn = volWeight > actualWeight && actualWeight > 0;

  return {
    type: "air",
    title: "Air Volume Weight",
    items: [
      { label: "Total Items", value: fmtInt(totalQty) },
      { label: "Actual Weight", value: `${fmt(actualWeight)} kg` },
      { label: `Volumetric Weight (÷${divisor})`, value: `${fmt(volWeight)} kg` },
      { label: "Chargeable Weight", value: `${fmt(chargeable)} kg`, highlight: true },
      {
        label: "Cost Impact",
        value: warn
          ? `+${fmt(diff)} kg (${fmt(pct, 1)}% above actual)`
          : "No volumetric premium",
      },
    ],
    text:
      `Air Freight Chargeable Weight\n` +
      `Actual: ${fmt(actualWeight)} kg | Volumetric: ${fmt(volWeight)} kg\n` +
      `Chargeable: ${fmt(chargeable)} kg`,
  };
}

/* ---------------- Cargo line helpers ---------------- */
export const emptyLandedLine = (seedIndex?: number): CargoLine => ({
  id: typeof seedIndex === "number" ? seedId("ll", seedIndex) : nextId("ll"),
  description: "",
  hsCode: "",
  qty: 1,
  unitValue: 0,
  weightKg: 0,
  dutyRate: 10,
});

export const emptyExportLine = (seedIndex?: number): CargoLine => ({
  id: typeof seedIndex === "number" ? seedId("el", seedIndex) : nextId("el"),
  description: "",
  hsCode: "",
  qty: 1,
  unitValue: 0,
  margin: 20,
});

/* ---------------- Landed Cost (multi-line) ---------------- */
export interface LandedInput {
  lines: CargoLine[];
  freight: number;
  insurance: number;
  additional: number;
  gstRate: number;
  currency: string;
  /** How many base-currency units (e.g. INR) per 1 unit of `currency`. Optional. */
  fxRate?: number;
  /** Base-currency code shown in the FX hint, e.g. "INR". */
  baseCurrency?: string;
}

export function calcLanded(i: LandedInput): CalcResult {
  const lineRows: string[][] = [];
  let goodsValue = 0;
  let totalDuty = 0;
  let totalQty = 0;

  for (const ln of i.lines ?? []) {
    const lineSubtotal = ln.qty * ln.unitValue;
    const lineDuty = lineSubtotal * ((ln.dutyRate ?? 0) / 100);
    goodsValue += lineSubtotal;
    totalDuty += lineDuty;
    totalQty += ln.qty;
    lineRows.push([
      ln.description || "—",
      ln.hsCode || "—",
      fmtInt(ln.qty),
      fmtMoney(ln.unitValue, i.currency),
      fmtMoney(lineSubtotal, i.currency),
      `${fmt(ln.dutyRate ?? 0, 2)}%`,
      fmtMoney(lineDuty, i.currency),
    ]);
  }

  const cif = goodsValue + i.freight + i.insurance + i.additional;
  const gst = (cif + totalDuty) * (i.gstRate / 100);
  const total = cif + totalDuty + gst;
  const perUnit = totalQty > 0 ? total / totalQty : 0;

  const fx = i.fxRate && i.fxRate > 0 ? i.fxRate : 0;
  const base = i.baseCurrency || "INR";
  const fxHint = (n: number) => (fx > 0 ? ` (≈ ${base} ${fmt(n * fx, 2)})` : "");

  return {
    type: "landed",
    title: "Landed Cost",
    items: [
      { label: "Goods Value (sum of lines)", value: fmtMoney(goodsValue, i.currency) },
      { label: "Freight + Insurance + Other", value: fmtMoney(i.freight + i.insurance + i.additional, i.currency) },
      { label: "CIF Value", value: fmtMoney(cif, i.currency) },
      { label: "Total Customs Duty", value: fmtMoney(totalDuty, i.currency) },
      { label: `${i.gstRate}% GST/VAT on (CIF + Duty)`, value: fmtMoney(gst, i.currency) },
      {
        label: "Total Landed Cost" + fxHint(total),
        value: fmtMoney(total, i.currency),
        highlight: true,
      },
      ...(totalQty > 0
        ? [{ label: "Avg. Per Unit Cost", value: fmtMoney(perUnit, i.currency) }]
        : []),
    ],
    text:
      `Landed Cost (${i.currency})\n` +
      `${(i.lines ?? []).length} line item(s) • Goods: ${fmtMoney(goodsValue, i.currency)}\n` +
      `Duty: ${fmtMoney(totalDuty, i.currency)} | GST/VAT: ${fmtMoney(gst, i.currency)}\n` +
      `Total Landed Cost: ${fmtMoney(total, i.currency)}`,
    lines: {
      headers: ["Description", "HS Code", "Qty", "Unit Value", "Subtotal", "Duty %", "Duty"],
      rows: lineRows,
    },
  };
}

/* ---------------- Export Price (multi-line) ---------------- */
export interface ExportInput {
  lines: CargoLine[];
  freight: number;
  insurance: number;
  additional: number;
  currency: string;
  fxRate?: number;
  baseCurrency?: string;
}

export function calcExport(i: ExportInput): CalcResult {
  const lineRows: string[][] = [];
  let totalCost = 0;
  let totalQty = 0;
  // First pass: per-line cost share
  const baseCosts: number[] = (i.lines ?? []).map((ln) => ln.qty * ln.unitValue);
  totalCost = baseCosts.reduce((a, b) => a + b, 0);
  totalQty = (i.lines ?? []).reduce((a, b) => a + b.qty, 0);

  const sharedFI = i.freight + i.insurance + i.additional;

  let totalFob = 0;
  let totalCif = 0;
  let totalSelling = 0;

  (i.lines ?? []).forEach((ln, idx) => {
    const lineCost = baseCosts[idx];
    const share = totalCost > 0 ? lineCost / totalCost : 0;
    const lineFI = sharedFI * share;
    const lineFob = lineCost + i.freight * share + i.additional * share;
    const lineCif = lineFob + i.insurance * share;
    const lineSelling = lineCif * (1 + (ln.margin ?? 0) / 100);
    totalFob += lineFob;
    totalCif += lineCif;
    totalSelling += lineSelling;
    lineRows.push([
      ln.description || "—",
      ln.hsCode || "—",
      fmtInt(ln.qty),
      fmtMoney(ln.unitValue, i.currency),
      fmtMoney(lineCost, i.currency),
      fmtMoney(lineFI, i.currency),
      `${fmt(ln.margin ?? 0, 2)}%`,
      fmtMoney(lineSelling, i.currency),
    ]);
  });

  const profit = totalSelling - totalCost;
  const blendedMargin = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const perUnit = totalQty > 0 ? totalSelling / totalQty : 0;

  const fx = i.fxRate && i.fxRate > 0 ? i.fxRate : 0;
  const base = i.baseCurrency || "INR";
  const fxHint = (n: number) => (fx > 0 ? ` (≈ ${base} ${fmt(n * fx, 2)})` : "");

  return {
    type: "export",
    title: "Export Price",
    items: [
      { label: "Total Cost (sum of lines)", value: fmtMoney(totalCost, i.currency) },
      { label: "Total FOB", value: fmtMoney(totalFob, i.currency) },
      { label: "Total CIF", value: fmtMoney(totalCif, i.currency) },
      {
        label: "Total Selling Price" + fxHint(totalSelling),
        value: fmtMoney(totalSelling, i.currency),
        highlight: true,
      },
      { label: "Total Profit", value: fmtMoney(profit, i.currency) },
      { label: "Blended Margin", value: `${fmt(blendedMargin, 2)} %` },
      ...(totalQty > 0
        ? [{ label: "Avg. Per Unit Selling Price", value: fmtMoney(perUnit, i.currency) }]
        : []),
    ],
    text:
      `Export Price (${i.currency})\n` +
      `${(i.lines ?? []).length} line item(s) • Cost: ${fmtMoney(totalCost, i.currency)}\n` +
      `FOB: ${fmtMoney(totalFob, i.currency)} | CIF: ${fmtMoney(totalCif, i.currency)}\n` +
      `Selling: ${fmtMoney(totalSelling, i.currency)} | Profit: ${fmtMoney(profit, i.currency)}`,
    lines: {
      headers: ["Description", "HS Code", "Qty", "Unit Cost", "Line Cost", "F+I Share", "Margin %", "Selling"],
      rows: lineRows,
    },
  };
}

/* ---------------- Air vs Sea Compare ---------------- */
export interface CompareInput {
  seaFreight: number;
  seaDays: number;
  airFreight: number;
  airDays: number;
  dailyRate: number;
  productValue: number;
  handling: number;
}

export function calcCompare(i: CompareInput): CalcResult {
  const seaInterest = i.productValue * (i.dailyRate / 100) * i.seaDays;
  const airInterest = i.productValue * (i.dailyRate / 100) * i.airDays;
  const seaTotal = i.seaFreight + seaInterest + i.handling;
  const airTotal = i.airFreight + airInterest + i.handling;
  const cheaper = airTotal < seaTotal ? "Air" : "Sea";
  const savings = Math.abs(seaTotal - airTotal);
  const daysSaved = i.seaDays - i.airDays;
  const timeValue = i.productValue * (i.dailyRate / 100) * Math.max(0, daysSaved);

  return {
    type: "compare",
    title: "Air vs Sea Comparison",
    items: [
      { label: "Sea Total Cost", value: fmtMoney(seaTotal) },
      { label: "Air Total Cost", value: fmtMoney(airTotal) },
      { label: "Days Saved by Air", value: `${fmtInt(daysSaved)} days` },
      { label: "Working-capital Time Value", value: fmtMoney(timeValue) },
      {
        label: "Cheaper Option",
        value: `${cheaper} (saves ${fmtMoney(savings)})`,
        highlight: true,
      },
    ],
    text:
      `Air vs Sea\n` +
      `Sea Total: ${fmtMoney(seaTotal)} (${i.seaDays} days)\n` +
      `Air Total: ${fmtMoney(airTotal)} (${i.airDays} days)\n` +
      `Cheaper: ${cheaper} by ${fmtMoney(savings)}`,
  };
}

/* ---------------- Risk & Demurrage ---------------- */
export interface RiskInput {
  containerType: string;
  daysAtPort: number;
  dailyRate: number;
  goodsValue: number;
  insurance: number;
  port: string;
  cargoType: string;
  freeDays: number;
}

export function calcRisk(i: RiskInput): CalcResult {
  const chargeableDays = Math.max(0, i.daysAtPort - i.freeDays);
  const demurrage = chargeableDays * i.dailyRate;
  const exposure = Math.max(0, i.goodsValue - i.insurance);
  const exposurePct = i.goodsValue > 0 ? (exposure / i.goodsValue) * 100 : 0;
  const recommendedInsurance = i.goodsValue * 1.1;

  let risk: "Low" | "Medium" | "High" = "Low";
  if (exposurePct > 50 || chargeableDays > 10) risk = "High";
  else if (exposurePct > 15 || chargeableDays > 3) risk = "Medium";

  const totalCost = demurrage + exposure * 0.05;

  return {
    type: "risk",
    title: "Risk & Demurrage",
    items: [
      { label: "Free Days", value: `${fmtInt(i.freeDays)} days` },
      { label: "Chargeable Days", value: `${fmtInt(chargeableDays)} days` },
      { label: "Demurrage Charges", value: fmtMoney(demurrage), highlight: true },
      { label: "Uninsured Exposure", value: fmtMoney(exposure) },
      { label: "Recommended Insurance", value: fmtMoney(recommendedInsurance) },
      { label: "Risk Level", value: risk, highlight: true },
      { label: "Estimated Total Cost", value: fmtMoney(totalCost) },
    ],
    text:
      `Demurrage & Risk (${i.port || "—"})\n` +
      `Container: ${i.containerType} | Cargo: ${i.cargoType}\n` +
      `Demurrage: ${fmtMoney(demurrage)} (${chargeableDays} chargeable days)\n` +
      `Risk Level: ${risk}`,
  };
}
