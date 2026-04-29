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
  /**
   * Optional hint: the strategy id that won the previous call for the SAME
   * container. If the new winner's `placedCargoCbm` is within 1% of the
   * previous winner AND `placedCartons` matches exactly, keep the previous
   * winner to prevent flicker on tiny input edits. Pass `undefined` on
   * container-type changes — stickiness must not bleed across geometries.
   */
  previousStrategyId?: StrategyId,
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
    let pack = packContainerAdvanced(items, container, s.id);
    // CoG-rescue: if the tight pack is dangerously off-centre (>18% offset),
    // retry that strategy with spread mode forced ON and keep whichever
    // pack has the better |cogOffsetPct| — but only when the rescue doesn't
    // sacrifice cartons placed.
    if (Math.abs(pack.cogOffsetPct) > 0.18) {
      const rescue = packContainerAdvanced(items, container, s.id, true);
      if (
        rescue.placedCartons >= pack.placedCartons &&
        Math.abs(rescue.cogOffsetPct) < Math.abs(pack.cogOffsetPct)
      ) {
        pack = rescue;
      }
    }
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

  // Determine if ANY plan fits the entire manifest. Drives the ranking rule:
  //   - Full-fit available → density wins (we have headroom, optimise volume).
  //   - Otherwise → fewest-shut-out wins (minimise cartons left behind).
  const anyFullFit = results.some(
    (r) => r.pack.totalCartons > 0 && r.pack.placedCartons >= r.pack.totalCartons,
  );

  // Compare two plans according to the active rule. Returns negative if a
  // should rank before b. Used for both the legal pool and the red-fallback
  // pool so ranking is consistent regardless of compliance state.
  const compareByRule = (a: ScenarioResult, b: ScenarioResult) => {
    if (anyFullFit) {
      // Full-fit ranking: densest CBM → most cartons → compliance.
      if (b.pack.placedCargoCbm !== a.pack.placedCargoCbm)
        return b.pack.placedCargoCbm - a.pack.placedCargoCbm;
      if (b.pack.placedCartons !== a.pack.placedCartons)
        return b.pack.placedCartons - a.pack.placedCartons;
      return b.compliance.score - a.compliance.score;
    }
    // Partial-fit ranking: leave the fewest cartons behind.
    if (b.pack.placedCartons !== a.pack.placedCartons)
      return b.pack.placedCartons - a.pack.placedCartons;
    if (b.pack.placedCargoCbm !== a.pack.placedCargoCbm)
      return b.pack.placedCargoCbm - a.pack.placedCargoCbm;
    if (b.pack.placedWeightKg !== a.pack.placedWeightKg)
      return b.pack.placedWeightKg - a.pack.placedWeightKg;
    const ra = redCount(a);
    const rb = redCount(b);
    if (ra !== rb) return ra - rb;
    return b.compliance.score - a.compliance.score;
  };

  // Stickiness: if the previous winner is within 1% placedCargoCbm AND has
  // the same placedCartons as the freshly-computed winner, keep the previous
  // winner so trivial input edits don't flip the displayed strategy.
  const applyStickiness = (sorted: ScenarioResult[]): ScenarioResult[] => {
    if (!previousStrategyId || sorted.length < 2) return sorted;
    const fresh = sorted[0];
    const prev = sorted.find((r) => r.strategyId === previousStrategyId);
    if (!prev || prev === fresh) return sorted;
    const cbmDelta = fresh.pack.placedCargoCbm - prev.pack.placedCargoCbm;
    const cbmRel = fresh.pack.placedCargoCbm > 0
      ? cbmDelta / fresh.pack.placedCargoCbm
      : 0;
    if (cbmRel < 0.01 && prev.pack.placedCartons === fresh.pack.placedCartons) {
      // Move prev to front, keep relative order of others.
      return [prev, ...sorted.filter((r) => r !== prev)];
    }
    return sorted;
  };

  if (legal.length > 0) {
    const sorted = applyStickiness([...legal].sort(compareByRule));
    const ranked = sorted.map((r, i) => ({ ...r, isBest: i === 0, rank: i + 1 }));
    return {
      best: ranked[0],
      all: ranked,
      meta: buildMeta(ranked[0], true),
      audit: audits.get(ranked[0].strategyId)!,
    };
  }

  // No legal plan — apply the same rule, then fold in red-violation count
  // as a safety tiebreak so the cleanest dirty plan still wins ties.
  const sorted = applyStickiness(
    [...results].sort((a, b) => {
      const primary = compareByRule(a, b);
      if (primary !== 0) return primary;
      return redCount(a) - redCount(b);
    }),
  );
  const ranked = sorted.map((r, i) => ({ ...r, isBest: i === 0, rank: i + 1 }));
  return {
    best: ranked[0],
    all: ranked,
    meta: buildMeta(ranked[0], false),
    audit: audits.get(ranked[0].strategyId)!,
  };
}
