/**
 * Advanced container packing — support-aware skyline packer.
 *
 * Replaces the old shelf-fit cursor algorithm. Maintains a quantised
 * height-map of the container floor and rests every new box on the actual
 * top-Z of cells under its footprint, which eliminates floating boxes.
 *
 * Honours per-item flags:
 *  - stackable / fragile / maxStackWeightKg
 *  - allowSidewaysRotation (swap L↔W)
 *  - allowAxisRotation     (tip onto side, swap H with L or W)
 *
 * Pure JS, deterministic, SSR-safe. No dependencies.
 */

import type { CbmItem, PackageType } from "./calculators";
import { CONTAINERS, ITEM_COLORS, type ContainerPreset, type PlacedBox } from "./packing";

export interface ItemPlacementStat {
  itemIdx: number;
  itemId: string;
  packageType: PackageType;
  color: string;
  planned: number;
  placed: number;
  unplaced: number;
  reason?: string;
  stackable: boolean;
  fragile: boolean;
}

export interface AdvancedPackResult {
  container: ContainerPreset;
  placed: PlacedBox[];
  totalCartons: number;
  placedCartons: number;
  truncated: boolean;
  cargoCbm: number;
  weightKg: number;
  utilizationPct: number;
  weightUtilizationPct: number;
  perItem: ItemPlacementStat[];
  /** -1..1 along container length. 0 = centered, +ve = forward (door side). */
  cogOffsetPct: number;
}

const RENDER_CAP = 500;
const CELL_MM = 100; // 10cm grid — good resolution vs. perf
const SUPPORT_MIN_RATIO = 0.9; // ≥ 90% footprint must rest on something solid
const PLACE_STEP_MM = 100; // candidate XY scan stride

interface ExpandedCarton {
  /** Original (un-rotated) dimensions in mm. */
  origL: number;
  origW: number;
  origH: number;
  weight: number;
  itemIdx: number;
  itemId: string;
  packageType: PackageType;
  stackable: boolean;
  fragile: boolean;
  maxStackWeightKg: number;
  allowSidewaysRotation: boolean;
  allowAxisRotation: boolean;
}

interface Orientation {
  l: number;
  w: number;
  h: number;
}

function buildOrientations(c: ExpandedCarton): Orientation[] {
  const { origL: l, origW: w, origH: h } = c;
  const list: Orientation[] = [{ l, w, h }];
  if (c.allowSidewaysRotation && (l !== w)) list.push({ l: w, w: l, h });
  if (c.allowAxisRotation && !c.fragile) {
    if (h !== w) list.push({ l, w: h, h: w });
    if (h !== l) list.push({ l: h, w, h: l });
    if (c.allowSidewaysRotation) {
      if (h !== l) list.push({ l: w, w: h, h: l });
      if (h !== w) list.push({ l: h, w: l, h: w });
    }
  }
  return list;
}

interface PlacedInternal extends PlacedBox {
  weight: number;
  fragile: boolean;
  maxStackWeightKg: number;
  /** Cumulative weight currently sitting on top of this box. */
  loadKg: number;
  /** True if a fragile box is on top — nothing more may be stacked on this column. */
  sealed: boolean;
}

export function packContainerAdvanced(
  items: CbmItem[],
  container: ContainerPreset,
): AdvancedPackResult {
  const C = container.inner;

  const expanded: ExpandedCarton[] = [];
  let cargoCbm = 0;
  let totalWeight = 0;

  const perItemPlanned: number[] = items.map(() => 0);
  const perItemPlaced: number[] = items.map(() => 0);
  const perItemReason: (string | undefined)[] = items.map(() => undefined);

  items.forEach((it, idx) => {
    if (it.length <= 0 || it.width <= 0 || it.height <= 0 || it.qty <= 0) return;
    const lmm = it.length * 10;
    const wmm = it.width * 10;
    const hmm = it.height * 10;
    perItemPlanned[idx] = it.qty;
    cargoCbm += ((it.length * it.width * it.height) / 1_000_000) * it.qty;
    totalWeight += it.weight * it.qty;

    const stackable = it.stackable !== false;
    const fragile = it.fragile === true;
    const allowSideways = it.allowSidewaysRotation !== false; // default true
    const allowAxis = it.allowAxisRotation === true;

    for (let i = 0; i < it.qty; i++) {
      expanded.push({
        origL: lmm,
        origW: wmm,
        origH: hmm,
        weight: it.weight,
        itemIdx: idx,
        itemId: it.id,
        packageType: it.packageType ?? "carton",
        stackable,
        fragile,
        maxStackWeightKg: it.maxStackWeightKg ?? 0,
        allowSidewaysRotation: allowSideways,
        allowAxisRotation: allowAxis,
      });
    }
  });

  // Sort: non-stackable first (need floor), heaviest, largest. Fragile last (top).
  expanded.sort((a, b) => {
    if (a.fragile !== b.fragile) return a.fragile ? 1 : -1;
    if (a.stackable !== b.stackable) return a.stackable ? 1 : -1;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return b.origL * b.origW * b.origH - a.origL * a.origW * a.origH;
  });

  // Skyline grid (top-Z per cell, in mm).
  const cellsX = Math.ceil(C.l / CELL_MM);
  const cellsY = Math.ceil(C.w / CELL_MM);
  const heightMap = new Float32Array(cellsX * cellsY);
  // Index of placed box currently topping each cell (-1 = floor).
  const topBoxIdx = new Int32Array(cellsX * cellsY).fill(-1);
  // Cells under a fragile or fragile-supported column are sealed.
  const sealed = new Uint8Array(cellsX * cellsY);

  const placedInternal: PlacedInternal[] = [];
  let placedCount = 0;
  let truncated = false;

  const cellIdx = (cx: number, cy: number) => cy * cellsX + cx;

  /** Inspect cells under footprint at (x,y) with size (l,w). Returns null if invalid. */
  function evaluatePlacement(
    x: number,
    y: number,
    l: number,
    w: number,
    c: ExpandedCarton,
  ): {
    z: number;
    supportRatio: number;
    supporters: Set<number>;
    anySealed: boolean;
  } | null {
    if (x < 0 || y < 0 || x + l > C.l || y + w > C.w) return null;

    const cx0 = Math.floor(x / CELL_MM);
    const cy0 = Math.floor(y / CELL_MM);
    const cx1 = Math.ceil((x + l) / CELL_MM);
    const cy1 = Math.ceil((y + w) / CELL_MM);

    let topZ = 0;
    // First pass: find resting Z (max top under footprint).
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        const h = heightMap[cellIdx(cx, cy)];
        if (h > topZ) topZ = h;
      }
    }

    if (topZ + c.origH > C.h) {
      // Use orientation height (caller passed via l/w but h via c.origH? — we recompute)
    }

    // Support: count cells whose top equals topZ (within 1mm tolerance).
    let supported = 0;
    let total = 0;
    let anySealed = false;
    const supporters = new Set<number>();
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        total++;
        const idx = cellIdx(cx, cy);
        if (sealed[idx]) anySealed = true;
        const h = heightMap[idx];
        if (Math.abs(h - topZ) < 1) {
          supported++;
          const bIdx = topBoxIdx[idx];
          if (bIdx >= 0) supporters.add(bIdx);
        }
      }
    }
    return {
      z: topZ,
      supportRatio: total > 0 ? supported / total : 0,
      supporters,
      anySealed,
    };
  }

  for (const c of expanded) {
    const orients = buildOrientations(c).filter(
      (o) => o.l <= C.l && o.w <= C.w && o.h <= C.h,
    );
    if (orients.length === 0) {
      perItemReason[c.itemIdx] ||= "Carton larger than container — won't fit any orientation";
      continue;
    }

    let bestScore = Infinity;
    let bestPick: {
      x: number;
      y: number;
      z: number;
      orient: Orientation;
      supporters: Set<number>;
    } | null = null;
    let lastReason: string | undefined;

    for (const o of orients) {
      // Candidate XY positions on a coarse grid.
      const stepX = Math.min(PLACE_STEP_MM, Math.max(50, Math.floor(o.l / 4)));
      const stepY = Math.min(PLACE_STEP_MM, Math.max(50, Math.floor(o.w / 4)));
      for (let y = 0; y + o.w <= C.w; y += stepY) {
        for (let x = 0; x + o.l <= C.l; x += stepX) {
          const ev = evaluatePlacement(x, y, o.l, o.w, {
            ...c,
            origL: o.l,
            origW: o.w,
            origH: o.h,
          });
          if (!ev) continue;

          // Height fit?
          if (ev.z + o.h > C.h) {
            lastReason ||= "Container full — exceeds height after stacking";
            continue;
          }
          // Non-stackable must rest on the floor.
          if (!c.stackable && ev.z > 0) {
            lastReason ||= "Non-stackable — no floor space remaining";
            continue;
          }
          // Sealed (fragile) cells block further stacking.
          if (ev.anySealed) {
            lastReason ||= "Cannot stack on fragile item below";
            continue;
          }
          // Support ratio.
          if (ev.z > 0 && ev.supportRatio < SUPPORT_MIN_RATIO) {
            lastReason ||= "Insufficient support below";
            continue;
          }
          // Stack-weight: every supporter must be able to take +c.weight on top of its existing load.
          let weightOk = true;
          for (const sIdx of ev.supporters) {
            const s = placedInternal[sIdx];
            if (!s) continue;
            if (s.maxStackWeightKg > 0 && s.loadKg + c.weight > s.maxStackWeightKg) {
              weightOk = false;
              lastReason ||= "Exceeds max stack weight of item below";
              break;
            }
          }
          if (!weightOk) continue;

          // Score: lowest Z, then tightest to back-left (low x+y), then tightest fit.
          const score =
            ev.z * 1000 + (x + y) + (1 - ev.supportRatio) * 200;
          if (score < bestScore) {
            bestScore = score;
            bestPick = { x, y, z: ev.z, orient: o, supporters: ev.supporters };
          }
        }
      }
    }

    if (!bestPick) {
      perItemReason[c.itemIdx] ||= lastReason || "Container full";
      continue;
    }

    const { x, y, z, orient, supporters } = bestPick;
    const internalIdx = placedInternal.length;
    const box: PlacedInternal = {
      x,
      y,
      z,
      l: orient.l,
      w: orient.w,
      h: orient.h,
      color: ITEM_COLORS[c.itemIdx % ITEM_COLORS.length],
      itemIdx: c.itemIdx,
      weight: c.weight,
      fragile: c.fragile,
      maxStackWeightKg: c.maxStackWeightKg,
      loadKg: 0,
      sealed: false,
    };
    placedInternal.push(box);

    // Update supporter loads.
    for (const sIdx of supporters) {
      const s = placedInternal[sIdx];
      if (s) s.loadKg += c.weight;
    }

    // Update height-map and topBoxIdx for footprint.
    const cx0 = Math.floor(x / CELL_MM);
    const cy0 = Math.floor(y / CELL_MM);
    const cx1 = Math.ceil((x + orient.l) / CELL_MM);
    const cy1 = Math.ceil((y + orient.w) / CELL_MM);
    const newTop = z + orient.h;
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        const idx = cellIdx(cx, cy);
        heightMap[idx] = newTop;
        topBoxIdx[idx] = internalIdx;
        if (c.fragile) sealed[idx] = 1;
      }
    }

    placedCount++;
    perItemPlaced[c.itemIdx]++;
  }

  // Render-cap truncation (rare with skyline since we score; just in case).
  let placed: PlacedBox[];
  if (placedInternal.length > RENDER_CAP) {
    truncated = true;
    placed = placedInternal.slice(0, RENDER_CAP).map((p) => ({
      x: p.x, y: p.y, z: p.z, l: p.l, w: p.w, h: p.h, color: p.color, itemIdx: p.itemIdx,
    }));
  } else {
    placed = placedInternal.map((p) => ({
      x: p.x, y: p.y, z: p.z, l: p.l, w: p.w, h: p.h, color: p.color, itemIdx: p.itemIdx,
    }));
  }

  // COG along container length (X axis).
  let totWeight = 0;
  let weightedX = 0;
  for (const p of placed) {
    const w = items[p.itemIdx]?.weight ?? 0;
    const cx = p.x + p.l / 2;
    weightedX += cx * w;
    totWeight += w;
  }
  const cog = totWeight > 0 ? weightedX / totWeight : C.l / 2;
  const cogOffsetPct = (cog - C.l / 2) / (C.l / 2);

  const perItem: ItemPlacementStat[] = items.map((it, idx) => {
    const planned = perItemPlanned[idx];
    const placedN = perItemPlaced[idx];
    return {
      itemIdx: idx,
      itemId: it.id,
      packageType: it.packageType ?? "carton",
      color: ITEM_COLORS[idx % ITEM_COLORS.length],
      planned,
      placed: placedN,
      unplaced: Math.max(0, planned - placedN),
      reason: planned > 0 && placedN < planned ? perItemReason[idx] || "Container full" : undefined,
      stackable: it.stackable !== false,
      fragile: it.fragile === true,
    };
  });

  return {
    container,
    placed,
    totalCartons: expanded.length,
    placedCartons: placedCount,
    truncated,
    cargoCbm,
    weightKg: totalWeight,
    utilizationPct: container.capCbm > 0 ? (cargoCbm / container.capCbm) * 100 : 0,
    weightUtilizationPct:
      container.maxPayloadKg > 0 ? (totalWeight / container.maxPayloadKg) * 100 : 0,
    perItem,
    cogOffsetPct,
  };
}

export { CONTAINERS };
