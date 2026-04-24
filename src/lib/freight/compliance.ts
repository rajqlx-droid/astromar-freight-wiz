import type { AdvancedPackResult } from "./packing-advanced";
import { CEILING_RESERVE_MM } from "./gap-rules";
import type { RowGroup } from "./loading-rows";
import { validateAdvancedPack, type GeometryAudit } from "./geometry-validator";

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
  /**
   * Pre-computed final-state geometry audit. When supplied, compliance does
   * NOT recompute it — guarantees the optimiser, worker, and HUD all agree
   * on which boxes (if any) physically fail. Falls back to validating the
   * pack on demand when omitted.
   */
  geometryAudit?: GeometryAudit;
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
    // Unplaced cartons = shut-out, NOT a hard physical violation. Surface as
    // a YELLOW warning so the optimiser can still report "max loaded · shut
    // out" without flipping the HUD to RED / EXPORT BLOCKED.
    violations.push({
      type: "YELLOW",
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

  // ── Foundation rules — derived from the shared geometry validator ────
  // Single source of truth: same audit the optimiser uses to decide
  // legal/illegal. Prevents the recompute drift that previously surfaced
  // RED on plans the optimiser had already cleared.
  const audit = opts.geometryAudit ?? validateAdvancedPack(pack);
  const floatingV = audit.violations.find((v) => v.code === "FLOATING");
  const weakV = audit.violations.find((v) => v.code === "WEAK_SUPPORT");
  const overlapV = audit.violations.find((v) => v.code === "OVERLAP");
  const neighbourV = audit.violations.find((v) => v.code === "NEIGHBOUR_GAP");
  const wallV = audit.violations.find((v) => v.code === "WALL_GAP");
  const doorV = audit.violations.find((v) => v.code === "DOOR_GAP");
  const ceilV = audit.violations.find((v) => v.code === "CEILING_GAP");
  const nonStackV = audit.violations.find((v) => v.code === "NONSTACK_LOADED");
  const fragileV = audit.violations.find((v) => v.code === "FRAGILE_LOADED");

  const floatingCount = floatingV?.placedIdxs.length ?? 0;
  const weakStackCount = weakV?.placedIdxs.length ?? 0;
  const floorOk = floatingCount === 0;
  if (!floorOk) {
    score -= 25;
    violations.push({
      type: "RED",
      code: "FLOATING_CARGO",
      message: floatingV!.message,
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
      message: weakV!.message,
    });
  }
  foundationAudit.push({
    code: "STACK_WEIGHT",
    label: "No stack-weight overload",
    ok: stackOk,
    detail: stackOk ? undefined : `${weakStackCount} weak foundation${weakStackCount > 1 ? "s" : ""}`,
  });

  // Geometry-level RED violations — these previously could not be detected
  // post-pack at all, so visible overlap / neighbour-gap clipping never
  // surfaced. Each becomes a hard violation with a precise count.
  if (overlapV) {
    score -= 30;
    violations.push({ type: "RED", code: "OVERLAP", message: overlapV.message });
  }
  if (neighbourV) {
    score -= 15;
    violations.push({ type: "RED", code: "NEIGHBOUR_GAP", message: neighbourV.message });
  }
  if (wallV) {
    score -= 10;
    violations.push({ type: "RED", code: "WALL_GAP", message: wallV.message });
  }
  if (doorV) {
    score -= 10;
    violations.push({ type: "RED", code: "DOOR_GAP", message: doorV.message });
  }
  if (ceilV) {
    score -= 10;
    violations.push({ type: "RED", code: "CEILING_GAP", message: ceilV.message });
  }
  if (nonStackV) {
    score -= 10;
    violations.push({ type: "RED", code: "NONSTACK_LOADED", message: nonStackV.message });
  }
  if (fragileV) {
    score -= 10;
    violations.push({ type: "RED", code: "FRAGILE_LOADED", message: fragileV.message });
  }

  // 2. Floor gaps (requires rows)
  const rows = opts.rows;
  let floorGapOk = true;
  let gapRowIdxs: number[] = [];
  if (rows && rows.length > 0) {
    // Only flag rows that are below BOTH the configured threshold AND their
    // own physical ceiling. A row already at its geometric maximum (e.g.
    // 1066.8 mm cubes in a 2350 mm wide container — max 2 across at 90.8%)
    // cannot be re-shuffled tighter, so it must not produce a slack warning.
    const gapRows = rows.filter(
      (r) =>
        r.gapWarning &&
        r.wallUtilizationPct < r.maxAchievableUtilizationPct - 0.5,
    );
    gapRowIdxs = gapRows.map((r) => r.rowIdx + 1);
    floorGapOk = gapRows.length === 0;
    if (gapRows.length > 0) {
      const penalty = Math.min(20, gapRows.length * 5);
      score -= penalty;
      // Floor-gap is a packing efficiency warning, not a hard physical
      // violation. Always YELLOW — never RED — so it cannot single-handedly
      // block export on an otherwise legal pack.
      violations.push({
        type: "YELLOW",
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
