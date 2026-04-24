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
  // If every strategy hit a RED (rare — usually means cargo cannot fit at
  // all), fall back to the full set so we still return *something* the
  // shut-out report can subtract from.
  const pool = legal.length > 0 ? legal : results;

  pool.sort((a, b) => {
    if (b.pack.placedCargoCbm !== a.pack.placedCargoCbm)
      return b.pack.placedCargoCbm - a.pack.placedCargoCbm;
    if (b.pack.placedCartons !== a.pack.placedCartons)
      return b.pack.placedCartons - a.pack.placedCartons;
    return b.compliance.score - a.compliance.score;
  });

  const ranked = pool.map((r, i) => ({ ...r, isBest: i === 0, rank: i + 1 }));
  return { best: ranked[0], all: ranked };
}
