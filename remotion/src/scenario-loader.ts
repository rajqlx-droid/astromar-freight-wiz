/**
 * Loads a scenario at composition-resolution time.
 * Tries remotion/public/scenario.json first; falls back to the demo scenario.
 *
 * The JSON format mirrors the in-app PackResult enough that it can be produced
 * by serializing AdvancedPackResult.placed + container + buildRows() output.
 */

import { staticFile } from "remotion";
import { buildDemoScenario, type Box, type Row, type Scenario, type ContainerSpec } from "./scenario-demo";

export type { Box, Row, Scenario, ContainerSpec };

interface ScenarioJson {
  container: ContainerSpec;
  rows: Array<{
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
  }>;
}

function finalize(container: ContainerSpec, rows: Row[]): Scenario {
  const allBoxes = rows.flatMap((r) => r.boxes);
  const totalCartons = allBoxes.length;
  const totalCbm = allBoxes.reduce(
    (s, b) => s + (b.l * b.w * b.h) / 1_000_000_000,
    0,
  );
  const totalWeightKg = rows.reduce((s, r) => s + r.totalWeightKg, 0);
  const utilizationPct = (totalCbm / Math.max(1, container.capCbm)) * 100;
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const rowCenterX = (r.xStart + r.xEnd) / 2;
    num += rowCenterX * r.totalWeightKg;
    den += r.totalWeightKg;
  }
  const cogXmm = den > 0 ? num / den : 0;
  const cogOffsetPct = (cogXmm / Math.max(1, container.inner.l)) * 100;
  return {
    container,
    rows,
    allBoxes,
    totalCartons,
    totalCbm,
    totalWeightKg,
    utilizationPct,
    cogOffsetPct,
  };
}

/**
 * Synchronous load for module-scope use.
 * In Node (render time) we try to read public/scenario.json from disk;
 * in the browser bundle we fall back to demo (calculateMetadata async path
 * does the real fetch).
 */
export function loadScenarioSync(): Scenario {
  // Always start with demo. The async resolver (in calculateMetadata) replaces
  // it via props passed to the component.
  return buildDemoScenario();
}

/** Async loader called from calculateMetadata. */
export async function loadScenarioAsync(): Promise<Scenario> {
  try {
    const url = staticFile("scenario.json");
    const res = await fetch(url);
    if (!res.ok) return buildDemoScenario();
    const json = (await res.json()) as ScenarioJson;
    if (!json?.container || !Array.isArray(json?.rows) || json.rows.length === 0) {
      return buildDemoScenario();
    }
    return finalize(json.container, json.rows);
  } catch {
    return buildDemoScenario();
  }
}
