import { packContainerAdvanced, type AdvancedPackResult } from "./packing-advanced";

import { computeComplianceReport, type ComplianceReport } from "./compliance";

import { buildRows } from "./loading-rows";

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
    const compliance = computeComplianceReport(pack, { rows });
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

export interface BestPlan {
  /** The densest legal pack across all tried strategies. */
  best: ScenarioResult;
  /** Every strategy result (legal + filtered) for diagnostics. */
  all: ScenarioResult[];
}

/**
 * Internal scenario sweep — runs every strategy at FULL container geometry
 * (no qty downscale, no stowage haircut), filters out plans with hard
 * physical violations, and returns the densest survivor by placedCargoCbm.
 *
 * Tie-break: more cartons placed → higher compliance score.
 *
 * Hard rules enforced via the compliance report:
 *   - no overlap, no hanging cargo (SUPPORT_MIN_RATIO 0.85 in the packer)
 *   - 50 mm minimum gap (gap-rules.ts)
 *   - door / ceiling reserves
 * The packer itself rejects placements that would violate these — we then
 * confirm via compliance.canApprove that the *resulting* plan is clean.
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

  const results: ScenarioResult[] = allStrategies.map((s) => {
    // No qty scaling here: the optimise path must use 100% of the manifest
    // against 100% of the container's geometric inner dimensions.
    const pack = packContainerAdvanced(items, container, s.id);
    const rows = pack.placed.length > 0 ? buildRows(pack) : [];
    const compliance = computeComplianceReport(pack, { rows });
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

  // Filter: only keep plans without RED violations (overlap, hanging,
  // gap < 50 mm with vertical overlap, door/ceiling breach).
  const legal = results.filter((r) => r.compliance.status !== "RED");

  // Helper: count RED violations in a plan. Used as the primary tiebreak
  // when no plan is fully legal — we then pick the *cleanest* plan, not
  // the densest one (a plan with 50 overlap violations isn't actually
  // better just because it crammed more cartons in).
  const redCount = (r: ScenarioResult) =>
    r.compliance.violations.filter((v) => v.type === "RED").length;

  if (legal.length > 0) {
    // Healthy path: every plan in the pool is physically safe. Sort by
    // densest placedCargoCbm, then most cartons, then highest compliance
    // score (prefer cleaner YELLOW/GREEN over plans with more warnings).
    legal.sort((a, b) => {
      if (b.pack.placedCargoCbm !== a.pack.placedCargoCbm)
        return b.pack.placedCargoCbm - a.pack.placedCargoCbm;
      if (b.pack.placedCartons !== a.pack.placedCartons)
        return b.pack.placedCartons - a.pack.placedCartons;
      return b.compliance.score - a.compliance.score;
    });
    const ranked = legal.map((r, i) => ({ ...r, isBest: i === 0, rank: i + 1 }));
    return { best: ranked[0], all: ranked };
  }

  // Fallback path: every strategy tripped at least one RED rule. Rather
  // than picking the densest dirty plan (which is what produced the
  // overlap-clipping visual the user reported), pick the plan with the
  // FEWEST RED violations and highest compliance score. CBM is a final
  // tiebreak — safety wins over volume when nothing is fully legal.
  const pool = [...results];
  pool.sort((a, b) => {
    const ra = redCount(a);
    const rb = redCount(b);
    if (ra !== rb) return ra - rb; // fewer RED violations first
    if (b.compliance.score !== a.compliance.score)
      return b.compliance.score - a.compliance.score;
    if (b.pack.placedCargoCbm !== a.pack.placedCargoCbm)
      return b.pack.placedCargoCbm - a.pack.placedCargoCbm;
    return b.pack.placedCartons - a.pack.placedCartons;
  });

  const ranked = pool.map((r, i) => ({ ...r, isBest: i === 0, rank: i + 1 }));
  return { best: ranked[0], all: ranked };
}
