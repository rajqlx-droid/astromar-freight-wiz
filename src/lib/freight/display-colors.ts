/**
 * Adjacency-aware display colors.
 *
 * The packer assigns each box a base color from `ITEM_COLORS` keyed by SKU
 * index. That works great for distinguishing different SKUs, but when one
 * SKU has hundreds of cartons, every neighbour shares the same fill and the
 * internal seams disappear — visually the cargo blob looks like one big
 * shape, and any actual overlap would be impossible to spot.
 *
 * `assignDisplayColors(placed)` returns a Map<boxId, hex> where every box
 * whose neighbour shares its base color is shifted to a lighter/darker
 * variant of the same hue. The overall hue still tells you "this is SKU A",
 * but every individual carton draws a clear edge against its neighbour.
 *
 * Two boxes are "touching" if their AABBs share a face (gap < 2 mm in one
 * axis, overlap > 0 in the other two). Touching is computed via a 100 mm
 * spatial hash so the cost stays effectively linear in box count.
 */
import type { PlacedBox } from "./packing";
import { lighten, darken } from "./packing";

const TOUCH_EPS_MM = 2;
const CELL_MM = 100;

interface BoxRef {
  idx: number;
  box: PlacedBox;
}

function cellKey(cx: number, cy: number, cz: number): string {
  return `${cx}|${cy}|${cz}`;
}

function aabbsTouch(a: PlacedBox, b: PlacedBox): boolean {
  const dxGap = Math.max(a.x - (b.x + b.l), b.x - (a.x + a.l));
  const dyGap = Math.max(a.y - (b.y + b.w), b.y - (a.y + a.w));
  const dzGap = Math.max(a.z - (b.z + b.h), b.z - (a.z + a.h));
  // touching = one axis flush within EPS, the other two overlapping
  const axisFlush = (g: number) => g >= -TOUCH_EPS_MM && g <= TOUCH_EPS_MM;
  const axisOverlap = (g: number) => g < -TOUCH_EPS_MM;
  if (axisFlush(dxGap) && axisOverlap(dyGap) && axisOverlap(dzGap)) return true;
  if (axisFlush(dyGap) && axisOverlap(dxGap) && axisOverlap(dzGap)) return true;
  if (axisFlush(dzGap) && axisOverlap(dxGap) && axisOverlap(dyGap)) return true;
  return false;
}

function colorDistance(a: string, b: string): number {
  const parse = (h: string) => {
    const v = h.replace("#", "");
    return [
      parseInt(v.slice(0, 2), 16),
      parseInt(v.slice(2, 4), 16),
      parseInt(v.slice(4, 6), 16),
    ];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

/**
 * Returns a Map keyed by `${box.x}|${box.y}|${box.z}|${box.itemIdx}` (stable
 * per placement) → display hex. Caller looks up by computing the same key
 * from a `PlacedBox`.
 */
export function assignDisplayColors(placed: PlacedBox[]): Map<string, string> {
  const out = new Map<string, string>();
  if (placed.length === 0) return out;

  // Three shade variants per base hue: original, lighter (+25%), darker (-25%).
  const shadeCache = new Map<string, [string, string, string]>();
  const shadesFor = (base: string): [string, string, string] => {
    const cached = shadeCache.get(base);
    if (cached) return cached;
    const variants: [string, string, string] = [
      base,
      lighten(base, 0.28),
      darken(base, 0.28),
    ];
    shadeCache.set(base, variants);
    return variants;
  };

  // Spatial hash: cell key → list of box refs whose AABB intersects that cell.
  const buckets = new Map<string, BoxRef[]>();
  for (let i = 0; i < placed.length; i++) {
    const b = placed[i];
    const cx0 = Math.floor(b.x / CELL_MM);
    const cy0 = Math.floor(b.y / CELL_MM);
    const cz0 = Math.floor(b.z / CELL_MM);
    const cx1 = Math.floor((b.x + b.l) / CELL_MM);
    const cy1 = Math.floor((b.y + b.w) / CELL_MM);
    const cz1 = Math.floor((b.z + b.h) / CELL_MM);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const k = cellKey(cx, cy, cz);
          let bucket = buckets.get(k);
          if (!bucket) {
            bucket = [];
            buckets.set(k, bucket);
          }
          bucket.push({ idx: i, box: b });
        }
      }
    }
  }

  // For each box, find neighbours via the buckets it sits in.
  const neighbourMap: number[][] = placed.map(() => []);
  const seenPair = new Set<string>();
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        const pairKey = a.idx < b.idx ? `${a.idx}_${b.idx}` : `${b.idx}_${a.idx}`;
        if (seenPair.has(pairKey)) continue;
        seenPair.add(pairKey);
        if (aabbsTouch(a.box, b.box)) {
          neighbourMap[a.idx].push(b.idx);
          neighbourMap[b.idx].push(a.idx);
        }
      }
    }
  }

  // Walk boxes in deterministic order. For each, pick the shade variant whose
  // minimum distance to every already-assigned touching neighbour is largest.
  const keyOf = (b: PlacedBox) => `${b.x}|${b.y}|${b.z}|${b.itemIdx}`;

  for (let i = 0; i < placed.length; i++) {
    const box = placed[i];
    const variants = shadesFor(box.color);
    const neighbours = neighbourMap[i];

    // Gather already-assigned neighbour colors.
    const taken: string[] = [];
    for (const nIdx of neighbours) {
      const nb = placed[nIdx];
      const nKey = keyOf(nb);
      const c = out.get(nKey);
      if (c) taken.push(c);
    }

    if (taken.length === 0) {
      // First box in its cluster keeps the base hue.
      out.set(keyOf(box), variants[0]);
      continue;
    }

    // Score each variant by the *minimum* distance to any taken neighbour.
    // Higher = more contrast with the closest-coloured neighbour.
    let bestVariant = variants[0];
    let bestScore = -Infinity;
    for (const v of variants) {
      let minD = Infinity;
      for (const t of taken) {
        const d = colorDistance(v, t);
        if (d < minD) minD = d;
      }
      if (minD > bestScore) {
        bestScore = minD;
        bestVariant = v;
      }
    }
    out.set(keyOf(box), bestVariant);
  }

  return out;
}

/** Stable lookup key matching the one used inside `assignDisplayColors`. */
export function displayColorKey(b: PlacedBox): string {
  return `${b.x}|${b.y}|${b.z}|${b.itemIdx}`;
}
