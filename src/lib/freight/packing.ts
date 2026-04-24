/**
 * Container packing utilities — Searates-style indicative load planner.
 * Pure JS, deterministic, SSR-safe. No dependencies.
 */

import type { CbmItem } from "./calculators";
import { packContainerAdvanced } from "./packing-advanced";

export interface ContainerPreset {
  id: "20gp" | "40gp" | "40hc";
  name: string;
  /** Inner dimensions in mm: length, width, height */
  inner: { l: number; w: number; h: number };
  /** Real-world stowable cap in m³ (not theoretical inner volume). */
  capCbm: number;
  maxPayloadKg: number;
}

// Geometric CBM = inner L × W × H (m³), rounded to 2 dp.
// 20GP: 5.900 × 2.352 × 2.395 = 33.23 m³
// 40GP: 12.032 × 2.352 × 2.395 = 67.78 m³
// 40HC: 12.032 × 2.350 × 2.700 = 76.34 m³
export const CONTAINERS: ContainerPreset[] = [
  { id: "20gp", name: "20ft GP", inner: { l: 5900, w: 2352, h: 2395 }, capCbm: 33.23, maxPayloadKg: 28000 },
  { id: "40gp", name: "40ft GP", inner: { l: 12032, w: 2352, h: 2395 }, capCbm: 67.78, maxPayloadKg: 26500 },
  { id: "40hc", name: "40ft HC", inner: { l: 12032, w: 2350, h: 2700 }, capCbm: 76.34, maxPayloadKg: 26500 },
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
  /**
   * Orientation flag — set when the packer chose a non-original orientation:
   *  - "sideways": L↔W swapped (rotated 90° around vertical axis)
   *  - "axis":     box tipped onto its side (height swapped with L or W)
   *  - null:       original orientation
   */
  rotated?: "sideways" | "axis" | null;
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

const RENDER_CAP = 500;
const CELL_MM = 100;
const SUPPORT_MIN_RATIO = 0.9;
const PLACE_STEP_MM = 100;

/**
 * Support-aware skyline packer.
 * Quantises floor into ~100mm cells and rests each carton on the actual
 * top-Z of cells under its footprint — eliminates floating boxes.
 * Single orientation (input as-given). Indicative only.
 */
export function packContainer(
  items: CbmItem[],
  container: ContainerPreset,
): PackResult {
  const cartons: Array<{ l: number; w: number; h: number; itemIdx: number }> = [];
  let cargoCbm = 0;
  let weightKg = 0;
  items.forEach((it, idx) => {
    if (it.length <= 0 || it.width <= 0 || it.height <= 0 || it.qty <= 0) return;
    const lmm = it.length * 10;
    const wmm = it.width * 10;
    const hmm = it.height * 10;
    const single = (it.length * it.width * it.height) / 1_000_000;
    cargoCbm += single * it.qty;
    weightKg += it.weight * it.qty;
    for (let i = 0; i < it.qty; i++) {
      cartons.push({ l: lmm, w: wmm, h: hmm, itemIdx: idx });
    }
  });

  // Largest first by volume → better packing.
  cartons.sort((a, b) => b.l * b.w * b.h - a.l * a.w * a.h);

  // Score weights: x (back-to-front) dominates, then z (build up), then y (side).
  // A 100mm advance forward outweighs the tallest stack at the same x slot, so
  // the back wall is fully filled (floor → ceiling, side → side) before the
  // packer moves toward the door. Mirrors packing-advanced.ts.

  const placed: PlacedBox[] = [];
  const C = container.inner;
  const cellsX = Math.ceil(C.l / CELL_MM);
  const cellsY = Math.ceil(C.w / CELL_MM);
  const heightMap = new Float32Array(cellsX * cellsY);
  const cellIdx = (cx: number, cy: number) => cy * cellsX + cx;

  let placedCount = 0;
  let truncated = false;

  for (const c of cartons) {
    if (c.l > C.l || c.w > C.w || c.h > C.h) continue;

    let bestScore = Infinity;
    let bestX = -1;
    let bestY = -1;
    let bestZ = 0;

    const stepX = Math.min(PLACE_STEP_MM, Math.max(50, Math.floor(c.l / 4)));
    const stepY = Math.min(PLACE_STEP_MM, Math.max(50, Math.floor(c.w / 4)));

    for (let y = 0; y + c.w <= C.w; y += stepY) {
      for (let x = 0; x + c.l <= C.l; x += stepX) {
        const cx0 = Math.floor(x / CELL_MM);
        const cy0 = Math.floor(y / CELL_MM);
        const cx1 = Math.ceil((x + c.l) / CELL_MM);
        const cy1 = Math.ceil((y + c.w) / CELL_MM);

        let topZ = 0;
        for (let cy = cy0; cy < cy1; cy++) {
          for (let cx = cx0; cx < cx1; cx++) {
            const h = heightMap[cellIdx(cx, cy)];
            if (h > topZ) topZ = h;
          }
        }
        if (topZ + c.h > C.h) continue;

        let supported = 0;
        let total = 0;
        for (let cy = cy0; cy < cy1; cy++) {
          for (let cx = cx0; cx < cx1; cx++) {
            total++;
            if (Math.abs(heightMap[cellIdx(cx, cy)] - topZ) < 1) supported++;
          }
        }
        if (topZ > 0 && total > 0 && supported / total < SUPPORT_MIN_RATIO) continue;

        const score = x * 10_000 + topZ * 100 + y * 0.1;
        if (score < bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
          bestZ = topZ;
        }
      }
    }

    if (bestX < 0) continue;

    if (placed.length < RENDER_CAP) {
      placed.push({
        x: bestX,
        y: bestY,
        z: bestZ,
        l: c.l,
        w: c.w,
        h: c.h,
        color: ITEM_COLORS[c.itemIdx % ITEM_COLORS.length],
        itemIdx: c.itemIdx,
      });
    } else {
      truncated = true;
    }

    const cx0 = Math.floor(bestX / CELL_MM);
    const cy0 = Math.floor(bestY / CELL_MM);
    const cx1 = Math.ceil((bestX + c.l) / CELL_MM);
    const cy1 = Math.ceil((bestY + c.w) / CELL_MM);
    const newTop = bestZ + c.h;
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        heightMap[cellIdx(cx, cy)] = newTop;
      }
    }

    placedCount++;
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

/**
 * Pick the smallest container that fits all cargo, capped at 40HC.
 *
 * Geometry-aware overload: when called with `items`, runs the 3D packer
 * against each container (smallest → largest) and returns the smallest one
 * that physically places every piece. Falls back to the 40HC (the maximum
 * supported container) when no preset can hold the load — the recommender
 * will then surface a "cargo shut out" report for the overflow.
 *
 * Legacy CBM-only call signature `pickOptimalContainer(cargoCbm: number)`
 * is preserved for backwards compatibility.
 */
export function pickOptimalContainer(cargoCbm: number): ContainerPreset;
export function pickOptimalContainer(items: CbmItem[]): ContainerPreset;
export function pickOptimalContainer(arg: number | CbmItem[]): ContainerPreset {
  const HC = CONTAINERS.find((c) => c.id === "40hc")!;
  if (typeof arg === "number") {
    for (const c of CONTAINERS) {
      if (arg <= c.capCbm) return c;
    }
    return HC;
  }
  const items = arg;
  let totalQty = 0;
  let cbm = 0;
  for (const it of items) {
    totalQty += it.qty;
    cbm += ((it.length * it.width * it.height) / 1_000_000) * it.qty;
  }
  if (totalQty === 0) return CONTAINERS[0];

  for (const c of CONTAINERS) {
    if (cbm > c.capCbm * 1.05) continue;
    const pack = packContainerAdvanced(items, c);
    if (pack.placedCartons >= totalQty) return c;
  }
  // Cap at 40HC — anything more is reported as cargo shut-out by the recommender.
  return HC;
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
