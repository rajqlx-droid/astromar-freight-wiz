import { packContainerAdvanced, type AdvancedPackResult } from "./packing-advanced";

import { computeComplianceReport, type ComplianceReport } from "./compliance";

import { buildRows } from "./loading-rows";

import { validateAdvancedPack, type GeometryAudit } from "./geometry-validator";

import type { CbmItem } from "./calculators";

import type { ContainerPreset } from "./packing";

export type StrategyId = "row-back" | "weight-first" | "floor-first" | "mixed";

export interface ScenarioResult {

  strategyId: StrategyId;

  strategyName: string;

  pack: AdvancedPackResult;

  utilizationPct: number;

  voidPct: number;

  placedPct: number;

  cogOk: boolean;

  compliance: ComplianceReport;

  isBest: boolean;

  rank: number;

}

function sortByStrategy(items: CbmItem[], strategy: StrategyId): CbmItem[] {

  const c = [...items];

  if (strategy === "weight-first") {

    c.sort((a, b) => b.weight * b.qty - a.weight * a.qty);

  } else if (strategy === "floor-first") {

    c.sort((a, b) => b.length * b.width - a.length * a.width);

  } else if (strategy === "mixed") {

    c.sort((a, b) => b.length * b.width * b.height - a.length * a.width * a.height);

  }

  return c;

}

export function runAllScenarios(

  items: CbmItem[],

  container: ContainerPreset,

  strategiesToRun: StrategyId[] = ["row-back"]

): ScenarioResult[] {

  const allStrategies: Array<{ id: StrategyId; name: string }> = [

    { id: "row-back",     name: "Row: Back → Front" },

    { id: "weight-first", name: "Heavy First" },

    { id: "floor-first",  name: "Floor Maximise" },

    { id: "mixed",        name: "Loader Natural" },

  ];

  const strategies = allStrategies.filter((s) => strategiesToRun.includes(s.id));

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const scaleFactor = totalQty > 300 ? 300 / totalQty : 1;
  const safeItems = scaleFactor < 1
    ? items.map(i => ({ ...i, qty: Math.max(1, Math.round(i.qty * scaleFactor)) }))
    : items;

  const results = strategies.map((s) => {
    // Pass the strategy id straight to the packer so its internal sort actually
    // honours the user's chosen approach (previously the runner re-sorted, but
    // packContainerAdvanced re-sorted internally and discarded the hint).
    const pack = packContainerAdvanced(safeItems, container, s.id);
    // Build rows once per scenario so the foundation-rules audit (FLOOR_GAP)
    // sees the same row groupings the loading-rows panel surfaces.
    const rows = pack.placed.length > 0 ? buildRows(pack) : [];
    const geometryAudit = validateAdvancedPack(pack);
    const compliance = computeComplianceReport(pack, { rows, geometryAudit });
    const placedPct =
      pack.totalCartons > 0 ? (pack.placedCartons / pack.totalCartons) * 100 : 100;
    return {
      strategyId: s.id,
      strategyName: s.name,
      pack,
      utilizationPct: pack.utilizationPct,
      voidPct: Math.max(0, 100 - pack.utilizationPct),
      placedPct,
      cogOk: Math.abs(pack.cogOffsetPct) <= 0.2,
      compliance,
      isBest: false,
      rank: 0,
    };
  });

  results.sort((a, b) =>

    b.compliance.score !== a.compliance.score

      ? b.compliance.score - a.compliance.score

      : b.utilizationPct - a.utilizationPct

  );

  return results.map((r, i) => ({ ...r, isBest: i === 0, rank: i + 1 }));

}

export interface ShutOutTotals {
  /** Cartons left unplaced by the densest legal plan. */
  cartons: number;
  /** Volume of unplaced cartons in m³. */
  cbm: number;
  /** Weight of unplaced cartons in kg. */
  weightKg: number;
}

export interface BestPlanMeta {
  /** Cartons / CBM / weight the densest plan could not place. null when nothing was shut out. */
  shutOut: ShutOutTotals | null;
  /** True when at least one strategy passed every hard physical check. */
  allLegal: boolean;
  /** Hard violation messages from the chosen plan's compliance report (overlap, hanging, weight overload, gap with vertical overlap, ceiling). */
  hardViolations: string[];
}

export interface BestPlan {
  /** The densest legal pack across all tried strategies. */
  best: ScenarioResult;
  /** Every strategy result (legal + filtered) for diagnostics. */
  all: ScenarioResult[];
  /** Aggregated decision metadata for the HUD / recommender. */
  meta: BestPlanMeta;
  /** Canonical post-pack geometry audit for the chosen plan. */
  audit: GeometryAudit;
}

/**
 * Internal scenario sweep — runs every strategy at FULL container geometry
 * (no qty downscale, no stowage haircut), filters out plans with hard
 * physical violations, and returns the densest survivor by placedCargoCbm.
 *
 * Tie-break: more cartons placed → higher compliance score.
 *
 * Hard rules enforced via the shared geometry validator:
 *   - no overlap, no hanging cargo (SUPPORT_MIN_RATIO 0.85)
 *   - tight (flush) lateral packing — no enforced neighbour or wall gap
 *   - door + ceiling reserves (100 mm / 80 mm)
 *   - non-stackable / fragile cannot carry load
 */
export function pickBestPlan(
  items: CbmItem[],
  container: ContainerPreset,
): BestPlan {
  const allStrategies: Array<{ id: StrategyId; name: string }> = [
    { id: "row-back",     name: "Row: Back → Front" },
    { id: "weight-first", name: "Heavy First" },
    { id: "floor-first",  name: "Floor Maximise" },
    { id: "mixed",        name: "Loader Natural" },
  ];

  const audits = new Map<string, GeometryAudit>();
  const results: ScenarioResult[] = allStrategies.map((s) => {
    // No qty scaling here: the optimise path must use 100% of the manifest
    // against 100% of the container's geometric inner dimensions.
    const pack = packContainerAdvanced(items, container, s.id);
    const rows = pack.placed.length > 0 ? buildRows(pack) : [];
    const geometryAudit = validateAdvancedPack(pack);
    audits.set(s.id, geometryAudit);
    const compliance = computeComplianceReport(pack, { rows, geometryAudit });
    const placedPct =
      pack.totalCartons > 0 ? (pack.placedCartons / pack.totalCartons) * 100 : 100;
    return {
      strategyId: s.id,
      strategyName: s.name,
      pack,
      utilizationPct: pack.utilizationPct,
      voidPct: Math.max(0, 100 - pack.utilizationPct),
      placedPct,
      cogOk: Math.abs(pack.cogOffsetPct) <= 0.2,
      compliance,
      isBest: false,
      rank: 0,
    };
  });

  // Filter using the shared geometry audit (single source of truth).
  // UNPLACED is YELLOW so shut-out alone never blocks the legal pool.
  const legal = results.filter((r) => audits.get(r.strategyId)?.allLegal === true);

  // Helper: count RED violations in a plan. Used as the primary tiebreak
  // when no plan is fully legal — we then pick the *cleanest* plan.
  const redCount = (r: ScenarioResult) =>
    audits.get(r.strategyId)?.violations.length ?? 0;

  // Compute shut-out totals from the manifest minus what the chosen plan
  // physically placed. Pure manifest math — no per-strategy guesswork.
  const computeShutOut = (chosen: ScenarioResult): ShutOutTotals | null => {
    const placedCartons = chosen.pack.placedCartons;
    const totalCartons = chosen.pack.totalCartons;
    if (placedCartons >= totalCartons) return null;
    let cartons = 0;
    let cbm = 0;
    let weightKg = 0;
    items.forEach((it, idx) => {
      const stat = chosen.pack.perItem[idx];
      const placed = stat?.placed ?? 0;
      const unplaced = Math.max(0, it.qty - placed);
      if (unplaced <= 0) return;
      cartons += unplaced;
      cbm += ((it.length * it.width * it.height) / 1_000_000) * unplaced;
      weightKg += it.weight * unplaced;
    });
    if (cartons === 0 && cbm < 0.0001 && weightKg < 0.01) return null;
    return { cartons, cbm, weightKg };
  };

  const buildMeta = (chosen: ScenarioResult, allLegal: boolean): BestPlanMeta => {
    const audit = audits.get(chosen.strategyId);
    return {
      shutOut: computeShutOut(chosen),
      allLegal,
      // Use the validator's own messages so HUD copy never drifts from
      // the optimiser's verdict.
      hardViolations: audit ? audit.violations.map((v) => v.message) : [],
    };
  };

  if (legal.length > 0) {
    legal.sort((a, b) => {
      if (b.pack.placedCargoCbm !== a.pack.placedCargoCbm)
        return b.pack.placedCargoCbm - a.pack.placedCargoCbm;
      if (b.pack.placedCartons !== a.pack.placedCartons)
        return b.pack.placedCartons - a.pack.placedCartons;
      return b.compliance.score - a.compliance.score;
    });
    const ranked = legal.map((r, i) => ({ ...r, isBest: i === 0, rank: i + 1 }));
    return {
      best: ranked[0],
      all: ranked,
      meta: buildMeta(ranked[0], true),
      audit: audits.get(ranked[0].strategyId)!,
    };
  }

  const pool = [...results];
  pool.sort((a, b) => {
    const ra = redCount(a);
    const rb = redCount(b);
    if (ra !== rb) return ra - rb;
    if (b.compliance.score !== a.compliance.score)
      return b.compliance.score - a.compliance.score;
    if (b.pack.placedCargoCbm !== a.pack.placedCargoCbm)
      return b.pack.placedCargoCbm - a.pack.placedCargoCbm;
    return b.pack.placedCartons - a.pack.placedCartons;
  });

  const ranked = pool.map((r, i) => ({ ...r, isBest: i === 0, rank: i + 1 }));
  return {
    best: ranked[0],
    all: ranked,
    meta: buildMeta(ranked[0], false),
    audit: audits.get(ranked[0].strategyId)!,
  };
}
