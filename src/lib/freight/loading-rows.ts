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
  /** True when fragile units share a multi-layer row with heavier non-fragile units — recommend a separator board between layers. */
  needsSeparator: boolean;
}

/** Average kg per package for a row (uses pack-level weight × box-share). */
const HEAVY_KG_PER_PKG_THRESHOLD = 25;


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

/**
 * Build a side-view SVG (as a string) for a single row.
 * View axis: looking down the container length toward the door.
 * Horizontal = container width, vertical = container height (floor at bottom).
 *
 * Returns a complete <svg>...</svg> markup with explicit hex colors so it
 * works in print HTML (no Tailwind/oklch) and can be rasterised for the PDF.
 *
 * Pass `themeColor` to override the outline color (default brand navy).
 */
export function buildRowSideViewSvg(
  row: RowGroup,
  pack: AdvancedPackResult,
  opts: { width?: number; height?: number; themeColor?: string } = {},
): string {
  const VIEW_W = opts.width ?? 220;
  const VIEW_H = opts.height ?? 90;
  const PAD = 4;
  const innerW = VIEW_W - PAD * 2;
  const innerH = VIEW_H - PAD * 2;
  const containerW = pack.container.inner.w;
  const containerH = pack.container.inner.h;
  const sx = innerW / containerW;
  const sy = innerH / containerH;
  const theme = opts.themeColor ?? "#1B3A6B";

  const boxes = row.boxes
    .map((b) => {
      const color = pack.perItem[b.itemIdx]?.color ?? "#888";
      const x = PAD + b.y * sx;
      const w = Math.max(b.w * sx, 1);
      const h = Math.max(b.h * sy, 1);
      const y = VIEW_H - PAD - (b.z + b.h) * sy;
      const tilted = b.rotated === "sideways" || b.rotated === "axis";
      const tilt =
        tilted && w > 10 && h > 10
          ? `<text x="${x + w / 2}" y="${y + h / 2 + 3}" font-size="8" font-weight="700" text-anchor="middle" fill="#854d0e">↻</text>`
          : "";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" fill-opacity="0.85" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>${tilt}`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="Side view of row ${row.rowIdx + 1}">
    <rect x="${PAD}" y="${PAD}" width="${innerW}" height="${innerH}" fill="#ffffff" stroke="${theme}" stroke-opacity="0.25" stroke-dasharray="3 3"/>
    <line x1="${PAD}" y1="${VIEW_H - PAD}" x2="${VIEW_W - PAD}" y2="${VIEW_H - PAD}" stroke="${theme}" stroke-opacity="0.45" stroke-width="1"/>
    ${boxes}
    <text x="${PAD + 2}" y="${PAD + 8}" font-size="7" fill="${theme}" fill-opacity="0.5">&#8592; width &#8594;</text>
    <text x="${PAD + 2}" y="${VIEW_H - PAD - 2}" font-size="7" fill="${theme}" fill-opacity="0.5">floor</text>
  </svg>`;
}

