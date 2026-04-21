import { packContainerAdvanced, type AdvancedPackResult } from "./packing-advanced";

import { computeComplianceReport, type ComplianceReport } from "./compliance";

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

  container: ContainerPreset

): ScenarioResult[] {

  const strategies: Array<{ id: StrategyId; name: string }> = [

    { id: "row-back",     name: "Row: Back → Front" },

    { id: "weight-first", name: "Heavy First" },

    { id: "floor-first",  name: "Floor Maximise" },

    { id: "mixed",        name: "Loader Natural" },

  ];

  const results = strategies.map((s) => {

    const sorted = sortByStrategy(items, s.id);

    const pack = packContainerAdvanced(sorted, container);

    const compliance = computeComplianceReport(pack);

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
