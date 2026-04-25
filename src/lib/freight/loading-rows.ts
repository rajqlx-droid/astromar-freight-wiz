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
  /**
   * Back-wall floor utilization (0-100). Computed as the bottom-layer footprint
   * (sum of l × w for boxes touching the floor) divided by the row's wall area
   * (container width × row depth). 100% means the floor is fully tiled with no
   * voids; lower values indicate gaps between pallets that loaders should
   * re-shuffle to close before sealing the container.
   */
  wallUtilizationPct: number;
  /** True when wallUtilizationPct < 90% AND below the row's geometric ceiling — flagged for re-shuffle. */
  gapWarning: boolean;
  /**
   * Maximum wall utilisation physically achievable for this row given its
   * cargo footprint and the universal 50 mm gap rule. When the row is
   * already at this ceiling, no slack warning should fire — the geometry
   * itself caps how tight the pack can be.
   */
  maxAchievableUtilizationPct: number;
}

/** Minimum back-wall floor coverage before we flag a gap warning. */
export const WALL_GAP_WARNING_THRESHOLD_PCT = 90;

/** Default kg-per-package cutoff above which a non-fragile unit is treated as "heavy". */
export const DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD = 25;

/* ────────────────────────────────────────────────────────────────────────────
 * Container-level wall efficiency
 * ──────────────────────────────────────────────────────────────────────────── */

export interface WallEfficiency {
  /** 0-100 — depth-weighted average of wallUtilizationPct across all rows. */
  scorePct: number;
  /** Traffic-light bucket: green ≥ 90, amber ≥ 75, red < 75. */
  status: "green" | "amber" | "red";
  rowCount: number;
  /** How many rows currently carry a gap warning. */
  gapRowCount: number;
}

/** Compute the depth-weighted overall wall efficiency for a set of rows. */
export function computeWallEfficiency(rows: RowGroup[]): WallEfficiency {
  if (rows.length === 0) {
    return { scorePct: 0, status: "red", rowCount: 0, gapRowCount: 0 };
  }
  let weightedSum = 0;
  let totalDepth = 0;
  let gapRowCount = 0;
  for (const r of rows) {
    const depth = Math.max(1, r.xEnd - r.xStart);
    weightedSum += r.wallUtilizationPct * depth;
    totalDepth += depth;
    if (r.gapWarning) gapRowCount++;
  }
  const scorePct = totalDepth > 0 ? weightedSum / totalDepth : 0;
  const status: WallEfficiency["status"] =
    scorePct >= 90 ? "green" : scorePct >= 75 ? "amber" : "red";
  return { scorePct, status, rowCount: rows.length, gapRowCount };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Re-shuffle suggestions
 *
 * For a row with a back-wall gap, we project every bottom-layer box onto the
 * width axis (y) and find the largest contiguous void. The suggestion tells
 * the loader how far (cm) to slide which side's pallets to close it.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ReshuffleSuggestion {
  /** Plain-English instruction for the loader. */
  text: string;
  /** Width of the largest void in mm (along the y-axis of this row). */
  largestGapMm: number;
  /** "left" = slide left-side pallets right, "right" = slide right-side pallets left, "split" = close both sides toward middle. */
  direction: "left" | "right" | "split" | "none";
  /** Estimated wall utilization after the suggested shuffle (0-100). */
  projectedUtilizationPct: number;
}

export function suggestReshuffle(
  row: RowGroup,
  pack: AdvancedPackResult,
): ReshuffleSuggestion {
  const containerW = pack.container.inner.w;
  // Project bottom-layer boxes onto the y-axis as [start, end] intervals.
  const intervals = row.boxes
    .filter((b) => b.z < 10)
    .map((b) => [b.y, b.y + b.w] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  if (intervals.length === 0) {
    return {
      text: "No bottom-layer pallets in this row to re-shuffle.",
      largestGapMm: 0,
      direction: "none",
      projectedUtilizationPct: row.wallUtilizationPct,
    };
  }

  // Merge overlapping intervals.
  const merged: [number, number][] = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i][0] <= last[1]) {
      last[1] = Math.max(last[1], intervals[i][1]);
    } else {
      merged.push(intervals[i]);
    }
  }

  // Find all voids: leading, between-intervals, trailing.
  const voids: { start: number; end: number; size: number }[] = [];
  if (merged[0][0] > 0) {
    voids.push({ start: 0, end: merged[0][0], size: merged[0][0] });
  }
  for (let i = 1; i < merged.length; i++) {
    const gap = merged[i][0] - merged[i - 1][1];
    if (gap > 0) {
      voids.push({ start: merged[i - 1][1], end: merged[i][0], size: gap });
    }
  }
  if (merged[merged.length - 1][1] < containerW) {
    const start = merged[merged.length - 1][1];
    voids.push({ start, end: containerW, size: containerW - start });
  }

  if (voids.length === 0) {
    return {
      text: "Pallets are already tight against both side walls — no re-shuffle needed.",
      largestGapMm: 0,
      direction: "none",
      projectedUtilizationPct: row.wallUtilizationPct,
    };
  }

  // Sum of every void = the slack. Closing it brings everything tight to one wall.
  const totalSlack = voids.reduce((s, v) => s + v.size, 0);
  const largest = voids.reduce((a, b) => (b.size > a.size ? b : a));
  const largestCm = Math.round(largest.size / 10);
  const totalCm = Math.round(totalSlack / 10);

  // Decide which side to push toward: pick whichever wall currently has more
  // pallet weight against it (fewer voids on that side).
  const leftSlack = voids
    .filter((v) => v.start < containerW / 2)
    .reduce((s, v) => s + v.size, 0);
  const rightSlack = totalSlack - leftSlack;
  let direction: ReshuffleSuggestion["direction"];
  let sideText: string;
  if (Math.abs(leftSlack - rightSlack) < 100) {
    direction = "split";
    sideText = `slide both side walls' pallets toward the centre by ~${Math.round(totalCm / 2)} cm each`;
  } else if (leftSlack > rightSlack) {
    direction = "left";
    sideText = `slide the left-side pallets ${totalCm} cm to the right so they meet the right wall pack`;
  } else {
    direction = "right";
    sideText = `slide the right-side pallets ${totalCm} cm to the left so they meet the left wall pack`;
  }

  // Projected utilization after closing all gaps: bottom footprint stays the
  // same, but reduce the row depth contribution to nil — gain is the total
  // slack expressed as % of wall area.
  const wallAreaMm2 = containerW * Math.max(1, row.xEnd - row.xStart);
  const bottomFootprintMm2 = row.boxes
    .filter((b) => b.z < 10)
    .reduce((s, b) => s + b.l * b.w, 0);
  const projected =
    wallAreaMm2 > 0 ? Math.min(100, (bottomFootprintMm2 / wallAreaMm2) * 100 + (totalSlack / wallAreaMm2) * 100 * 0) : 0;
  // The footprint doesn't change by sliding — only voids close — so the wall
  // utilization stays the same; we instead report the gap that gets closed.
  const projectedUtilizationPct = Math.min(100, row.wallUtilizationPct + (totalSlack / wallAreaMm2) * 100);
  void projected;

  const text =
    voids.length === 1
      ? `Largest gap is ${largestCm} cm wide — ${sideText}.`
      : `Total slack is ${totalCm} cm spread across ${voids.length} gaps (largest ${largestCm} cm) — ${sideText}.`;

  return {
    text,
    largestGapMm: largest.size,
    direction,
    projectedUtilizationPct,
  };
}

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

  // ── Back-wall-aligned rank clustering ────────────────────────────────────
  // A "row" (rank) is defined by the floor pallets that share roughly the
  // same x-start position against the back wall. Stacked boxes are then
  // claimed by whichever rank's floor pallet sits directly under them.
  const TOL = 200; // mm — same-rank tolerance on x-start

  const floorBoxes = pack.placed
    .filter((b) => b.z < 10)
    .sort((a, b) => a.x - b.x);
  const stackedBoxes = pack.placed.filter((b) => b.z >= 10);

  type Rank = {
    boxes: PlacedBox[];
    floorBoxes: PlacedBox[];
    minX: number;
    xStart: number;
    xEnd: number;
  };
  const ranks: Rank[] = [];

  // 1. Cluster floor boxes into ranks by x-start within TOL of the rank's min x.
  for (const b of floorBoxes) {
    const last = ranks[ranks.length - 1];
    if (last && b.x - last.minX <= TOL) {
      last.floorBoxes.push(b);
      last.boxes.push(b);
      if (b.x < last.xStart) last.xStart = b.x;
      if (b.x + b.l > last.xEnd) last.xEnd = b.x + b.l;
    } else {
      ranks.push({
        boxes: [b],
        floorBoxes: [b],
        minX: b.x,
        xStart: b.x,
        xEnd: b.x + b.l,
      });
    }
  }

  // Footprint overlap (x and y) between two boxes.
  const overlapArea = (a: PlacedBox, f: PlacedBox): number => {
    const xOverlap = Math.max(0, Math.min(a.x + a.l, f.x + f.l) - Math.max(a.x, f.x));
    const yOverlap = Math.max(0, Math.min(a.y + a.w, f.y + f.w) - Math.max(a.y, f.y));
    return xOverlap * yOverlap;
  };

  // 2. Assign each stacked box to the rank whose floor pallets it covers most.
  for (const sb of stackedBoxes) {
    let bestRank = -1;
    let bestArea = 0;
    for (let ri = 0; ri < ranks.length; ri++) {
      let area = 0;
      for (const fb of ranks[ri].floorBoxes) area += overlapArea(sb, fb);
      if (area > bestArea) {
        bestArea = area;
        bestRank = ri;
      }
    }
    if (bestRank < 0) {
      // No floor pallet underneath — fall back to nearest rank by x-start.
      let nearest = 0;
      let nd = Infinity;
      for (let ri = 0; ri < ranks.length; ri++) {
        const d = Math.abs(sb.x - ranks[ri].xStart);
        if (d < nd) {
          nd = d;
          nearest = ri;
        }
      }
      bestRank = nearest;
      if (ranks.length === 0) {
        // Pathological: no floor boxes at all. Make one rank from this box.
        ranks.push({
          boxes: [sb],
          floorBoxes: [],
          minX: sb.x,
          xStart: sb.x,
          xEnd: sb.x + sb.l,
        });
        continue;
      }
    }
    const r = ranks[bestRank];
    r.boxes.push(sb);
    if (sb.x + sb.l > r.xEnd) r.xEnd = sb.x + sb.l;
    if (sb.x < r.xStart) r.xStart = sb.x;
  }

  // Order ranks back-to-front and re-shape into the structure used below.
  const rows = ranks
    .sort((a, b) => a.minX - b.minX)
    .map((r) => ({ boxes: r.boxes, xStart: r.xStart, xEnd: r.xEnd }));

  return rows.map((r, i) => {
    let totalWeightKg = 0;
    let totalCbm = 0;
    let hasFragile = false;
    let hasNonStack = false;
    let rotatedCount = 0;
    let hasHeavyNonFragile = false;
    let bottomFootprintMm2 = 0;
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
      // Bottom-layer footprint contributes to wall utilization. We treat any
      // box whose bottom is on (or within 10 mm of) the floor as a wall tile.
      if (b.z < 10) bottomFootprintMm2 += b.l * b.w;
    }
    const layers = zLevels.size;
    // Recommend a separator board when fragile + heavy non-fragile share a
    // multi-layer row (anything could end up stacked on the fragile units).
    const needsSeparator = hasFragile && hasHeavyNonFragile && layers > 1;
    // Wall utilization: bottom footprint vs. (container width × row depth).
    const rowDepthMm = Math.max(1, r.xEnd - r.xStart);
    const wallAreaMm2 = pack.container.inner.w * rowDepthMm;
    const wallUtilizationPct =
      wallAreaMm2 > 0 ? Math.min(100, (bottomFootprintMm2 / wallAreaMm2) * 100) : 0;

    // Geometric ceiling: how tight CAN this row physically be packed given
    // the actual bottom-layer footprints + the 50 mm gap rule? When the
    // current utilisation is already at this ceiling, the slack is
    // irreducible — no re-shuffle can close it.
    //
    // Mixed-row aware: instead of using only the narrowest footprint (which
    // overstates the ceiling and warns on rows that actually can't pack any
    // tighter), we compute the ceiling using BOTH the smallest AND largest
    // footprint in the row. The achievable maximum is the LOWER of the two —
    // a row dominated by 1300 mm pallets cannot magically fit 1066 mm cubes.
    const containerW = pack.container.inner.w;
    const minGap = 0; // tight pack — flush placement allowed (gap-rules.ts)
    const wallMin = 0; // tight pack — cartons may sit flush against side walls
    const floorBoxes = r.boxes.filter((b) => b.z < 10);
    let maxAchievableUtilizationPct = 100;
    if (floorBoxes.length > 0 && rowDepthMm > 0) {
      const usableWidth = Math.max(0, containerW - 2 * wallMin + minGap);
      // Try every distinct footprint width as the "tile" choice and take the
      // best (highest coverage). This is a conservative estimate of what a
      // re-shuffle could achieve given the actual cargo present.
      const widths = Array.from(new Set(floorBoxes.map((b) => b.w))).filter((w) => w > 0);
      const lengths = Array.from(new Set(floorBoxes.map((b) => b.l))).filter((l) => l > 0);
      let bestFootprint = 0;
      for (const fw of widths) {
        for (const fl of lengths) {
          const fitsAcross = Math.max(1, Math.floor(usableWidth / (fw + minGap)));
          const fitsDeep = Math.max(1, Math.floor((rowDepthMm + minGap) / (fl + minGap)));
          const tileFootprint = fitsAcross * fitsDeep * fw * fl;
          if (tileFootprint > bestFootprint) bestFootprint = tileFootprint;
        }
      }
      if (wallAreaMm2 > 0 && bestFootprint > 0) {
        maxAchievableUtilizationPct = Math.min(100, (bestFootprint / wallAreaMm2) * 100);
      }
    }
    // Use the smaller of the configured threshold or the row's physical
    // ceiling — never warn about slack the cargo geometry itself enforces.
    const effectiveThreshold = Math.min(
      WALL_GAP_WARNING_THRESHOLD_PCT,
      maxAchievableUtilizationPct - 0.5, // tiny epsilon for FP rounding
    );
    const gapWarning = wallUtilizationPct < effectiveThreshold;
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
      wallUtilizationPct,
      gapWarning,
      maxAchievableUtilizationPct,
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
  if (row.gapWarning)
    parts.push(
      `re-shuffle to close gaps — back wall only ${Math.round(row.wallUtilizationPct)}% utilised`,
    );
  if (row.needsSeparator)
    parts.push("insert a separator board (plywood/cardboard) between heavy and fragile layers");
  if (row.rotatedCount > 0)
    parts.push(`rotate ${row.rotatedCount} unit${row.rotatedCount > 1 ? "s" : ""} as marked in 3D view`);
  return parts.join(", ") + ".";
}

/* ────────────────────────────────────────────────────────────────────────────
 * Per-pallet loading sequence
 *
 * Returns an ordered list of every placed box, sorted in actual
 * loader-hand-order (back→front by row, then bottom-up by layer, then
 * left→right within a layer). Each step carries a derived action verb,
 * a position cue and a list of warnings the loader needs to act on.
 * Used by the dock-loader POV walkthrough in the 3D viewer.
 * ──────────────────────────────────────────────────────────────────────────── */

export type PalletAction =
  | "PLACE"
  | "STACK ON"
  | "ROTATE 90° THEN PLACE"
  | "TIP ON SIDE THEN PLACE"
  | "CAP WITH FRAGILE";

export interface PalletStep {
  /** Index into pack.placed — the canonical placedIdx used by the 3D viewer. */
  placedIdx: number;
  /** Reference back to the box itself. */
  box: PlacedBox;
  /** 0-indexed row this pallet belongs to. */
  rowIdx: number;
  /** 0-indexed layer (0 = floor). */
  layer: number;
  /** Step number within the row, 1-indexed. */
  stepInRow: number;
  /** Loader-friendly item label. */
  itemLabel: string;
  /** Pretty dimensions string (mm + kg). */
  dimsLabel: string;
  /** What the loader actually does. */
  action: PalletAction;
  /** Plain-English position cue. */
  positionText: string;
  /** Warnings (FRAGILE / NO-STACK / ROTATE / SEPARATOR). */
  warnings: string[];
  /** True when this is the last step of its row. */
  rowEnd: boolean;
}

function rowDescriptor(rowIdx: number, totalRows: number): string {
  if (rowIdx === 0) return "back wall";
  if (rowIdx === totalRows - 1) return "door end";
  return `row ${rowIdx + 1}`;
}

function lateralDescriptor(yMid: number, containerW: number): string {
  const frac = yMid / containerW;
  if (frac < 0.34) return "left";
  if (frac > 0.66) return "right";
  return "centre";
}

export function buildPalletSequence(
  pack: AdvancedPackResult,
  rows?: RowGroup[],
): PalletStep[] {
  const allRows = rows ?? buildRows(pack);
  const containerW = pack.container.inner.w;
  const steps: PalletStep[] = [];

  for (const row of allRows) {
    // Sort boxes inside this row: layer (z) bottom-up → x back-to-front
    // → y left-to-right.
    const ordered = [...row.boxes].sort((a, b) => {
      if (Math.abs(a.z - b.z) > 5) return a.z - b.z;
      if (Math.abs(a.x - b.x) > 5) return a.x - b.x;
      return a.y - b.y;
    });

    // Build a layer-index lookup — every distinct z (rounded) is its own layer.
    const layerZs = Array.from(new Set(ordered.map((b) => Math.round(b.z / 10) * 10))).sort(
      (a, b) => a - b,
    );

    let stepInRow = 0;
    for (const b of ordered) {
      stepInRow += 1;
      const placedIdx = pack.placed.indexOf(b);
      if (placedIdx < 0) continue;
      const stat = pack.perItem[b.itemIdx];
      const layer = layerZs.indexOf(Math.round(b.z / 10) * 10);
      const onFloor = layer === 0;

      // Action verb.
      let action: PalletAction = onFloor ? "PLACE" : "STACK ON";
      if (b.rotated === "sideways") action = "ROTATE 90° THEN PLACE";
      else if (b.rotated === "axis") action = "TIP ON SIDE THEN PLACE";
      else if (stat?.fragile) action = "CAP WITH FRAGILE";

      // Position cue.
      const lateral = lateralDescriptor(b.y + b.w / 2, containerW);
      const rowName = rowDescriptor(row.rowIdx, allRows.length);
      const layerName = onFloor ? "floor" : `layer ${layer + 1}`;
      const positionText = `${rowName}, ${lateral} side, ${layerName}`;

      // Warnings.
      const warnings: string[] = [];
      if (stat?.fragile) warnings.push("⚠ FRAGILE — load last in this row, no stacking on top");
      if (stat && !stat.stackable) warnings.push("⚠ NO-STACK — leave the top clear");
      if (b.rotated === "sideways") warnings.push("↻ ROTATE 90° around vertical axis before placing");
      if (b.rotated === "axis") warnings.push("⤾ TIP onto side — height & width swap");
      if (row.needsSeparator && layer > 0)
        warnings.push("INSERT separator board (plywood/cardboard) below this layer");
      if (row.gapWarning && onFloor)
        warnings.push(`Re-shuffle row toward wall — only ${Math.round(row.wallUtilizationPct)}% wall coverage`);

      const itemLabel = `Item ${b.itemIdx + 1}`;
      const weightTxt = stat?.weightKgPerPkg ? ` · ${Math.round(stat.weightKgPerPkg)} kg` : "";
      const dimsLabel = `${b.l}×${b.w}×${b.h} mm${weightTxt}`;

      steps.push({
        placedIdx,
        box: b,
        rowIdx: row.rowIdx,
        layer,
        stepInRow,
        itemLabel,
        dimsLabel,
        action,
        positionText,
        warnings,
        rowEnd: stepInRow === ordered.length,
      });
    }
  }

  return steps;
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

/* ────────────────────────────────────────────────────────────────────────────
 * Isometric row view
 *
 * Renders the WHOLE container outline as a wireframe (so loaders can see
 * where this row sits along the length), with previously-loaded rows drawn
 * faintly as ghosts and the current row's boxes drawn solid. This gives the
 * spatial context the three flat orthographic views can't.
 *
 * Projection: matches remotion/src/projection.ts (yaw -35°, pitch 30°).
 * ──────────────────────────────────────────────────────────────────────────── */

const ISO_YAW = -Math.PI * (35 / 180);
const ISO_PITCH = Math.PI * (30 / 180);

interface IsoPoint {
  sx: number;
  sy: number;
  depth: number;
}

/** Project a (x,y,z)-mm point in container space to 2D, centred on origin. */
function isoProject(
  x: number,
  y: number,
  z: number,
  containerL: number,
  containerW: number,
  scale: number,
  cx: number,
  cy: number,
): IsoPoint {
  const px = x - containerL / 2;
  const py = y - containerW / 2;
  const pz = z;
  const cY = Math.cos(ISO_YAW);
  const sY = Math.sin(ISO_YAW);
  const rx = px * cY - py * sY;
  const ry = px * sY + py * cY;
  const cP = Math.cos(ISO_PITCH);
  const sP = Math.sin(ISO_PITCH);
  const ry2 = ry * cP - pz * sP;
  const rz2 = ry * sP + pz * cP;
  return {
    sx: cx + rx * scale,
    sy: cy - rz2 * scale,
    depth: ry2,
  };
}

interface IsoBox {
  l: number;
  w: number;
  h: number;
  x: number;
  y: number;
  z: number;
  color: string;
  opacity: number;
}

/** Render one box as 3 visible faces (top, front, right) using painter's depth sort. */
function renderIsoBox(
  b: IsoBox,
  containerL: number,
  containerW: number,
  scale: number,
  cx: number,
  cy: number,
): { svg: string; depth: number } {
  const corners: IsoPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const dx = i & 1 ? b.l : 0;
    const dy = i & 2 ? b.w : 0;
    const dz = i & 4 ? b.h : 0;
    corners.push(
      isoProject(b.x + dx, b.y + dy, b.z + dz, containerL, containerW, scale, cx, cy),
    );
  }
  const top = [corners[4], corners[5], corners[7], corners[6]];
  const front = [corners[2], corners[3], corners[7], corners[6]];
  const right = [corners[1], corners[3], corners[7], corners[5]];
  const avgDepth = corners.reduce((s, c) => s + c.depth, 0) / 8;

  const poly = (pts: IsoPoint[], shade: number) => {
    const d = pts.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");
    return `<polygon points="${d}" fill="${b.color}" fill-opacity="${(b.opacity * shade).toFixed(2)}" stroke="rgba(0,0,0,0.45)" stroke-width="0.4"/>`;
  };

  return {
    svg: `${poly(right, 0.7)}${poly(front, 0.85)}${poly(top, 1.0)}`,
    depth: avgDepth,
  };
}

/** Container wireframe (12 edges of the outer box). */
function isoContainerWireframe(
  containerL: number,
  containerW: number,
  containerH: number,
  scale: number,
  cx: number,
  cy: number,
  theme: string,
): string {
  const c: IsoPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const dx = i & 1 ? containerL : 0;
    const dy = i & 2 ? containerW : 0;
    const dz = i & 4 ? containerH : 0;
    c.push(isoProject(dx, dy, dz, containerL, containerW, scale, cx, cy));
  }
  const edges: [number, number][] = [
    [0, 1], [1, 3], [3, 2], [2, 0],
    [4, 5], [5, 7], [7, 6], [6, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return edges
    .map(
      ([a, b]) =>
        `<line x1="${c[a].sx.toFixed(1)}" y1="${c[a].sy.toFixed(1)}" x2="${c[b].sx.toFixed(1)}" y2="${c[b].sy.toFixed(1)}" stroke="${theme}" stroke-opacity="0.55" stroke-width="0.7" stroke-dasharray="2 2"/>`,
    )
    .join("");
}

/**
 * Iso view (3D wireframe) — shows the whole container outline with the row's
 * boxes solid and previously-loaded rows ghosted in for spatial context.
 */
export function buildRowIsoViewSvg(
  row: RowGroup,
  pack: AdvancedPackResult,
  allRows: RowGroup[],
  opts: { width?: number; height?: number; themeColor?: string } = {},
): string {
  const VIEW_W = opts.width ?? 220;
  const VIEW_H = opts.height ?? 90;
  const theme = opts.themeColor ?? VIEW_THEME_DEFAULT;
  const containerL = pack.container.inner.l;
  const containerW = pack.container.inner.w;
  const containerH = pack.container.inner.h;

  // Auto-fit scale: project the 8 container corners with scale=1, find the
  // bounding box, then scale to fill the view with a margin.
  const probeCorners: IsoPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const dx = i & 1 ? containerL : 0;
    const dy = i & 2 ? containerW : 0;
    const dz = i & 4 ? containerH : 0;
    probeCorners.push(isoProject(dx, dy, dz, containerL, containerW, 1, 0, 0));
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of probeCorners) {
    if (p.sx < minX) minX = p.sx;
    if (p.sx > maxX) maxX = p.sx;
    if (p.sy < minY) minY = p.sy;
    if (p.sy > maxY) maxY = p.sy;
  }
  const margin = 8;
  const scale = Math.min(
    (VIEW_W - margin * 2) / Math.max(maxX - minX, 1),
    (VIEW_H - margin * 2) / Math.max(maxY - minY, 1),
  );
  const cx = VIEW_W / 2 - ((minX + maxX) / 2) * scale;
  const cy = VIEW_H / 2 + ((minY + maxY) / 2) * scale;

  // Earlier rows ghosted; current row solid; later rows omitted.
  const earlierBoxes: IsoBox[] = [];
  for (const r of allRows) {
    if (r.rowIdx >= row.rowIdx) break;
    for (const b of r.boxes) {
      earlierBoxes.push({
        l: b.l, w: b.w, h: b.h, x: b.x, y: b.y, z: b.z,
        color: pack.perItem[b.itemIdx]?.color ?? "#888",
        opacity: 0.18,
      });
    }
  }
  const currentBoxes: IsoBox[] = row.boxes.map((b) => ({
    l: b.l, w: b.w, h: b.h, x: b.x, y: b.y, z: b.z,
    color: pack.perItem[b.itemIdx]?.color ?? "#888",
    opacity: 0.92,
  }));

  // Painter's algorithm: render back-most first.
  const renderable = [...earlierBoxes, ...currentBoxes].map((b) =>
    renderIsoBox(b, containerL, containerW, scale, cx, cy),
  );
  renderable.sort((a, b) => a.depth - b.depth);
  const boxesSvg = renderable.map((r) => r.svg).join("");

  const wireframe = isoContainerWireframe(
    containerL, containerW, containerH, scale, cx, cy, theme,
  );

  const backLabelP = isoProject(
    0, containerW / 2, containerH, containerL, containerW, scale, cx, cy,
  );
  const doorLabelP = isoProject(
    containerL, containerW / 2, containerH, containerL, containerW, scale, cx, cy,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="Iso 3D view of row ${row.rowIdx + 1}">
    <rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="#ffffff"/>
    ${wireframe}
    ${boxesSvg}
    <text x="${backLabelP.sx.toFixed(1)}" y="${(backLabelP.sy - 2).toFixed(1)}" font-size="5" font-weight="700" text-anchor="middle" fill="${theme}" fill-opacity="0.75">BACK</text>
    <text x="${doorLabelP.sx.toFixed(1)}" y="${(doorLabelP.sy - 2).toFixed(1)}" font-size="5" font-weight="700" text-anchor="middle" fill="${theme}" fill-opacity="0.75">DOOR</text>
    <text x="${(VIEW_W - 3).toFixed(1)}" y="${(VIEW_H - 3).toFixed(1)}" font-size="5" font-weight="700" text-anchor="end" fill="${theme}" fill-opacity="0.7">ROW ${row.rowIdx + 1} · ISO</text>
  </svg>`;
}

