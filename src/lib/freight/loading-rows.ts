/**
 * Shared row-grouping logic for the row-by-row loading guide.
 * Used by both the on-screen panel and the PDF export so they stay in sync.
 */
import type { AdvancedPackResult } from "./packing-advanced";
import type { PlacedBox } from "./packing";

export interface RowGroup {
  rowIdx: number;
  xStart: number; // mm
  xEnd: number; // mm
  boxes: PlacedBox[];
  totalWeightKg: number;
  totalCbm: number;
  hasFragile: boolean;
  hasNonStack: boolean;
  rotatedCount: number;
  layers: number;
}

/**
 * Group placed boxes into rows along the container length (x-axis).
 * Two boxes belong to the same row when their x-spans overlap. Rows are
 * ordered back-to-front (lowest x first).
 */
export function buildRows(pack: AdvancedPackResult): RowGroup[] {
  if (pack.placed.length === 0) return [];

  const sorted = [...pack.placed].sort((a, b) => a.x - b.x);

  const rows: { boxes: PlacedBox[]; xStart: number; xEnd: number }[] = [];
  for (const b of sorted) {
    const bxEnd = b.x + b.l;
    const last = rows[rows.length - 1];
    if (last && b.x < last.xEnd - 1) {
      last.boxes.push(b);
      if (bxEnd > last.xEnd) last.xEnd = bxEnd;
    } else {
      rows.push({ boxes: [b], xStart: b.x, xEnd: bxEnd });
    }
  }

  return rows.map((r, i) => {
    let totalWeightKg = 0;
    let totalCbm = 0;
    let hasFragile = false;
    let hasNonStack = false;
    let rotatedCount = 0;
    const zLevels = new Set<number>();
    for (const b of r.boxes) {
      const stat = pack.perItem[b.itemIdx];
      totalCbm += (b.l * b.w * b.h) / 1_000_000_000;
      const placedOfItem = stat?.placed ?? 1;
      if (stat && placedOfItem > 0) {
        const itemSliceWeight =
          (pack.weightKg * (placedOfItem / (pack.placedCartons || 1))) / placedOfItem;
        totalWeightKg += itemSliceWeight;
      }
      if (stat?.fragile) hasFragile = true;
      if (stat && !stat.stackable) hasNonStack = true;
      if (b.rotated === "sideways" || b.rotated === "axis") rotatedCount++;
      zLevels.add(Math.round(b.z / 10) * 10);
    }
    return {
      rowIdx: i,
      xStart: r.xStart,
      xEnd: r.xEnd,
      boxes: r.boxes,
      totalWeightKg,
      totalCbm,
      hasFragile,
      hasNonStack,
      rotatedCount,
      layers: zLevels.size,
    };
  });
}

export function instructionFor(row: RowGroup): string {
  const parts: string[] = [];
  const total = row.boxes.length;
  if (row.layers > 1) {
    parts.push(
      `Push ${total} package${total > 1 ? "s" : ""} to back of row, build ${row.layers} layer${row.layers > 1 ? "s" : ""} bottom-up`,
    );
  } else {
    parts.push(`Push ${total} package${total > 1 ? "s" : ""} flat against the back of this row`);
  }
  if (row.hasFragile) parts.push("cap with fragile units last");
  if (row.hasNonStack) parts.push("leave no-stack items uncovered");
  if (row.rotatedCount > 0)
    parts.push(`rotate ${row.rotatedCount} unit${row.rotatedCount > 1 ? "s" : ""} as marked in 3D view`);
  return parts.join(", ") + ".";
}

/** Per-item count breakdown for a row. */
export function itemCountsForRow(row: RowGroup, pack: AdvancedPackResult) {
  const map = new Map<number, number>();
  for (const b of row.boxes) {
    map.set(b.itemIdx, (map.get(b.itemIdx) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([itemIdx, count]) => ({
      itemIdx,
      count,
      color: pack.perItem[itemIdx]?.color ?? "#888",
      packageType: pack.perItem[itemIdx]?.packageType ?? "carton",
    }));
}
