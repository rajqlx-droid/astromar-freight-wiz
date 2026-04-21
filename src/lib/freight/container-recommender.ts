/**
 * Smart container recommendation engine — geometry-aware.
 *
 * Given a list of cargo items, recommend the optimal container or multi-
 * container split. Validates BOTH:
 *   1. CBM/weight sanity (industry usable caps).
 *   2. Physical fit — runs the actual 3D packer against each candidate
 *      container and only accepts a container when every piece is placed.
 *      This catches cases where CBM math says "fits" but tall non-stackable
 *      pallets can't actually be packed inside the container's height.
 *
 * Pure JS, deterministic, SSR-safe.
 */

import type { CbmItem } from "./calculators";
import { CONTAINERS, type ContainerPreset } from "./packing";
import { packContainerAdvanced } from "./packing-advanced";
import { CEILING_RESERVE_MM, getGapRule } from "./gap-rules";

/**
 * Usable CBM by container — used as a fast pre-filter before running the
 * (more expensive) geometric packer. These match Searates / Maersk
 * practical limits (≈ 85% of geometric volume).
 */
export const USABLE_CBM: Record<ContainerPreset["id"], number> = {
  "20gp": 30,
  "40gp": 60,
  "40hc": 70,
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
  reason:
    | "fits-single"
    | "exceeds-single-cbm"
    | "exceeds-single-weight"
    | "exceeds-single-geometry";
  /** Optional human-readable detail for the geometry case. */
  reasonDetail?: string;
}

/** Sort containers ascending by usable CBM (smallest first). */
const ASC = [...CONTAINERS].sort(
  (a, b) => USABLE_CBM[a.id] - USABLE_CBM[b.id],
);

/** Sum CBM for a list of items. */
function sumCbm(items: CbmItem[]): number {
  let t = 0;
  for (const it of items) {
    t += ((it.length * it.width * it.height) / 1_000_000) * it.qty;
  }
  return t;
}

/** Sum weight for a list of items. */
function sumWeight(items: CbmItem[]): number {
  let t = 0;
  for (const it of items) t += it.weight * it.qty;
  return t;
}

/** Sum quantity for a list of items. */
function sumQty(items: CbmItem[]): number {
  let t = 0;
  for (const it of items) t += it.qty;
  return t;
}

/**
 * Find smallest single container that physically fits ALL items.
 * Runs the geometric packer; only accepts a container when every piece is
 * placed (and CBM/weight sanity hold).
 */
function fitSingle(
  items: CbmItem[],
): { container: ContainerPreset; geometryFails: boolean } | null {
  const cbm = sumCbm(items);
  const weightKg = sumWeight(items);
  const totalQty = sumQty(items);
  let geometryFails = false;

  for (const c of ASC) {
    // Cheap pre-filter: CBM/weight must at least theoretically fit.
    if (cbm > USABLE_CBM[c.id]) continue;
    if (weightKg > c.maxPayloadKg) continue;

    // Real geometry check.
    const pack = packContainerAdvanced(items, c);
    if (pack.placedCartons >= totalQty) {
      return { container: c, geometryFails };
    }
    // CBM/weight said yes but geometry said no — record and try a bigger box.
    geometryFails = true;
  }
  return geometryFails ? { container: ASC[ASC.length - 1], geometryFails: true } : null;
}

/**
 * Geometry-aware multi-container split.
 * Greedy: pack into the largest container (40HC), take whatever cartons
 * could NOT be placed, recursively pack the leftover into the next best
 * container, repeat until everything is placed (or we hit a hard ceiling).
 */
function splitMulti(items: CbmItem[]): RecommendedUnit[] {
  const big = CONTAINERS.find((c) => c.id === "40hc")!;
  const units: RecommendedUnit[] = [];

  let remaining: CbmItem[] = items.map((it) => ({ ...it }));
  // Hard safety ceiling — no recommendation should ever need more than 20
  // containers; if it does, something is wrong with the input dimensions.
  const MAX_UNITS = 20;

  while (sumQty(remaining) > 0 && units.length < MAX_UNITS) {
    const remCbm = sumCbm(remaining);
    const remWt = sumWeight(remaining);

    // If the remainder fits in a single smaller container, use it (closes
    // the chain with the smallest preset that physically holds the leftover).
    const lastFit = fitSingle(remaining);
    if (lastFit && !lastFit.geometryFails) {
      const c = lastFit.container;
      units.push({
        container: c,
        fillCbm: remCbm,
        fillWeightKg: remWt,
        cbmPct: (remCbm / USABLE_CBM[c.id]) * 100,
        weightPct: (remWt / c.maxPayloadKg) * 100,
      });
      break;
    }

    // Otherwise, fill a 40HC and recurse on the unplaced remainder.
    const pack = packContainerAdvanced(remaining, big);
    const placedCount = pack.placedCartons;

    // Build "unplaced" item list from the per-item stats.
    const next: CbmItem[] = [];
    let placedCbm = 0;
    let placedWt = 0;
    remaining.forEach((it, idx) => {
      const stat = pack.perItem[idx];
      const placedQty = stat?.placed ?? 0;
      const unplacedQty = Math.max(0, it.qty - placedQty);
      const single = (it.length * it.width * it.height) / 1_000_000;
      placedCbm += single * placedQty;
      placedWt += it.weight * placedQty;
      if (unplacedQty > 0) {
        next.push({ ...it, qty: unplacedQty });
      }
    });

    units.push({
      container: big,
      fillCbm: placedCbm,
      fillWeightKg: placedWt,
      cbmPct: (placedCbm / USABLE_CBM[big.id]) * 100,
      weightPct: (placedWt / big.maxPayloadKg) * 100,
    });

    // Defensive: if a single 40HC couldn't place anything (unlikely — would
    // mean a single carton is bigger than the container), bail out to avoid
    // an infinite loop.
    if (placedCount === 0) break;

    remaining = next;
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
 * Cheap CBM-only recommendation — no geometry packing.
 *
 * Used during keystroke-by-keystroke editing to render the "you'll probably
 * need ~X containers" banner without freezing the UI. Once the user clicks
 * "Optimize loading", we switch to the geometry-aware {@link recommendContainers}
 * (preferably inside a worker).
 */
export function recommendContainersFast(
  totalCbm: number,
  totalWeightKg: number,
): ContainerRecommendation {
  return recommendContainers(totalCbm, totalWeightKg);
}

/**
 * Main entry point. Pass cargo items so the recommender can validate
 * physical fit (not just CBM math).
 *
 * Backwards-compatible overload: calling with (totalCbm, totalWeightKg)
 * still works but skips the geometry check (legacy behaviour).
 */
export function recommendContainers(
  itemsOrCbm: CbmItem[] | number,
  totalWeightKg?: number,
): ContainerRecommendation {
  // Legacy CBM-only path for any caller that hasn't been updated.
  if (typeof itemsOrCbm === "number") {
    const totalCbm = itemsOrCbm;
    const wt = totalWeightKg ?? 0;
    let single: ContainerPreset | null = null;
    for (const c of ASC) {
      if (totalCbm <= USABLE_CBM[c.id] && wt <= c.maxPayloadKg) {
        single = c;
        break;
      }
    }
    if (single) {
      return {
        units: [
          {
            container: single,
            fillCbm: totalCbm,
            fillWeightKg: wt,
            cbmPct: (totalCbm / USABLE_CBM[single.id]) * 100,
            weightPct: (wt / single.maxPayloadKg) * 100,
          },
        ],
        summary: `1 × ${single.name}`,
        totalCbm,
        totalWeightKg: wt,
        isMulti: false,
        reason: "fits-single",
      };
    }
    // Fall back to a CBM-proportional 40HC chain.
    const big = CONTAINERS.find((c) => c.id === "40hc")!;
    const units: RecommendedUnit[] = [];
    let rem = totalCbm;
    let remW = wt;
    const wPerCbm = totalCbm > 0 ? wt / totalCbm : 0;
    while (rem > USABLE_CBM[big.id]) {
      const fillW = Math.min(big.maxPayloadKg, USABLE_CBM[big.id] * wPerCbm);
      units.push({
        container: big,
        fillCbm: USABLE_CBM[big.id],
        fillWeightKg: fillW,
        cbmPct: 100,
        weightPct: (fillW / big.maxPayloadKg) * 100,
      });
      rem -= USABLE_CBM[big.id];
      remW -= fillW;
    }
    if (rem > 0.0001) {
      units.push({
        container: big,
        fillCbm: rem,
        fillWeightKg: Math.max(0, remW),
        cbmPct: (rem / USABLE_CBM[big.id]) * 100,
        weightPct: (Math.max(0, remW) / big.maxPayloadKg) * 100,
      });
    }
    return {
      units,
      summary: summarize(units),
      totalCbm,
      totalWeightKg: wt,
      isMulti: units.length > 1,
      reason: totalCbm > USABLE_CBM[big.id] ? "exceeds-single-cbm" : "exceeds-single-weight",
    };
  }

  // Geometry-aware path.
  const items = itemsOrCbm;
  const totalCbm = sumCbm(items);
  const totalWt = sumWeight(items);
  const totalQty = sumQty(items);

  if (totalQty === 0) {
    return {
      units: [],
      summary: "—",
      totalCbm,
      totalWeightKg: totalWt,
      isMulti: false,
      reason: "fits-single",
    };
  }

  const single = fitSingle(items);

  if (single && !single.geometryFails) {
    const c = single.container;
    return {
      units: [
        {
          container: c,
          fillCbm: totalCbm,
          fillWeightKg: totalWt,
          cbmPct: (totalCbm / USABLE_CBM[c.id]) * 100,
          weightPct: (totalWt / c.maxPayloadKg) * 100,
        },
      ],
      summary: `1 × ${c.name}`,
      totalCbm,
      totalWeightKg: totalWt,
      isMulti: false,
      reason: "fits-single",
    };
  }

  // Need multi (or single fits CBM but not geometry).
  const units = splitMulti(items);

  // Determine reason.
  const biggest = CONTAINERS.find((c) => c.id === "40hc")!;
  let reason: ContainerRecommendation["reason"];
  let reasonDetail: string | undefined;
  if (totalCbm > USABLE_CBM[biggest.id]) {
    reason = "exceeds-single-cbm";
  } else if (totalWt > biggest.maxPayloadKg) {
    reason = "exceeds-single-weight";
  } else {
    reason = "exceeds-single-geometry";
    // Try to be specific about what went wrong: simulate against the
    // smallest container that CBM would fit in, and quote the actual
    // placed count to make the failure tangible.
    const cbmFit = ASC.find(
      (c) => totalCbm <= USABLE_CBM[c.id] && totalWt <= c.maxPayloadKg,
    );
    if (cbmFit) {
      const sim = packContainerAdvanced(items, cbmFit);
      reasonDetail = `CBM math (${totalCbm.toFixed(1)} m³) fits a ${cbmFit.name}, but height/footprint geometry caps real load at ${sim.placedCartons} of ${totalQty} pieces — escalating container size.`;
    }
  }

  return {
    units,
    summary: summarize(units),
    totalCbm,
    totalWeightKg: totalWt,
    isMulti: units.length > 1,
    reason,
    reasonDetail,
  };
}

/**
 * Split items across multiple containers for per-container packing.
 * Geometry-aware: simulates packing into each container in order, putting
 * unplaced cartons into the next bucket. Falls back to volume-greedy when
 * the recommendation only has one unit.
 */
export function splitItemsAcrossContainers(
  items: CbmItem[],
  rec: ContainerRecommendation,
): CbmItem[][] {
  if (!rec.isMulti) return [items];

  const buckets: CbmItem[][] = [];
  let remaining: CbmItem[] = items.map((it) => ({ ...it }));

  for (let i = 0; i < rec.units.length; i++) {
    const unit = rec.units[i];
    const isLast = i === rec.units.length - 1;
    if (isLast || sumQty(remaining) === 0) {
      buckets.push(remaining);
      remaining = [];
      // Fill any further buckets (shouldn't happen) with empties.
      for (let j = i + 1; j < rec.units.length; j++) buckets.push([]);
      break;
    }
    const pack = packContainerAdvanced(remaining, unit.container);
    const inBucket: CbmItem[] = [];
    const next: CbmItem[] = [];
    remaining.forEach((it, idx) => {
      const stat = pack.perItem[idx];
      const placedQty = stat?.placed ?? 0;
      const unplacedQty = Math.max(0, it.qty - placedQty);
      if (placedQty > 0) {
        inBucket.push({ ...it, id: `${it.id}-c${i}`, qty: placedQty });
      }
      if (unplacedQty > 0) {
        next.push({ ...it, qty: unplacedQty });
      }
    });
    buckets.push(inBucket);
    remaining = next;
  }

  return buckets;
}

/* --------------------------------------------------------------------------
 * Geometric ceiling analysis
 * -------------------------------------------------------------------------- */

export interface GeometricCeilingItem {
  itemIdx: number;
  itemId: string;
  shortSideMm: number;
  heightMm: number;
  fitsAcross: number;
  stacksHigh: number;
  blocksPair: boolean;
  blocksStack: boolean;
  hcUnlocksStack: boolean;
  reason: string;
}

export interface GeometricCeilingReport {
  items: GeometricCeilingItem[];
  /** True if upgrading to 40HC would meaningfully improve placement for ≥1 item. */
  suggestHc: boolean;
  /** Plain English headline summary, or null when no ceiling. */
  headline: string | null;
}

/**
 * Detect "geometric ceiling" cases — items whose physical dimensions prevent
 * the packer from making good use of the chosen container, regardless of
 * algorithm tweaks. Pure geometry, no packer call.
 */
export function analyseGeometricCeiling(
  items: CbmItem[],
  currentContainer: ContainerPreset,
): GeometricCeilingReport {
  const out: GeometricCeilingItem[] = [];
  const C = currentContainer.inner;
  const HC = CONTAINERS.find((c) => c.id === "40hc")!.inner;
  let suggestHc = false;

  items.forEach((it, idx) => {
    if (it.length <= 0 || it.width <= 0 || it.height <= 0 || it.qty <= 0) return;
    const lmm = it.length * 10;
    const wmm = it.width * 10;
    const hmm = it.height * 10;
    const stackable = it.stackable !== false;
    const rule = getGapRule(it.packageType ?? "carton");

    const shortSide = Math.min(lmm, wmm);
    const usableWidth = C.w - 2 * rule.wallMin;
    const fitsAcross = Math.max(
      1,
      Math.floor((usableWidth + rule.minGap) / (shortSide + rule.minGap)),
    );

    const usableHeight = C.h - CEILING_RESERVE_MM;
    const stacksHigh = stackable ? Math.max(1, Math.floor(usableHeight / hmm)) : 1;

    const usableHeightHc = HC.h - CEILING_RESERVE_MM;
    const stacksHighHc = stackable ? Math.max(1, Math.floor(usableHeightHc / hmm)) : 1;

    const blocksPair = fitsAcross < 2;
    const blocksStack = stackable && stacksHigh < 2;
    const hcUnlocksStack = blocksStack && stacksHighHc >= 2;

    if (!blocksPair && !blocksStack) return;

    let reason: string;
    if (blocksPair && blocksStack) {
      reason = `${it.length.toFixed(0)}×${it.width.toFixed(0)}×${it.height.toFixed(0)} cm only fits 1 across and 1 high in ${currentContainer.name} — wastes most of each row.`;
    } else if (blocksPair) {
      reason = `${it.width.toFixed(0)} cm wide — only 1 fits across the ${(C.w / 10).toFixed(0)} cm container (need ≤${((C.w - 2 * rule.wallMin - rule.minGap) / 2 / 10).toFixed(0)} cm to pair).`;
    } else {
      reason = `${it.height.toFixed(0)} cm tall — can't stack 2-high in ${currentContainer.name} (${(C.h / 10).toFixed(0)} cm inner).`;
    }
    if (hcUnlocksStack) {
      reason += " Switching to 40ft HC would allow 2-high stacking.";
      suggestHc = true;
    }

    out.push({
      itemIdx: idx,
      itemId: it.id,
      shortSideMm: shortSide,
      heightMm: hmm,
      fitsAcross,
      stacksHigh,
      blocksPair,
      blocksStack,
      hcUnlocksStack,
      reason,
    });
  });

  const headline =
    out.length > 0
      ? `Geometric ceiling: ${out.map((o) => `Item ${o.itemIdx + 1}`).join(", ")} can't be packed efficiently in ${currentContainer.name}.`
      : null;

  return { items: out, suggestHc, headline };
}

