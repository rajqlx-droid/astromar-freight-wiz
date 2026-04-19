/**
 * Hard-coded representative scenario — mirrors the app's packing model.
 * Fallback used when remotion/public/scenario.json is missing.
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

export interface ContainerSpec {
  name: string;
  inner: { l: number; w: number; h: number };
  capCbm: number;
  maxPayloadKg: number;
}

export interface Scenario {
  container: ContainerSpec;
  rows: Row[];
  allBoxes: Box[];
  totalCartons: number;
  totalCbm: number;
  totalWeightKg: number;
  utilizationPct: number;
  cogOffsetPct: number;
}

const TEAL = "#14b8a6";
const ORANGE = "#f97316";
const PURPLE = "#8b5cf6";
const BLUE = "#3b82f6";
const AMBER = "#f59e0b";

const CONTAINER: ContainerSpec = {
  name: "20ft GP",
  inner: { l: 5900, w: 2352, h: 2393 },
  capCbm: 30,
  maxPayloadKg: 28000,
};

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

const row0: Box[] = [];
{
  const xStart = 0;
  const L = 1170;
  const W = 1170;
  const H = 1100;
  for (let zi = 0; zi < 2; zi++) {
    for (let yi = 0; yi < 2; yi++) {
      row0.push(makeBox(xStart, yi * W + 6, zi * H, L, W, H, TEAL));
    }
  }
}

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

const row3: Box[] = [];
{
  const xStart = 3470;
  const L = 1100;
  const W = 1100;
  const H = 1000;
  for (let zi = 0; zi < 2; zi++) {
    row3.push(makeBox(xStart, 6, zi * H, L, W, H, BLUE));
  }
}

const row4: Box[] = [];
{
  const xStart = 4570;
  const L = 1300;
  const W = 1100;
  const H = 900;
  row4.push(makeBox(xStart, 6, 0, L, W, H, ORANGE, { nonStack: true }));
  row4.push(makeBox(xStart, W + 6, 0, L, W, H, AMBER, { fragile: true, rotated: true }));
  row4.push(makeBox(xStart, W + 6, H, L, W, H, AMBER, { fragile: true }));
}

const ROWS_RAW = [row0, row1, row2, row3, row4];

function buildRow(rowIdx: number, boxes: Box[], container: ContainerSpec): Row {
  const xStart = Math.min(...boxes.map((b) => b.x));
  const xEnd = Math.max(...boxes.map((b) => b.x + b.l));
  const totalCbm = boxes.reduce((s, b) => s + (b.l * b.w * b.h) / 1_000_000_000, 0);
  const totalWeightKg = Math.round(boxes.length * 38);
  const hasFragile = boxes.some((b) => b.fragile);
  const hasNonStack = boxes.some((b) => b.nonStack);
  const rotatedCount = boxes.filter((b) => b.rotated).length;
  const zLevels = new Set(boxes.map((b) => Math.round(b.z / 10) * 10));
  const layers = zLevels.size;
  const bottomFootprint = boxes
    .filter((b) => b.z < 10)
    .reduce((s, b) => s + b.l * b.w, 0);
  const wallArea = container.inner.w * Math.max(1, xEnd - xStart);
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

export function buildDemoScenario(): Scenario {
  const rows = ROWS_RAW.map((boxes, i) => buildRow(i, boxes, CONTAINER));
  const allBoxes = rows.flatMap((r) => r.boxes);
  const totalCartons = allBoxes.length;
  const totalCbm = allBoxes.reduce(
    (s, b) => s + (b.l * b.w * b.h) / 1_000_000_000,
    0,
  );
  const totalWeightKg = rows.reduce((s, r) => s + r.totalWeightKg, 0);
  const utilizationPct = (totalCbm / CONTAINER.capCbm) * 100;
  // Weight-weighted COG along length, % from back wall
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const rowCenterX = (r.xStart + r.xEnd) / 2;
    num += rowCenterX * r.totalWeightKg;
    den += r.totalWeightKg;
  }
  const cogXmm = den > 0 ? num / den : 0;
  const cogOffsetPct = (cogXmm / CONTAINER.inner.l) * 100;
  return {
    container: CONTAINER,
    rows,
    allBoxes,
    totalCartons,
    totalCbm,
    totalWeightKg,
    utilizationPct,
    cogOffsetPct,
  };
}
