/**
 * Smart container recommendation engine.
 *
 * Given total cargo CBM and weight, recommend the optimal container or
 * multi-container split using industry-standard usable capacities (≈85%
 * of geometric volume after dunnage / packing inefficiency).
 *
 * Pure JS, deterministic, SSR-safe. No dependencies.
 */

import type { CbmItem } from "./calculators";
import { CONTAINERS, type ContainerPreset } from "./packing";

/**
 * Usable CBM by container (recommended max load — leaves headroom for
 * dunnage, mixed orientations, and stowage inefficiency). These match
 * what shippers like Searates / Maersk publish as practical limits.
 */
export const USABLE_CBM: Record<ContainerPreset["id"], number> = {
  "20gp": 28,
  "40gp": 58,
  "40hc": 68,
};

export interface RecommendedUnit {
  container: ContainerPreset;
  fillCbm: number;
  fillWeightKg: number;
  cbmPct: number;
  weightPct: number;
}

export interface ContainerRecommendation {
  /** Suggested mix as ordered units (largest first). */
  units: RecommendedUnit[];
  /** Human-readable summary, e.g. "1 × 40ft HC". */
  summary: string;
  /** Total CBM and weight that drove the recommendation. */
  totalCbm: number;
  totalWeightKg: number;
  /** True if this requires more than one container. */
  isMulti: boolean;
  /** Reason this recommendation was triggered. */
  reason: "fits-single" | "exceeds-single-cbm" | "exceeds-single-weight";
}

/** Sort containers ascending by usable CBM (smallest first). */
const ASC = [...CONTAINERS].sort(
  (a, b) => USABLE_CBM[a.id] - USABLE_CBM[b.id],
);

/** Find smallest single container that fits both CBM and weight. */
function fitSingle(
  cbm: number,
  weightKg: number,
): ContainerPreset | null {
  for (const c of ASC) {
    if (cbm <= USABLE_CBM[c.id] && weightKg <= c.maxPayloadKg) return c;
  }
  return null;
}

/**
 * Greedy multi-container split: fill biggest container repeatedly,
 * then add smallest container that fits the remainder.
 */
function splitMulti(cbm: number, weightKg: number): RecommendedUnit[] {
  const big = CONTAINERS.find((c) => c.id === "40hc")!;
  const usableBig = USABLE_CBM[big.id];
  // Distribute weight proportionally to volume.
  const weightPerCbm = cbm > 0 ? weightKg / cbm : 0;
  const units: RecommendedUnit[] = [];
  let remCbm = cbm;
  let remWt = weightKg;

  while (remCbm > usableBig) {
    const fillW = Math.min(big.maxPayloadKg, usableBig * weightPerCbm);
    units.push({
      container: big,
      fillCbm: usableBig,
      fillWeightKg: fillW,
      cbmPct: 100,
      weightPct: (fillW / big.maxPayloadKg) * 100,
    });
    remCbm -= usableBig;
    remWt -= fillW;
  }
  if (remCbm > 0.0001) {
    const last = fitSingle(remCbm, Math.max(0, remWt)) ?? big;
    units.push({
      container: last,
      fillCbm: remCbm,
      fillWeightKg: Math.max(0, remWt),
      cbmPct: (remCbm / USABLE_CBM[last.id]) * 100,
      weightPct: (Math.max(0, remWt) / last.maxPayloadKg) * 100,
    });
  }
  return units;
}

function summarize(units: RecommendedUnit[]): string {
  const counts = new Map<string, { name: string; n: number }>();
  for (const u of units) {
    const key = u.container.id;
    const cur = counts.get(key) ?? { name: u.container.name, n: 0 };
    cur.n += 1;
    counts.set(key, cur);
  }
  return Array.from(counts.values())
    .map((c) => `${c.n} × ${c.name}`)
    .join(" + ");
}

/**
 * Main entry point. Returns the recommended container mix.
 */
export function recommendContainers(
  totalCbm: number,
  totalWeightKg: number,
): ContainerRecommendation {
  const single = fitSingle(totalCbm, totalWeightKg);

  if (single) {
    const unit: RecommendedUnit = {
      container: single,
      fillCbm: totalCbm,
      fillWeightKg: totalWeightKg,
      cbmPct: (totalCbm / USABLE_CBM[single.id]) * 100,
      weightPct: (totalWeightKg / single.maxPayloadKg) * 100,
    };
    return {
      units: [unit],
      summary: `1 × ${single.name}`,
      totalCbm,
      totalWeightKg,
      isMulti: false,
      reason: "fits-single",
    };
  }

  // Need multi.
  const units = splitMulti(totalCbm, totalWeightKg);
  // Determine reason.
  const biggest = CONTAINERS.find((c) => c.id === "40hc")!;
  const reason: ContainerRecommendation["reason"] =
    totalCbm > USABLE_CBM[biggest.id]
      ? "exceeds-single-cbm"
      : "exceeds-single-weight";

  return {
    units,
    summary: summarize(units),
    totalCbm,
    totalWeightKg,
    isMulti: true,
    reason,
  };
}

/**
 * Split items across multiple containers for per-container packing.
 * Greedy: assign each item (group) to the first container with capacity.
 * Returns one CbmItem[] per recommended unit.
 */
export function splitItemsAcrossContainers(
  items: CbmItem[],
  rec: ContainerRecommendation,
): CbmItem[][] {
  if (!rec.isMulti) return [items];

  // Capacity buckets, in m³ remaining per unit.
  const caps = rec.units.map((u) => USABLE_CBM[u.container.id]);
  const buckets: CbmItem[][] = rec.units.map(() => []);

  // Sort items largest-volume first to pack into biggest space.
  const sorted = items
    .map((it, idx) => ({
      it,
      idx,
      vol: (it.length * it.width * it.height) / 1_000_000,
    }))
    .sort((a, b) => b.vol * b.it.qty - a.vol * a.it.qty);

  for (const { it, vol } of sorted) {
    let qtyRemaining = it.qty;
    while (qtyRemaining > 0) {
      // Find bucket with most remaining capacity that can hold ≥1 piece.
      let best = -1;
      let bestCap = -1;
      for (let i = 0; i < caps.length; i++) {
        if (caps[i] >= vol && caps[i] > bestCap) {
          bestCap = caps[i];
          best = i;
        }
      }
      if (best === -1) {
        // No bucket can hold even one — overflow into the largest bucket.
        let max = 0;
        for (let i = 1; i < caps.length; i++) if (caps[i] > caps[max]) max = i;
        best = max;
      }
      const fitQty = Math.max(1, Math.min(qtyRemaining, Math.floor(caps[best] / vol)));
      buckets[best].push({ ...it, id: `${it.id}-c${best}`, qty: fitQty });
      caps[best] -= fitQty * vol;
      qtyRemaining -= fitQty;
    }
  }
  return buckets;
}
