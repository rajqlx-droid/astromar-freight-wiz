/**
 * Smart container recommendation engine — geometry-aware, single-container only.
 *
 * Policy: the platform only ships in a single container (max 40ft High Cube).
 * Multi-container splits are no longer supported. When cargo exceeds the
 * 40HC's usable capacity, the recommender returns a "shut out" report
 * detailing how many cartons / how much volume / how much weight cannot
 * physically be loaded so the user can adjust the manifest.
 *
 * Pure JS, deterministic, SSR-safe.
 */

import type { CbmItem } from "./calculators";
import { CONTAINERS, type ContainerPreset } from "./packing";
import { packContainerAdvanced, type AdvancedPackResult } from "./packing-advanced";
import { pickBestPlan } from "./scenario-runner";
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

/**
 * Cargo that physically cannot be loaded into the chosen container.
 * Triggered when the cargo manifest exceeds a single 40HC's capacity
 * (volume, weight, or geometric placement).
 */
export interface CargoShutOut {
  /** Number of cartons that couldn't be loaded. */
  cartons: number;
  /** Volume of unloaded cartons in m³. */
  cbm: number;
  /** Weight of unloaded cartons in kg. */
  weightKg: number;
  /** Why the shut-out occurred. */
  reason: "exceeds-cbm" | "exceeds-weight" | "exceeds-geometry";
}

export interface ContainerRecommendation {
  /** Always exactly one unit — the single recommended container (max 40HC). */
  units: RecommendedUnit[];
  /** Human-readable summary, e.g. "1 × 40ft HC". */
  summary: string;
  /** Total CBM and weight of the full manifest (including any shut-out cargo). */
  totalCbm: number;
  totalWeightKg: number;
  /** Always false — multi-container is no longer supported. Kept for API stability. */
  isMulti: false;
  /** Reason this recommendation was triggered. */
  reason:
    | "fits-single"
    | "exceeds-single-cbm"
    | "exceeds-single-weight"
    | "exceeds-single-geometry";
  /** Optional human-readable detail for the geometry case. */
  reasonDetail?: string;
  /** Cargo that won't fit even into the largest container (40HC). */
  shutOut?: CargoShutOut;
}

/** Sort containers ascending by usable CBM (smallest first). */
const ASC = [...CONTAINERS].sort(
  (a, b) => USABLE_CBM[a.id] - USABLE_CBM[b.id],
);

/** The ceiling — only container we ever escalate to. */
const MAX_CONTAINER = CONTAINERS.find((c) => c.id === "40hc")!;

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
 * Uses the multi-strategy optimiser so a fit isn't missed because the
 * default strategy happened to leave residue while another would have
 * placed everything.
 * Returns null when even a 40HC can't hold the load.
 */
function fitSingle(items: CbmItem[]): ContainerPreset | null {
  const cbm = sumCbm(items);
  const weightKg = sumWeight(items);
  const totalQty = sumQty(items);

  for (const c of ASC) {
    if (cbm > USABLE_CBM[c.id]) continue;
    if (weightKg > c.maxPayloadKg) continue;
    const { best } = pickBestPlan(items, c);
    if (best.pack.placedCartons >= totalQty) return c;
  }
  return null;
}

/**
 * Compute the cargo shut-out report when the manifest exceeds 40HC capacity.
 * Runs the multi-strategy optimiser against the 40HC and reports unplaced
 * cartons / cbm / kg from the densest legal plan.
 */
function computeShutOut(
  items: CbmItem[],
  reason: CargoShutOut["reason"],
  pack?: AdvancedPackResult,
): CargoShutOut {
  const result = pack ?? pickBestPlan(items, MAX_CONTAINER).best.pack;
  let cartons = 0;
  let cbm = 0;
  let weightKg = 0;
  items.forEach((it, idx) => {
    const stat = result.perItem[idx];
    const placed = stat?.placed ?? 0;
    const unplaced = Math.max(0, it.qty - placed);
    if (unplaced <= 0) return;
    cartons += unplaced;
    cbm += ((it.length * it.width * it.height) / 1_000_000) * unplaced;
    weightKg += it.weight * unplaced;
  });
  return { cartons, cbm, weightKg, reason };
}

/**
 * Cheap CBM-only recommendation — no geometry packing.
 *
 * Used during keystroke-by-keystroke editing to render the suggestion
 * banner without freezing the UI. Once the user clicks "Optimize loading",
 * we switch to the geometry-aware {@link recommendContainers}
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
    // Cargo exceeds 40HC capacity → cap the recommendation at one 40HC and
    // report shut-out cargo derived from CBM/weight overflow.
    const cbmOverflow = Math.max(0, totalCbm - USABLE_CBM[MAX_CONTAINER.id]);
    const weightOverflow = Math.max(0, wt - MAX_CONTAINER.maxPayloadKg);
    const reason: ContainerRecommendation["reason"] =
      totalCbm > USABLE_CBM[MAX_CONTAINER.id]
        ? "exceeds-single-cbm"
        : "exceeds-single-weight";
    const shutOutReason: CargoShutOut["reason"] =
      reason === "exceeds-single-cbm" ? "exceeds-cbm" : "exceeds-weight";
    return {
      units: [
        {
          container: MAX_CONTAINER,
          fillCbm: Math.min(totalCbm, USABLE_CBM[MAX_CONTAINER.id]),
          fillWeightKg: Math.min(wt, MAX_CONTAINER.maxPayloadKg),
          cbmPct: 100,
          weightPct: Math.min(100, (wt / MAX_CONTAINER.maxPayloadKg) * 100),
        },
      ],
      summary: `1 × ${MAX_CONTAINER.name}`,
      totalCbm,
      totalWeightKg: wt,
      isMulti: false,
      reason,
      shutOut: {
        // Without item geometry we can only estimate from CBM; report 0
        // cartons (caller can switch to the geometry path for exact counts).
        cartons: 0,
        cbm: cbmOverflow,
        weightKg: weightOverflow,
        reason: shutOutReason,
      },
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

  if (single) {
    return {
      units: [
        {
          container: single,
          fillCbm: totalCbm,
          fillWeightKg: totalWt,
          cbmPct: (totalCbm / USABLE_CBM[single.id]) * 100,
          weightPct: (totalWt / single.maxPayloadKg) * 100,
        },
      ],
      summary: `1 × ${single.name}`,
      totalCbm,
      totalWeightKg: totalWt,
      isMulti: false,
      reason: "fits-single",
    };
  }

  // Cargo can't fit in even a 40HC — pin the recommendation to a single 40HC
  // and surface a shut-out report. Run the optimiser ONCE here and reuse its
  // pack result so the headline number and shut-out totals stay consistent.
  const bestPlan = pickBestPlan(items, MAX_CONTAINER).best.pack;

  let reason: ContainerRecommendation["reason"];
  let reasonDetail: string | undefined;
  let shutOutReason: CargoShutOut["reason"];
  if (totalCbm > USABLE_CBM[MAX_CONTAINER.id]) {
    reason = "exceeds-single-cbm";
    shutOutReason = "exceeds-cbm";
  } else if (totalWt > MAX_CONTAINER.maxPayloadKg) {
    reason = "exceeds-single-weight";
    shutOutReason = "exceeds-weight";
  } else {
    reason = "exceeds-single-geometry";
    shutOutReason = "exceeds-geometry";
    reasonDetail = `CBM math (${totalCbm.toFixed(1)} m³) fits a 40ft HC, but height/footprint geometry caps real load at ${bestPlan.placedCartons} of ${totalQty} pieces.`;
  }

  const shutOut = computeShutOut(items, shutOutReason, bestPlan);
  const placedCbm = Math.max(0, totalCbm - shutOut.cbm);
  const placedWt = Math.max(0, totalWt - shutOut.weightKg);

  return {
    units: [
      {
        container: MAX_CONTAINER,
        fillCbm: placedCbm,
        fillWeightKg: placedWt,
        cbmPct: Math.min(100, (placedCbm / USABLE_CBM[MAX_CONTAINER.id]) * 100),
        weightPct: Math.min(100, (placedWt / MAX_CONTAINER.maxPayloadKg) * 100),
      },
    ],
    summary: `1 × ${MAX_CONTAINER.name}`,
    totalCbm,
    totalWeightKg: totalWt,
    isMulti: false,
    reason,
    reasonDetail,
    shutOut,
  };
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
