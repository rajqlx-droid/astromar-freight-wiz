/**
 * Backwards-compatible re-export shim.
 * The active scenario is provided via props (see Root.tsx + LoadingGuide.tsx).
 * Any module-scope consumer that still imports from "./scenario" gets the
 * demo scenario as a safe default.
 */

export type { Box, Row, Scenario, ContainerSpec } from "./scenario-demo";
import { buildDemoScenario } from "./scenario-demo";

const demo = buildDemoScenario();

export const CONTAINER = demo.container;
export const ROWS = demo.rows;
export const ALL_BOXES = demo.allBoxes;
export const TOTAL_CARTONS = demo.totalCartons;
export const TOTAL_CBM = demo.totalCbm;
export const TOTAL_WEIGHT_KG = demo.totalWeightKg;
export const UTILIZATION_PCT = demo.utilizationPct;
export const COG_OFFSET_PCT = demo.cogOffsetPct;
