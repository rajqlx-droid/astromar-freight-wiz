/**
 * Pure calculation helpers. No React, no DOM — easy to unit test.
 * All numbers are validated upstream; here we just compute.
 */

import type { CalcResult } from "./types";
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
  length: number;
  width: number;
  height: number;
  qty: number;
  weight: number;
  /** Optional advanced packing constraints. Defaults below when absent. */
  packageType?: PackageType;
  stackable?: boolean;
  fragile?: boolean;
  /** Max weight (kg) of cargo that may sit on top of one of these. 0 = unlimited. */
  maxStackWeightKg?: number;
  /** Packer may swap L↔W (yaw 90° on floor). */
  allowSidewaysRotation?: boolean;
  /** Packer may tip box onto its side (swap H with L or W). */
  allowAxisRotation?: boolean;
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

/* ---------------- Landed Cost ---------------- */
export interface LandedInput {
  product: number;
  freight: number;
  insurance: number;
  dutyRate: number;
  gstRate: number;
  additional: number;
  qty: number;
  currency: string;
}

export function calcLanded(i: LandedInput): CalcResult {
  const subtotal = i.product + i.freight + i.insurance + i.additional;
  const duty = subtotal * (i.dutyRate / 100);
  const gst = (subtotal + duty) * (i.gstRate / 100);
  const total = subtotal + duty + gst;
  const perUnit = i.qty > 0 ? total / i.qty : 0;

  return {
    type: "landed",
    title: "Landed Cost",
    items: [
      { label: "Subtotal (CIF + Add'l)", value: fmtMoney(subtotal, i.currency) },
      { label: `Customs Duty (${i.dutyRate}%)`, value: fmtMoney(duty, i.currency) },
      { label: `GST (${i.gstRate}%)`, value: fmtMoney(gst, i.currency) },
      { label: "Total Landed Cost", value: fmtMoney(total, i.currency), highlight: true },
      ...(i.qty > 0
        ? [{ label: "Per Unit Cost", value: fmtMoney(perUnit, i.currency) }]
        : []),
    ],
    text:
      `Landed Cost Breakdown\n` +
      `Subtotal: ${fmtMoney(subtotal, i.currency)}\n` +
      `Duty (${i.dutyRate}%): ${fmtMoney(duty, i.currency)}\n` +
      `GST (${i.gstRate}%): ${fmtMoney(gst, i.currency)}\n` +
      `Total Landed Cost: ${fmtMoney(total, i.currency)}`,
  };
}

/* ---------------- Export Price ---------------- */
export interface ExportInput {
  cost: number;
  freight: number;
  insurance: number;
  margin: number;
  additional: number;
  qty: number;
  currency: string;
}

export function calcExport(i: ExportInput): CalcResult {
  const fob = i.cost + i.freight + i.additional;
  const cif = fob + i.insurance;
  const selling = cif * (1 + i.margin / 100);
  const profit = selling - i.cost;
  const realMargin = i.cost > 0 ? (profit / i.cost) * 100 : 0;
  const perUnit = i.qty > 0 ? selling / i.qty : 0;

  return {
    type: "export",
    title: "Export Price",
    items: [
      { label: "FOB Price", value: fmtMoney(fob, i.currency) },
      { label: "CIF Price", value: fmtMoney(cif, i.currency) },
      { label: "Selling Price", value: fmtMoney(selling, i.currency), highlight: true },
      { label: "Profit", value: fmtMoney(profit, i.currency) },
      { label: "Effective Margin", value: `${fmt(realMargin, 2)} %` },
      ...(i.qty > 0
        ? [{ label: "Per Unit Selling Price", value: fmtMoney(perUnit, i.currency) }]
        : []),
    ],
    text:
      `Export Price\n` +
      `FOB: ${fmtMoney(fob, i.currency)} | CIF: ${fmtMoney(cif, i.currency)}\n` +
      `Selling: ${fmtMoney(selling, i.currency)} | Profit: ${fmtMoney(profit, i.currency)}`,
  };
}

/* ---------------- Air vs Sea Compare ---------------- */
export interface CompareInput {
  seaFreight: number;
  seaDays: number;
  airFreight: number;
  airDays: number;
  dailyRate: number; // % per day on product value (working capital)
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

  const totalCost = demurrage + exposure * 0.05; // 5% expected loss factor

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
      `Demurrage & Risk (${i.port})\n` +
      `Container: ${i.containerType} | Cargo: ${i.cargoType}\n` +
      `Demurrage: ${fmtMoney(demurrage)} (${chargeableDays} chargeable days)\n` +
      `Risk Level: ${risk}`,
  };
}
