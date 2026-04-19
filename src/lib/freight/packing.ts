/**
 * Container packing utilities — Searates-style indicative load planner.
 * Pure JS, deterministic, SSR-safe. No dependencies.
 */

import type { CbmItem } from "./calculators";

export interface ContainerPreset {
  id: "20gp" | "40gp" | "40hc";
  name: string;
  /** Inner dimensions in mm: length, width, height */
  inner: { l: number; w: number; h: number };
  /** Real-world stowable cap in m³ (not theoretical inner volume). */
  capCbm: number;
  maxPayloadKg: number;
}

export const CONTAINERS: ContainerPreset[] = [
  {
    id: "20gp",
    name: "20ft GP",
    inner: { l: 5900, w: 2352, h: 2393 },
    capCbm: 30,
    maxPayloadKg: 28000,
  },
  {
    id: "40gp",
    name: "40ft GP",
    inner: { l: 12032, w: 2352, h: 2393 },
    capCbm: 60,
    maxPayloadKg: 26500,
  },
  {
    id: "40hc",
    name: "40ft HC",
    inner: { l: 12032, w: 2352, h: 2700 },
    capCbm: 70,
    maxPayloadKg: 26500,
  },
];

/** Searates-style palette — distinct, accessible. */
export const ITEM_COLORS = [
  "#10b9a6", // teal
  "#f97316", // orange
  "#8b5cf6", // purple
  "#3b82f6", // blue
  "#ec4899", // pink
  "#eab308", // yellow
  "#06b6d4", // cyan
  "#84cc16", // lime
];

export interface PlacedBox {
  /** mm coordinates inside the container (origin = back-left-floor). */
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  color: string;
  itemIdx: number;
}

export interface PackResult {
  container: ContainerPreset;
  placed: PlacedBox[];
  totalCartons: number;
  placedCartons: number;
  truncated: boolean; // rendering cap exceeded
  cargoCbm: number;
  weightKg: number;
  utilizationPct: number; // cargoCbm / capCbm
}

const RENDER_CAP = 200;

/**
 * Shelf-fit / FFD by volume.
 * Sort cartons largest-first, fill rows along length, wrap by width, stack layers by height.
 * Uses single orientation (input as-given). Indicative only.
 */
export function packContainer(
  items: CbmItem[],
  container: ContainerPreset,
): PackResult {
  // Expand items into individual cartons with item index for color.
  const cartons: Array<{ l: number; w: number; h: number; itemIdx: number }> = [];
  let cargoCbm = 0;
  let weightKg = 0;
  items.forEach((it, idx) => {
    if (it.length <= 0 || it.width <= 0 || it.height <= 0 || it.qty <= 0) return;
    const lmm = it.length * 10; // cm → mm
    const wmm = it.width * 10;
    const hmm = it.height * 10;
    const single = (it.length * it.width * it.height) / 1_000_000;
    cargoCbm += single * it.qty;
    weightKg += it.weight * it.qty;
    for (let i = 0; i < it.qty; i++) {
      cartons.push({ l: lmm, w: wmm, h: hmm, itemIdx: idx });
    }
  });

  // Largest first by volume.
  cartons.sort((a, b) => b.l * b.w * b.h - a.l * a.w * a.h);

  const placed: PlacedBox[] = [];
  const C = container.inner;

  let cursorX = 0; // along length
  let cursorY = 0; // along width
  let cursorZ = 0; // along height
  let rowDepth = 0; // current row's max width (along Y)
  let layerHeight = 0; // current layer's max height (along Z)

  let placedCount = 0;
  let truncated = false;

  for (const c of cartons) {
    // If carton can't fit container at all → skip.
    if (c.l > C.l || c.w > C.w || c.h > C.h) continue;

    // Wrap to next row (advance Y) if no length space left.
    if (cursorX + c.l > C.l) {
      cursorX = 0;
      cursorY += rowDepth;
      rowDepth = 0;
    }
    // Wrap to next layer (advance Z) if no width space left.
    if (cursorY + c.w > C.w) {
      cursorY = 0;
      cursorX = 0;
      cursorZ += layerHeight;
      rowDepth = 0;
      layerHeight = 0;
    }
    // No height left → can't place this or remaining.
    if (cursorZ + c.h > C.h) break;

    if (placed.length < RENDER_CAP) {
      placed.push({
        x: cursorX,
        y: cursorY,
        z: cursorZ,
        l: c.l,
        w: c.w,
        h: c.h,
        color: ITEM_COLORS[c.itemIdx % ITEM_COLORS.length],
        itemIdx: c.itemIdx,
      });
    } else {
      truncated = true;
    }

    placedCount++;
    cursorX += c.l;
    if (c.w > rowDepth) rowDepth = c.w;
    if (c.h > layerHeight) layerHeight = c.h;
  }

  return {
    container,
    placed,
    totalCartons: cartons.length,
    placedCartons: placedCount,
    truncated,
    cargoCbm,
    weightKg,
    utilizationPct: container.capCbm > 0 ? (cargoCbm / container.capCbm) * 100 : 0,
  };
}

/** Pick the smallest container that fits all cargo within stowable cap. */
export function pickOptimalContainer(cargoCbm: number): ContainerPreset {
  for (const c of CONTAINERS) {
    if (cargoCbm <= c.capCbm) return c;
  }
  return CONTAINERS[CONTAINERS.length - 1]; // largest
}

export interface MultiContainerPlan {
  units: Array<{ container: ContainerPreset; fillCbm: number; fillPct: number }>;
  totalCbm: number;
}

/**
 * Greedy split: fill 40HC repeatedly, then add smallest container that
 * accommodates the remainder.
 */
export function splitMultiContainer(cargoCbm: number): MultiContainerPlan {
  const hc = CONTAINERS.find((c) => c.id === "40hc")!;
  const units: MultiContainerPlan["units"] = [];
  let remaining = cargoCbm;

  while (remaining > hc.capCbm) {
    units.push({ container: hc, fillCbm: hc.capCbm, fillPct: 100 });
    remaining -= hc.capCbm;
  }
  if (remaining > 0) {
    const last = pickOptimalContainer(remaining);
    units.push({
      container: last,
      fillCbm: remaining,
      fillPct: (remaining / last.capCbm) * 100,
    });
  }
  return { units, totalCbm: cargoCbm };
}

export function totalCbm(items: CbmItem[]): number {
  let t = 0;
  for (const it of items) {
    t += ((it.length * it.width * it.height) / 1_000_000) * it.qty;
  }
  return t;
}

export function totalWeight(items: CbmItem[]): number {
  let t = 0;
  for (const it of items) t += it.weight * it.qty;
  return t;
}

export function totalQty(items: CbmItem[]): number {
  let t = 0;
  for (const it of items) t += it.qty;
  return t;
}
