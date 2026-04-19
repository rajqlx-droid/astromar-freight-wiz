/**
 * Advanced container packing with stackable / fragile / max-stack-weight
 * constraints and multi-orientation try. Pure JS, deterministic, SSR-safe.
 *
 * Output shape is a superset of the simple packer: it adds per-item
 * placement stats so the UI can show "X of Y placed".
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

interface ExpandedCarton {
  l: number; // mm
  w: number; // mm
  h: number; // mm
  weight: number; // kg
  itemIdx: number;
  itemId: string;
  packageType: PackageType;
  stackable: boolean;
  fragile: boolean;
  maxStackWeightKg: number;
  /** Orientation index used (0..2). */
  orient: number;
}

/** Three useful orientations: as-is, swap L<->W, lay on side (W<->H). */
function orientations(l: number, w: number, h: number) {
  return [
    { l, w, h, orient: 0 },
    { l: w, w: l, h, orient: 1 },
    { l, w: h, h: w, orient: 2 },
  ];
}

export function packContainerAdvanced(
  items: CbmItem[],
  container: ContainerPreset,
): AdvancedPackResult {
  const C = container.inner;

  // Build expanded carton list, defaulting missing flags.
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

    // Pick best orientation that fits the container; prefer flat (smallest h).
    const orientsList = orientations(lmm, wmm, hmm).filter(
      (o) => o.l <= C.l && o.w <= C.w && o.h <= C.h,
    );
    if (orientsList.length === 0) {
      perItemReason[idx] = "Carton larger than container — won't fit any orientation";
      return;
    }
    orientsList.sort((a, b) => a.h - b.h); // shortest first → lower COG
    const best = orientsList[0];

    const stackable = it.stackable !== false;
    const fragile = it.fragile === true;
    for (let i = 0; i < it.qty; i++) {
      expanded.push({
        l: best.l,
        w: best.w,
        h: best.h,
        weight: it.weight,
        itemIdx: idx,
        itemId: it.id,
        packageType: it.packageType ?? "carton",
        stackable,
        fragile,
        maxStackWeightKg: it.maxStackWeightKg ?? 0,
        orient: best.orient,
      });
    }
  });

  // Sort: non-stackable first (need floor), then heaviest, then largest volume.
  // Fragile last so they end up on top.
  expanded.sort((a, b) => {
    if (a.fragile !== b.fragile) return a.fragile ? 1 : -1;
    if (a.stackable !== b.stackable) return a.stackable ? 1 : -1;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return b.l * b.w * b.h - a.l * a.w * a.h;
  });

  const placed: PlacedBox[] = [];
  let placedCount = 0;
  let truncated = false;

  // Shelf-pack with layer logic + non-stackable column reservation.
  let cursorX = 0;
  let cursorY = 0;
  let cursorZ = 0;
  let rowDepth = 0;
  let layerHeight = 0;
  
  // Sum of weight currently sitting at each (x,y) column — only used for
  // max-stack-weight checks against the lowest box of that column.
  // Key = "x,y" of base box.
  const columnBaseInfo = new Map<string, { maxStackWeightKg: number; loadKg: number }>();

  for (const c of expanded) {
    if (c.l > C.l || c.w > C.w || c.h > C.h) {
      perItemReason[c.itemIdx] ||= "Larger than container";
      continue;
    }

    // Wrap to next row.
    if (cursorX + c.l > C.l) {
      cursorX = 0;
      cursorY += rowDepth;
      rowDepth = 0;
    }
    // Wrap to next layer.
    if (cursorY + c.w > C.w) {
      cursorY = 0;
      cursorX = 0;
      cursorZ += layerHeight;
      rowDepth = 0;
      layerHeight = 0;
    }
    // No height left.
    if (cursorZ + c.h > C.h) {
      perItemReason[c.itemIdx] ||= "Container full — exceeds height after stacking";
      continue;
    }

    // Non-stackable items must sit on the floor (cursorZ === 0).
    if (!c.stackable && cursorZ > 0) {
      perItemReason[c.itemIdx] ||= "Non-stackable — no floor space remaining";
      continue;
    }

    // Max-stack-weight check: if we're stacking on top of another column, ensure
    // the bottom box can support cumulative load.
    if (cursorZ > 0) {
      const key = `${cursorX},${cursorY}`;
      const base = columnBaseInfo.get(key);
      if (base && base.maxStackWeightKg > 0 && base.loadKg + c.weight > base.maxStackWeightKg) {
        perItemReason[c.itemIdx] ||= "Exceeds max stack weight of item below";
        continue;
      }
      if (base) base.loadKg += c.weight;
    } else {
      const key = `${cursorX},${cursorY}`;
      if (!columnBaseInfo.has(key)) {
        columnBaseInfo.set(key, {
          maxStackWeightKg: c.maxStackWeightKg,
          loadKg: 0,
        });
      }
    }

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
    perItemPlaced[c.itemIdx]++;
    cursorX += c.l;
    if (c.w > rowDepth) rowDepth = c.w;
    if (c.h > layerHeight) layerHeight = c.h;
  }

  // Compute COG along container length (X axis).
  let totWeight = 0;
  let weightedX = 0;
  for (const p of placed) {
    const w = items[p.itemIdx]?.weight ?? 0;
    const cx = p.x + p.l / 2;
    weightedX += cx * w;
    totWeight += w;
  }
  const cog = totWeight > 0 ? weightedX / totWeight : C.l / 2;
  const cogOffsetPct = (cog - C.l / 2) / (C.l / 2); // -1..1

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
