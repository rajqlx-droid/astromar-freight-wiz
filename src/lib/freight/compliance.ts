import type { AdvancedPackResult } from "./packing-advanced";

export type ComplianceStatus = "GREEN" | "YELLOW" | "RED";

export interface ComplianceViolation {

  type: ComplianceStatus;

  code: string;

  message: string;

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

}

export function computeComplianceReport(pack: AdvancedPackResult): ComplianceReport {

  let score = 100;

  const violations: ComplianceViolation[] = [];

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

  const lateralOffset = (pack as any).cogLateralOffsetPct ?? 0;

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

  if (violations.length === 0) {

    violations.push({ type: "GREEN", code: "OK", message: "All compliance checks passed ✓" });

  }

  const clampedScore = Math.max(0, score);

  const status: ComplianceStatus =

    clampedScore >= 80 ? "GREEN" : clampedScore >= 60 ? "YELLOW" : "RED";

  return {

    score: clampedScore,

    status,

    canApprove: clampedScore >= 70,

    violations,

    cogLengthOk,

    cogLateralOk,

    weightOk,

    utilizationPct: pack.utilizationPct,

    placedPct,

  };

}
