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

// Match the packer (packing-advanced.ts) — both must agree or the auditor
// flags clean stacks as "floating". 0.85 is the same defensive backstop the
// placer uses; geometric overlap (below) eliminates the cell-grid penalty
// that previously misjudged stacks of dimensions not divisible by 100 mm.
const SUPPORT_MIN_RATIO = 0.85;
const FLOOR_GAP_RED_ROWS = 3;
const FLOOR_GAP_RED_PCT = 75;

/**
 * Audit each stacked box's support ratio using **geometric overlap** against
 * the boxes physically below it. Mirrors evaluatePlacement() in
 * packing-advanced.ts so the auditor and packer never disagree on whether a
 * stack is supported (a disagreement would surface as a "floating cargo" RED
 * even though the box is physically flush on its supporter).
 */
function auditFloatingCargo(pack: AdvancedPackResult): {
  floatingCount: number;
  weakStackCount: number;
} {
  let floatingCount = 0;
  let weakStackCount = 0;
  const placed = pack.placed;

  for (const b of placed) {
    if (b.z <= 1) continue; // floor box — always supported

    const footprintArea = b.l * b.w;
    if (footprintArea <= 0) continue;

    let overlapArea = 0;
    for (const s of placed) {
      if (s === b) continue;
      // Supporter's TOP face must equal this box's BOTTOM (within 1 mm).
      if (Math.abs(s.z + s.h - b.z) > 1) continue;
      const ox0 = Math.max(b.x, s.x);
      const oy0 = Math.max(b.y, s.y);
      const ox1 = Math.min(b.x + b.l, s.x + s.l);
      const oy1 = Math.min(b.y + b.w, s.y + s.w);
      const dx = ox1 - ox0;
      const dy = oy1 - oy0;
      if (dx > 0 && dy > 0) overlapArea += dx * dy;
    }

    const ratio = Math.min(1, overlapArea / footprintArea);
    if (ratio < SUPPORT_MIN_RATIO) floatingCount++;
    if (ratio < 0.6) weakStackCount++;
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
