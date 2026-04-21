import type { AdvancedPackResult } from "./packing-advanced";
import { CEILING_RESERVE_MM } from "./gap-rules";
import type { RowGroup } from "./loading-rows";

export type ComplianceStatus = "GREEN" | "YELLOW" | "RED";

export interface ComplianceViolation {
  type: ComplianceStatus;
  code: string;
  message: string;
  /** Optional row indices the user should jump to in the loading-rows panel. */
  rowIdxs?: number[];
}

export interface FoundationAuditItem {
  code: "FOUNDATION_FLOOR" | "FLOOR_GAPS" | "STACK_WEIGHT" | "CEILING_CLEARANCE";
  label: string;
  ok: boolean;
  detail?: string;
  rowIdxs?: number[];
}

export interface ComplianceReport {
  score: number;
  status: ComplianceStatus;
  canApprove: boolean;
  violations: ComplianceViolation[];
  cogLengthOk: boolean;
  cogLateralOk: boolean;
  weightOk: boolean;
  utilizationPct: number;
  placedPct: number;
  /** New: foundation-of-loading rules — surfaced as a checklist in the HUD. */
  foundationAudit: FoundationAuditItem[];
}

export interface ComplianceOptions {
  /** Pre-computed row groups from `loading-rows.buildRows`. Required to evaluate FLOOR_GAP. */
  rows?: RowGroup[];
}

const SUPPORT_MIN_RATIO = 0.9;
const FLOOR_GAP_RED_ROWS = 3;
const FLOOR_GAP_RED_PCT = 75;

/**
 * Re-derive a quantised height-map from the placed boxes and audit each box's
 * support ratio. Mirrors the packer's grid (CELL_MM = 100) so the numbers
 * agree with what the placer actually saw.
 */
function auditFloatingCargo(pack: AdvancedPackResult): {
  floatingCount: number;
  weakStackCount: number;
} {
  const C = pack.container.inner;
  const CELL = 100;
  const cellsX = Math.ceil(C.l / CELL);
  const cellsY = Math.ceil(C.w / CELL);
  // Sort by z ascending so we build the height-map in placement order.
  const sorted = pack.placed
    .map((b, i) => ({ b, i }))
    .sort((a, b) => a.b.z - b.b.z || a.b.x - b.b.x || a.b.y - b.b.y);

  const heightMap = new Float32Array(cellsX * cellsY);
  let floatingCount = 0;
  let weakStackCount = 0;

  for (const { b } of sorted) {
    if (b.z <= 1) {
      // On the floor — always supported.
      const cx0 = Math.floor(b.x / CELL);
      const cy0 = Math.floor(b.y / CELL);
      const cx1 = Math.ceil((b.x + b.l) / CELL);
      const cy1 = Math.ceil((b.y + b.w) / CELL);
      for (let cy = cy0; cy < cy1; cy++) {
        for (let cx = cx0; cx < cx1; cx++) {
          heightMap[cy * cellsX + cx] = b.z + b.h;
        }
      }
      continue;
    }
    // Stacked box: measure support against current height-map.
    const cx0 = Math.floor(b.x / CELL);
    const cy0 = Math.floor(b.y / CELL);
    const cx1 = Math.ceil((b.x + b.l) / CELL);
    const cy1 = Math.ceil((b.y + b.w) / CELL);
    let supported = 0;
    let total = 0;
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        total++;
        const h = heightMap[cy * cellsX + cx];
        if (Math.abs(h - b.z) < 1) supported++;
      }
    }
    const ratio = total > 0 ? supported / total : 0;
    if (ratio < SUPPORT_MIN_RATIO) floatingCount++;
    if (ratio < 0.6) weakStackCount++;
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        heightMap[cy * cellsX + cx] = b.z + b.h;
      }
    }
  }
  return { floatingCount, weakStackCount };
}

export function computeComplianceReport(
  pack: AdvancedPackResult,
  opts: ComplianceOptions = {},
): ComplianceReport {
  let score = 100;
  const violations: ComplianceViolation[] = [];
  const foundationAudit: FoundationAuditItem[] = [];

  // ── Existing rules ───────────────────────────────────────────────
  const weightOk = pack.weightKg <= pack.container.maxPayloadKg;
  if (!weightOk) {
    score -= 25;
    violations.push({
      type: "RED",
      code: "WEIGHT_OVERLOAD",
      message: `Load ${Math.round(pack.weightKg)} kg exceeds container limit ${pack.container.maxPayloadKg} kg`,
    });
  }

  const cogLengthOk = Math.abs(pack.cogOffsetPct) <= 0.2;
  if (!cogLengthOk) {
    score -= 10;
    violations.push({
      type: "YELLOW",
      code: "COG_LENGTH",
      message: `Longitudinal CoG ${Math.round(Math.abs(pack.cogOffsetPct) * 100)}% off-centre`,
    });
  }

  const lateralOffset = pack.cogLateralOffsetPct ?? 0;
  const cogLateralOk = Math.abs(lateralOffset) <= 0.15;
  if (!cogLateralOk) {
    score -= 10;
    violations.push({
      type: "YELLOW",
      code: "COG_LATERAL",
      message: `Lateral CoG ${Math.round(Math.abs(lateralOffset) * 100)}% off-centre — road tipping risk`,
    });
  }

  const placedPct =
    pack.totalCartons > 0 ? (pack.placedCartons / pack.totalCartons) * 100 : 100;
  if (placedPct < 100) {
    const unplaced = pack.totalCartons - pack.placedCartons;
    const penalty = Math.min(30, Math.round((unplaced / pack.totalCartons) * 50));
    score -= penalty;
    violations.push({
      type: penalty > 15 ? "RED" : "YELLOW",
      code: "UNPLACED",
      message: `${unplaced} items (${Math.round(100 - placedPct)}%) could not be fitted`,
    });
  }

  if (pack.utilizationPct < 60) {
    score -= 10;
    violations.push({
      type: "YELLOW",
      code: "LOW_UTILISATION",
      message: `Container only ${Math.round(pack.utilizationPct)}% full — consider a smaller container`,
    });
  }

  // ── Foundation rules ─────────────────────────────────────────────
  // 1. Floating cargo / weak foundation
  const { floatingCount, weakStackCount } = auditFloatingCargo(pack);
  const floorOk = floatingCount === 0;
  if (!floorOk) {
    score -= 25;
    violations.push({
      type: "RED",
      code: "FLOATING_CARGO",
      message: `${floatingCount} stacked item${floatingCount > 1 ? "s" : ""} not resting on solid support — risk of collapse`,
    });
  }
  foundationAudit.push({
    code: "FOUNDATION_FLOOR",
    label: "All boxes resting on floor or solid support",
    ok: floorOk,
    detail: floorOk ? undefined : `${floatingCount} floating box${floatingCount > 1 ? "es" : ""}`,
  });

  const stackOk = weakStackCount === 0;
  if (!stackOk) {
    score -= 20;
    violations.push({
      type: "RED",
      code: "FOUNDATION_WEAK",
      message: `${weakStackCount} stacked item${weakStackCount > 1 ? "s" : ""} on < 60% solid contact`,
    });
  }
  foundationAudit.push({
    code: "STACK_WEIGHT",
    label: "No stack-weight overload",
    ok: stackOk,
    detail: stackOk ? undefined : `${weakStackCount} weak foundation${weakStackCount > 1 ? "s" : ""}`,
  });

  // 2. Floor gaps (requires rows)
  const rows = opts.rows;
  let floorGapOk = true;
  let gapRowIdxs: number[] = [];
  if (rows && rows.length > 0) {
    const gapRows = rows.filter((r) => r.gapWarning);
    gapRowIdxs = gapRows.map((r) => r.rowIdx + 1);
    const worstPct = Math.min(100, ...gapRows.map((r) => r.wallUtilizationPct));
    floorGapOk = gapRows.length === 0;
    if (gapRows.length > 0) {
      const penalty = Math.min(20, gapRows.length * 5);
      score -= penalty;
      const isRed = gapRows.length >= FLOOR_GAP_RED_ROWS || worstPct < FLOOR_GAP_RED_PCT;
      violations.push({
        type: isRed ? "RED" : "YELLOW",
        code: "FLOOR_GAP",
        message: `${gapRows.length} row${gapRows.length > 1 ? "s" : ""} have floor gaps — re-shuffle to close before sealing`,
        rowIdxs: gapRowIdxs,
      });
    }
  }
  foundationAudit.push({
    code: "FLOOR_GAPS",
    label:
      rows && rows.length > 0
        ? floorGapOk
          ? "No floor gaps in any row"
          : `Floor gaps in ${gapRowIdxs.length} row${gapRowIdxs.length > 1 ? "s" : ""}`
        : "Floor-gap check pending",
    ok: floorGapOk,
    detail: !floorGapOk ? `Rows ${gapRowIdxs.join(", ")}` : undefined,
    rowIdxs: gapRowIdxs,
  });

  // 3. Ceiling clearance
  const nearCeiling = pack.nearCeilingPlacedIdxs?.length ?? 0;
  const ceilingOk = nearCeiling === 0;
  if (!ceilingOk) {
    score -= 5;
    violations.push({
      type: "YELLOW",
      code: "CEILING_CLEARANCE",
      message: `${nearCeiling} item${nearCeiling > 1 ? "s" : ""} within ${CEILING_RESERVE_MM}mm of the roof — verify clearance`,
    });
  }
  foundationAudit.push({
    code: "CEILING_CLEARANCE",
    label: `Roof clearance OK (${CEILING_RESERVE_MM}mm reserve)`,
    ok: ceilingOk,
    detail: ceilingOk ? undefined : `${nearCeiling} item${nearCeiling > 1 ? "s" : ""} too tall`,
  });

  if (violations.length === 0) {
    violations.push({ type: "GREEN", code: "OK", message: "All compliance checks passed ✓" });
  }

  const clampedScore = Math.max(0, score);
  // Any RED violation forces the badge to RED + blocks export, regardless of score.
  const hasRed = violations.some((v) => v.type === "RED");
  const status: ComplianceStatus = hasRed
    ? "RED"
    : clampedScore >= 80
    ? "GREEN"
    : clampedScore >= 60
    ? "YELLOW"
    : "RED";

  return {
    score: clampedScore,
    status,
    canApprove: !hasRed && clampedScore >= 70,
    violations,
    cogLengthOk,
    cogLateralOk,
    weightOk,
    utilizationPct: pack.utilizationPct,
    placedPct,
    foundationAudit,
  };
}
