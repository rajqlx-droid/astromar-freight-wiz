/**
 * Hard-coded representative scenario — mirrors the app's packing model.
 * 20ft GP container packed back-to-front, 5 rows, mixed cartons including
 * a fragile row capped on top and a non-stack pallet that stays on the floor.
 *
 * Coordinates: origin = back-left-floor, x = length (depth into container),
 * y = width, z = height. All units in mm / kg, matching src/lib/freight.
 */

export interface Box {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  color: string;
  fragile?: boolean;
  nonStack?: boolean;
  rotated?: boolean;
}

export interface Row {
  rowIdx: number;
  xStart: number;
  xEnd: number;
  boxes: Box[];
  totalWeightKg: number;
  totalCbm: number;
  hasFragile: boolean;
  hasNonStack: boolean;
  rotatedCount: number;
  layers: number;
  wallUtilizationPct: number;
  gapWarning: boolean;
}

export const CONTAINER = {
  name: "20ft GP",
  inner: { l: 5900, w: 2352, h: 2393 }, // mm
  capCbm: 30,
  maxPayloadKg: 28000,
};

const TEAL = "#14b8a6";
const ORANGE = "#f97316";
const PURPLE = "#8b5cf6";
const BLUE = "#3b82f6";
const AMBER = "#f59e0b";

/* Build 5 rows back-to-front. Each row is a "wall" of cartons placed
   against either the back wall (row 0) or the previous row's front face. */

function makeBox(
  x: number,
  y: number,
  z: number,
  l: number,
  w: number,
  h: number,
  color: string,
  extra: Partial<Box> = {},
): Box {
  return { x, y, z, l, w, h, color, ...extra };
}

// Row 0 — heavy industrial cartons, 2 layers, full back-wall coverage
const row0: Box[] = [];
{
  const xStart = 0;
  const L = 1170;
  const W = 1170;
  const H = 1100;
  // 2 wide × 2 layers
  for (let zi = 0; zi < 2; zi++) {
    for (let yi = 0; yi < 2; yi++) {
      row0.push(makeBox(xStart, yi * W + 6, zi * H, L, W, H, TEAL));
    }
  }
}

// Row 1 — same heavy cartons, 1 layer + 2 stacked, mixed footprint
const row1: Box[] = [];
{
  const xStart = 1170;
  const L = 1100;
  const W = 1170;
  const H = 1100;
  for (let zi = 0; zi < 2; zi++) {
    for (let yi = 0; yi < 2; yi++) {
      row1.push(makeBox(xStart, yi * W + 6, zi * H, L, W, H, ORANGE));
    }
  }
}

// Row 2 — purple medium cartons, 3 high, full coverage
const row2: Box[] = [];
{
  const xStart = 2270;
  const L = 1200;
  const W = 1100;
  const H = 780;
  for (let zi = 0; zi < 3; zi++) {
    for (let yi = 0; yi < 2; yi++) {
      row2.push(makeBox(xStart, yi * W + 76, zi * H, L, W, H, PURPLE));
    }
  }
}

// Row 3 — blue cartons with a noticeable gap (only one column) → triggers gap warning
const row3: Box[] = [];
{
  const xStart = 3470;
  const L = 1100;
  const W = 1100;
  const H = 1000;
  // only place 1 column of 2 layers → leaves a wide void on right side
  for (let zi = 0; zi < 2; zi++) {
    row3.push(makeBox(xStart, 6, zi * H, L, W, H, BLUE));
  }
}

// Row 4 — fragile amber cartons (turned/rotated) capped near door, plus 1 non-stack pallet
const row4: Box[] = [];
{
  const xStart = 4570;
  const L = 1300;
  const W = 1100;
  const H = 900;
  // Floor: 1 non-stack pallet (left)
  row4.push(makeBox(xStart, 6, 0, L, W, H, ORANGE, { nonStack: true }));
  // Floor: 1 fragile rotated unit (right)
  row4.push(makeBox(xStart, W + 6, 0, L, W, H, AMBER, { fragile: true, rotated: true }));
  // Top fragile layer
  row4.push(makeBox(xStart, W + 6, H, L, W, H, AMBER, { fragile: true }));
}

const ROWS_RAW = [row0, row1, row2, row3, row4];

function buildRow(rowIdx: number, boxes: Box[]): Row {
  const xStart = Math.min(...boxes.map((b) => b.x));
  const xEnd = Math.max(...boxes.map((b) => b.x + b.l));
  const totalCbm = boxes.reduce((s, b) => s + (b.l * b.w * b.h) / 1_000_000_000, 0);
  // approximate weight: 35 kg per carton avg
  const totalWeightKg = Math.round(boxes.length * 38);
  const hasFragile = boxes.some((b) => b.fragile);
  const hasNonStack = boxes.some((b) => b.nonStack);
  const rotatedCount = boxes.filter((b) => b.rotated).length;
  const zLevels = new Set(boxes.map((b) => Math.round(b.z / 10) * 10));
  const layers = zLevels.size;
  // Wall utilization = bottom-layer footprint vs (containerWidth × rowDepth)
  const bottomFootprint = boxes
    .filter((b) => b.z < 10)
    .reduce((s, b) => s + b.l * b.w, 0);
  const wallArea = CONTAINER.inner.w * Math.max(1, xEnd - xStart);
  const wallUtilizationPct = Math.min(100, (bottomFootprint / wallArea) * 100);
  const gapWarning = wallUtilizationPct < 90;
  return {
    rowIdx,
    xStart,
    xEnd,
    boxes,
    totalWeightKg,
    totalCbm,
    hasFragile,
    hasNonStack,
    rotatedCount,
    layers,
    wallUtilizationPct,
    gapWarning,
  };
}

export const ROWS: Row[] = ROWS_RAW.map((boxes, i) => buildRow(i, boxes));
export const ALL_BOXES: Box[] = ROWS.flatMap((r) => r.boxes);
export const TOTAL_CARTONS = ALL_BOXES.length;
export const TOTAL_CBM = ALL_BOXES.reduce(
  (s, b) => s + (b.l * b.w * b.h) / 1_000_000_000,
  0,
);
export const TOTAL_WEIGHT_KG = ROWS.reduce((s, r) => s + r.totalWeightKg, 0);
export const UTILIZATION_PCT = (TOTAL_CBM / CONTAINER.capCbm) * 100;

// COG offset along length (mm from back wall) — weight-weighted centroid x
const cogXmm = (() => {
  let num = 0;
  let den = 0;
  for (const r of ROWS) {
    const rowCenterX = (r.xStart + r.xEnd) / 2;
    num += rowCenterX * r.totalWeightKg;
    den += r.totalWeightKg;
  }
  return den > 0 ? num / den : 0;
})();
export const COG_OFFSET_PCT = (cogXmm / CONTAINER.inner.l) * 100;
