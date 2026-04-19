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

/** Default kg-per-package cutoff above which a non-fragile unit is treated as "heavy". */
export const DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD = 25;


/**
 * Group placed boxes into rows along the container length (x-axis).
 * Two boxes belong to the same row when their x-spans overlap. Rows are
 * ordered back-to-front (lowest x first).
 *
 * `heavyThresholdKg` controls the kg/pkg cutoff used to flag mixed pallets
 * (fragile + heavy non-fragile sharing a multi-layer row). Defaults to 25 kg.
 */
export function buildRows(
  pack: AdvancedPackResult,
  heavyThresholdKg: number = DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD,
): RowGroup[] {
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
    let hasHeavyNonFragile = false;
    const zLevels = new Set<number>();
    for (const b of r.boxes) {
      const stat = pack.perItem[b.itemIdx];
      totalCbm += (b.l * b.w * b.h) / 1_000_000_000;
      const placedOfItem = stat?.placed ?? 1;
      if (stat && placedOfItem > 0) {
        const perPkg = stat.weightKgPerPkg ?? 0;
        if (perPkg > 0) {
          totalWeightKg += perPkg;
        } else {
          const itemSliceWeight =
            (pack.weightKg * (placedOfItem / (pack.placedCartons || 1))) / placedOfItem;
          totalWeightKg += itemSliceWeight;
        }
      }
      if (stat?.fragile) hasFragile = true;
      if (stat && !stat.stackable) hasNonStack = true;
      // A non-fragile box is "heavy" when its own per-package weight crosses
      // the threshold. (Previously used a row-wide average which masked a
      // single heavy item mixed with many light ones.)
      if (stat && !stat.fragile && (stat.weightKgPerPkg ?? 0) >= heavyThresholdKg) {
        hasHeavyNonFragile = true;
      }
      if (b.rotated === "sideways" || b.rotated === "axis") rotatedCount++;
      zLevels.add(Math.round(b.z / 10) * 10);
    }
    const layers = zLevels.size;
    // Recommend a separator board when fragile + heavy non-fragile share a
    // multi-layer row (anything could end up stacked on the fragile units).
    const needsSeparator = hasFragile && hasHeavyNonFragile && layers > 1;
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
      layers,
      needsSeparator,
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
  if (row.needsSeparator)
    parts.push("insert a separator board (plywood/cardboard) between heavy and fragile layers");
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="Door view of row ${row.rowIdx + 1}">
    <rect x="${PAD}" y="${PAD}" width="${innerW}" height="${innerH}" fill="#ffffff" stroke="${theme}" stroke-opacity="0.25" stroke-dasharray="3 3"/>
    <line x1="${PAD}" y1="${VIEW_H - PAD}" x2="${VIEW_W - PAD}" y2="${VIEW_H - PAD}" stroke="${theme}" stroke-opacity="0.45" stroke-width="1"/>
    ${boxes}
    <text x="${PAD + 2}" y="${PAD + 8}" font-size="7" fill="${theme}" fill-opacity="0.5">&#8592; width &#8594;</text>
    <text x="${PAD + 2}" y="${VIEW_H - PAD - 2}" font-size="7" fill="${theme}" fill-opacity="0.5">floor</text>
  </svg>`;
}

/**
 * Build a true side-view SVG (as a string) for a single row.
 * View axis: looking at the container from the side wall (perpendicular to length).
 * Horizontal = container length span used by this row, vertical = container height.
 *
 * Shows how boxes are distributed along the row's depth (x-axis) and stacked
 * vertically. Complements `buildRowSideViewSvg` (which is the door/end view).
 */
export function buildRowFrontViewSvg(
  row: RowGroup,
  pack: AdvancedPackResult,
  opts: { width?: number; height?: number; themeColor?: string } = {},
): string {
  const VIEW_W = opts.width ?? 220;
  const VIEW_H = opts.height ?? 90;
  const PAD = 4;
  const innerW = VIEW_W - PAD * 2;
  const innerH = VIEW_H - PAD * 2;
  // Row spans only a portion of container length — fit that span to the view.
  const rowLenSpan = Math.max(row.xEnd - row.xStart, 1);
  const containerH = pack.container.inner.h;
  const sx = innerW / rowLenSpan;
  const sy = innerH / containerH;
  const theme = opts.themeColor ?? "#1B3A6B";

  const boxes = row.boxes
    .map((b) => {
      const color = pack.perItem[b.itemIdx]?.color ?? "#888";
      const x = PAD + (b.x - row.xStart) * sx;
      const w = Math.max(b.l * sx, 1);
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
    <text x="${PAD + 2}" y="${PAD + 8}" font-size="7" fill="${theme}" fill-opacity="0.5">&#8592; depth &#8594;</text>
    <text x="${PAD + 2}" y="${VIEW_H - PAD - 2}" font-size="7" fill="${theme}" fill-opacity="0.5">floor</text>
  </svg>`;
}


/* ────────────────────────────────────────────────────────────────────────────
 * Row projection SVGs
 *
 * Three views are exported, all sharing the same layout primitives so they
 * print and rasterise identically:
 *
 *   • buildRowSideViewSvg  → Door view (W × H)     — looking in from door
 *   • buildRowFrontViewSvg → Side view (depth × H) — looking from side wall
 *   • buildRowTopViewSvg   → Top-down (W × depth)  — looking down from above
 *
 * Each SVG includes numeric cm rulers along the horizontal and vertical axes
 * so loaders can read actual stack dimensions on paper.
 * ──────────────────────────────────────────────────────────────────────────── */

const VIEW_THEME_DEFAULT = "#1B3A6B";
const RULER_TOP = 10; // px reserved at the top for horizontal ruler labels
const RULER_LEFT = 14; // px reserved at the left for vertical ruler labels
const RULER_PAD = 4; // breathing room between chart edge and SVG edge

/** Pick a "nice" tick step (cm) so we end up with ~4–7 labels across the axis. */
function niceTickStepCm(spanCm: number): number {
  if (spanCm <= 0) return 50;
  const target = spanCm / 5;
  const candidates = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const c of candidates) if (target <= c) return c;
  return 1000;
}

/** Render ruler ticks + labels for one axis as an SVG fragment. */
function rulerSvg(
  axis: "x" | "y",
  spanMm: number,
  chart: { x: number; y: number; w: number; h: number },
  theme: string,
): string {
  const spanCm = spanMm / 10;
  const step = niceTickStepCm(spanCm);
  const ticks: string[] = [];
  for (let cm = 0; cm <= spanCm + 0.001; cm += step) {
    const frac = spanCm === 0 ? 0 : cm / spanCm;
    const label = `${Math.round(cm)}`;
    if (axis === "x") {
      const px = chart.x + frac * chart.w;
      ticks.push(
        `<line x1="${px.toFixed(1)}" y1="${chart.y - 1}" x2="${px.toFixed(1)}" y2="${chart.y + 2}" stroke="${theme}" stroke-opacity="0.6" stroke-width="0.5"/>`,
        `<text x="${px.toFixed(1)}" y="${(chart.y - 2).toFixed(1)}" font-size="5.5" text-anchor="middle" fill="${theme}" fill-opacity="0.75">${label}</text>`,
      );
    } else {
      // y-axis: 0 at bottom, max at top
      const py = chart.y + chart.h - frac * chart.h;
      ticks.push(
        `<line x1="${chart.x - 2}" y1="${py.toFixed(1)}" x2="${chart.x + 1}" y2="${py.toFixed(1)}" stroke="${theme}" stroke-opacity="0.6" stroke-width="0.5"/>`,
        `<text x="${(chart.x - 3).toFixed(1)}" y="${(py + 1.8).toFixed(1)}" font-size="5.5" text-anchor="end" fill="${theme}" fill-opacity="0.75">${label}</text>`,
      );
    }
  }
  return ticks.join("");
}

/** Shared chrome (background, axes, rulers, axis labels) for a row projection. */
function projectionChrome(opts: {
  chart: { x: number; y: number; w: number; h: number };
  theme: string;
  spanXmm: number;
  spanYmm: number;
  xLabel: string;
  yLabel: string;
}): { open: string; close: string } {
  const { chart, theme, spanXmm, spanYmm, xLabel, yLabel } = opts;
  return {
    open: `<rect x="${chart.x}" y="${chart.y}" width="${chart.w}" height="${chart.h}" fill="#ffffff" stroke="${theme}" stroke-opacity="0.25" stroke-dasharray="3 3"/>
      <line x1="${chart.x}" y1="${chart.y + chart.h}" x2="${chart.x + chart.w}" y2="${chart.y + chart.h}" stroke="${theme}" stroke-opacity="0.45" stroke-width="1"/>
      ${rulerSvg("x", spanXmm, chart, theme)}
      ${rulerSvg("y", spanYmm, chart, theme)}`,
    close: `<text x="${chart.x + chart.w}" y="${(chart.y - 2).toFixed(1)}" font-size="5.5" text-anchor="end" fill="${theme}" fill-opacity="0.6">${xLabel} (cm)</text>
      <text x="${chart.x - 1}" y="${(chart.y + 4).toFixed(1)}" font-size="5.5" text-anchor="end" fill="${theme}" fill-opacity="0.6">${yLabel}</text>`,
  };
}

function makeChart(viewW: number, viewH: number) {
  return {
    x: RULER_LEFT,
    y: RULER_TOP,
    w: viewW - RULER_LEFT - RULER_PAD,
    h: viewH - RULER_TOP - RULER_PAD,
  };
}

/**
 * Door view (W × H) — looking down the container length toward the door.
 * Horizontal = container width, vertical = container height (floor at bottom).
 */
export function buildRowSideViewSvg(
  row: RowGroup,
  pack: AdvancedPackResult,
  opts: { width?: number; height?: number; themeColor?: string } = {},
): string {
  const VIEW_W = opts.width ?? 220;
  const VIEW_H = opts.height ?? 90;
  const theme = opts.themeColor ?? VIEW_THEME_DEFAULT;
  const chart = makeChart(VIEW_W, VIEW_H);
  const containerW = pack.container.inner.w;
  const containerH = pack.container.inner.h;
  const sx = chart.w / containerW;
  const sy = chart.h / containerH;

  const boxes = row.boxes
    .map((b) => {
      const color = pack.perItem[b.itemIdx]?.color ?? "#888";
      const x = chart.x + b.y * sx;
      const w = Math.max(b.w * sx, 1);
      const h = Math.max(b.h * sy, 1);
      const y = chart.y + chart.h - (b.z + b.h) * sy;
      const tilted = b.rotated === "sideways" || b.rotated === "axis";
      const tilt =
        tilted && w > 10 && h > 10
          ? `<text x="${x + w / 2}" y="${y + h / 2 + 3}" font-size="8" font-weight="700" text-anchor="middle" fill="#854d0e">↻</text>`
          : "";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" fill-opacity="0.85" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>${tilt}`;
    })
    .join("");

  const chrome = projectionChrome({
    chart,
    theme,
    spanXmm: containerW,
    spanYmm: containerH,
    xLabel: "width",
    yLabel: "H",
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="Door view of row ${row.rowIdx + 1}">
    ${chrome.open}
    ${boxes}
    ${chrome.close}
  </svg>`;
}

/**
 * Side view (depth × H) — looking at the container from the side wall.
 * Horizontal = container length span used by this row, vertical = container height.
 */
export function buildRowFrontViewSvg(
  row: RowGroup,
  pack: AdvancedPackResult,
  opts: { width?: number; height?: number; themeColor?: string } = {},
): string {
  const VIEW_W = opts.width ?? 220;
  const VIEW_H = opts.height ?? 90;
  const theme = opts.themeColor ?? VIEW_THEME_DEFAULT;
  const chart = makeChart(VIEW_W, VIEW_H);
  const rowLenSpan = Math.max(row.xEnd - row.xStart, 1);
  const containerH = pack.container.inner.h;
  const sx = chart.w / rowLenSpan;
  const sy = chart.h / containerH;

  const boxes = row.boxes
    .map((b) => {
      const color = pack.perItem[b.itemIdx]?.color ?? "#888";
      const x = chart.x + (b.x - row.xStart) * sx;
      const w = Math.max(b.l * sx, 1);
      const h = Math.max(b.h * sy, 1);
      const y = chart.y + chart.h - (b.z + b.h) * sy;
      const tilted = b.rotated === "sideways" || b.rotated === "axis";
      const tilt =
        tilted && w > 10 && h > 10
          ? `<text x="${x + w / 2}" y="${y + h / 2 + 3}" font-size="8" font-weight="700" text-anchor="middle" fill="#854d0e">↻</text>`
          : "";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" fill-opacity="0.85" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>${tilt}`;
    })
    .join("");

  const chrome = projectionChrome({
    chart,
    theme,
    spanXmm: rowLenSpan,
    spanYmm: containerH,
    xLabel: "depth",
    yLabel: "H",
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="Side view of row ${row.rowIdx + 1}">
    ${chrome.open}
    ${boxes}
    ${chrome.close}
  </svg>`;
}

/**
 * Top-down floor-plan view (W × depth) — looking down from above.
 * Horizontal = container width, vertical = row's depth span (back wall at top).
 *
 * Bottom layer is drawn at full opacity; upper layers are drawn faintly
 * underneath (z-order doesn't matter much since they share the same x,y
 * footprint) and a "+N stacked above" tag flags multi-layer rows.
 */
export function buildRowTopViewSvg(
  row: RowGroup,
  pack: AdvancedPackResult,
  opts: { width?: number; height?: number; themeColor?: string } = {},
): string {
  const VIEW_W = opts.width ?? 220;
  const VIEW_H = opts.height ?? 90;
  const theme = opts.themeColor ?? VIEW_THEME_DEFAULT;
  const chart = makeChart(VIEW_W, VIEW_H);
  const containerW = pack.container.inner.w;
  const rowLenSpan = Math.max(row.xEnd - row.xStart, 1);
  const sx = chart.w / containerW;
  const sy = chart.h / rowLenSpan;

  const bottomBoxes = row.boxes.filter((b) => b.z < 1);
  const upperBoxes = row.boxes.filter((b) => b.z >= 1);

  const renderBox = (b: (typeof row.boxes)[number], opacity: number) => {
    const color = pack.perItem[b.itemIdx]?.color ?? "#888";
    const x = chart.x + b.y * sx;
    const w = Math.max(b.w * sx, 1);
    const y = chart.y + (b.x - row.xStart) * sy;
    const h = Math.max(b.l * sy, 1);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" fill-opacity="${opacity}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`;
  };

  const upperSvg = upperBoxes.map((b) => renderBox(b, 0.25)).join("");
  const bottomSvg = bottomBoxes.map((b) => renderBox(b, 0.85)).join("");
  const stackedTag =
    upperBoxes.length > 0
      ? `<text x="${(chart.x + chart.w - 2).toFixed(1)}" y="${(chart.y + chart.h - 2).toFixed(1)}" font-size="6" font-weight="700" text-anchor="end" fill="${theme}" fill-opacity="0.7">+${upperBoxes.length} stacked</text>`
      : "";

  const chrome = projectionChrome({
    chart,
    theme,
    spanXmm: containerW,
    spanYmm: rowLenSpan,
    xLabel: "width",
    yLabel: "D",
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="Top-down view of row ${row.rowIdx + 1}">
    ${chrome.open}
    ${upperSvg}
    ${bottomSvg}
    ${stackedTag}
    ${chrome.close}
  </svg>`;
}
