/**
 * Final-state geometry validator — single source of truth for whether a
 * placed pack is physically legal.
 *
 * Inputs: the AdvancedPackResult.placed[] (mm coordinates) plus the container
 * preset and per-item flags. Output: a canonical audit object that lists every
 * hard physical violation (overlap, gap < min with vertical overlap, wall /
 * door / ceiling clearance breach, unsupported stack, fragile/sealed column
 * carrying load, non-stackable carrying load).
 *
 * Used by:
 *   - packing-advanced.ts (final commit sanity check + diagnostics)
 *   - compliance.ts (RED violations are derived from this report)
 *   - scenario-runner.ts (the "best plan" decision uses .allLegal)
 *
 * Pure JS, deterministic, SSR-safe.
 */
import type { PlacedBox, ContainerPreset } from "./packing";
import type { AdvancedPackResult } from "./packing-advanced";
import { DOOR_RESERVE_MM, CEILING_RESERVE_MM } from "./gap-rules";

/** Universal hard limits — match gap-rules.ts. */
export const HARD = {
  /** Minimum lateral neighbour gap when boxes overlap vertically. */
  MIN_NEIGHBOUR_GAP_MM: 50,
  /** Minimum side-wall clearance. */
  MIN_WALL_GAP_MM: 50,
  /** Minimum ceiling clearance (top of box to roof). */
  MIN_CEILING_GAP_MM: CEILING_RESERVE_MM,
  /** Minimum door reserve (front-most box face to door wall). */
  MIN_DOOR_GAP_MM: DOOR_RESERVE_MM,
  /** Minimum support ratio for a stacked box. */
  MIN_SUPPORT_RATIO: 0.85,
  /** Tolerance for floating-point coordinate equality (mm). */
  EPS_MM: 1,
} as const;

export type HardViolationCode =
  | "OVERLAP"
  | "NEIGHBOUR_GAP"
  | "WALL_GAP"
  | "DOOR_GAP"
  | "CEILING_GAP"
  | "FLOATING"
  | "WEAK_SUPPORT"
  | "NONSTACK_LOADED"
  | "FRAGILE_LOADED";

export interface HardViolation {
  code: HardViolationCode;
  message: string;
  /** Indices into AdvancedPackResult.placed for the offending boxes. */
  placedIdxs: number[];
}

export interface GeometryAudit {
  /** True when zero hard violations were detected. */
  allLegal: boolean;
  /** Every hard violation found, in stable order. */
  violations: HardViolation[];
  /** Per-box support ratio (0 = floating, 1 = fully supported / on floor). */
  supportRatios: number[];
}

interface ValidatorItemFlags {
  stackable: boolean;
  fragile: boolean;
}

/** Cheap intersection test for two boxes in mm coords. Returns the 3D overlap volume in mm³ (0 = touching/separate). */
function overlapVolume(a: PlacedBox, b: PlacedBox): number {
  const dx = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y);
  const dz = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
  if (dx <= HARD.EPS_MM || dy <= HARD.EPS_MM || dz <= HARD.EPS_MM) return 0;
  return dx * dy * dz;
}

/** XY footprint overlap area in mm² between two boxes (ignores Z). */
function footprintOverlap(a: PlacedBox, b: PlacedBox): number {
  const dx = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y);
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy;
}

/**
 * Validate the final placed set against the universal physical rules.
 *
 * `getFlags(itemIdx)` returns per-item stackable/fragile flags. If omitted,
 * every box is treated as stackable + non-fragile (matches CbmItem defaults).
 */
export function validatePackGeometry(
  placed: PlacedBox[],
  container: ContainerPreset,
  getFlags?: (itemIdx: number) => ValidatorItemFlags,
): GeometryAudit {
  const C = container.inner;
  const violations: HardViolation[] = [];
  const supportRatios = new Array<number>(placed.length).fill(1);

  // Default flag accessor.
  const flags = (idx: number): ValidatorItemFlags =>
    getFlags?.(idx) ?? { stackable: true, fragile: false };

  // ── 1. Wall / door / ceiling clearance ─────────────────────────────────
  const wallOff: number[] = [];
  const doorOff: number[] = [];
  const ceilOff: number[] = [];
  placed.forEach((b, i) => {
    // Wall (side y axis): boxes hugging y=0 or y=W are checked against MIN_WALL_GAP.
    // A box with y > 0 must keep MIN_WALL_GAP from the -Y wall; same for +Y.
    if (b.y > HARD.EPS_MM && b.y < HARD.MIN_WALL_GAP_MM - HARD.EPS_MM) wallOff.push(i);
    const yFar = C.w - (b.y + b.w);
    if (yFar > HARD.EPS_MM && yFar < HARD.MIN_WALL_GAP_MM - HARD.EPS_MM) wallOff.push(i);

    // Door reserve: nothing within MIN_DOOR_GAP of the +X end.
    const xFar = C.l - (b.x + b.l);
    if (xFar < HARD.MIN_DOOR_GAP_MM - HARD.EPS_MM) doorOff.push(i);

    // Ceiling reserve.
    const zFar = C.h - (b.z + b.h);
    if (zFar < HARD.MIN_CEILING_GAP_MM - HARD.EPS_MM) ceilOff.push(i);
  });

  if (wallOff.length > 0) {
    violations.push({
      code: "WALL_GAP",
      message: `${wallOff.length} box${wallOff.length > 1 ? "es" : ""} closer than ${HARD.MIN_WALL_GAP_MM} mm to a side wall`,
      placedIdxs: Array.from(new Set(wallOff)),
    });
  }
  if (doorOff.length > 0) {
    violations.push({
      code: "DOOR_GAP",
      message: `${doorOff.length} box${doorOff.length > 1 ? "es" : ""} encroach the ${HARD.MIN_DOOR_GAP_MM} mm door reserve`,
      placedIdxs: Array.from(new Set(doorOff)),
    });
  }
  if (ceilOff.length > 0) {
    violations.push({
      code: "CEILING_GAP",
      message: `${ceilOff.length} box${ceilOff.length > 1 ? "es" : ""} within ${HARD.MIN_CEILING_GAP_MM} mm of the roof`,
      placedIdxs: Array.from(new Set(ceilOff)),
    });
  }

  // ── 2. Pairwise overlap + neighbour-gap (with vertical overlap) ────────
  const overlapPairs: number[] = [];
  const gapPairs: number[] = [];
  // O(n²) — fine up to a few hundred boxes (RENDER_CAP = 500).
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j];
      // Cheap AABB reject: if separated by more than the larger of either box +
      // the gap on every axis, skip immediately.
      const margin = HARD.MIN_NEIGHBOUR_GAP_MM + HARD.EPS_MM;
      if (a.x + a.l + margin <= b.x || b.x + b.l + margin <= a.x) continue;
      if (a.y + a.w + margin <= b.y || b.y + b.w + margin <= a.y) continue;
      if (a.z + a.h <= b.z || b.z + b.h <= a.z) continue; // disjoint in Z, no neighbour-gap rule applies

      const ov = overlapVolume(a, b);
      if (ov > 0) {
        overlapPairs.push(i, j);
        continue;
      }
      // Neighbour gap only applies when the two boxes share vertical overlap
      // > EPS (true side-by-side neighbours, not stacked or vertically disjoint).
      const zOv = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
      if (zOv <= HARD.EPS_MM) continue;
      // Compute the lateral distance on each axis. If they overlap on one
      // axis (gap negative) and have a small positive gap on the other,
      // they are neighbours and the small-gap axis must respect MIN gap.
      const xGap = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.l, b.x + b.l));
      const yGap = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.w, b.y + b.w));
      const xOv = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x) > HARD.EPS_MM;
      const yOv = Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y) > HARD.EPS_MM;
      // Side-by-side along X axis (yOv true, xGap > 0) → xGap must be ≥ MIN.
      if (yOv && !xOv && xGap > 0 && xGap < HARD.MIN_NEIGHBOUR_GAP_MM - HARD.EPS_MM) {
        gapPairs.push(i, j);
      }
      // Side-by-side along Y axis.
      if (xOv && !yOv && yGap > 0 && yGap < HARD.MIN_NEIGHBOUR_GAP_MM - HARD.EPS_MM) {
        gapPairs.push(i, j);
      }
    }
  }

  if (overlapPairs.length > 0) {
    violations.push({
      code: "OVERLAP",
      message: `${overlapPairs.length / 2} pair${overlapPairs.length / 2 > 1 ? "s" : ""} of boxes physically overlap`,
      placedIdxs: Array.from(new Set(overlapPairs)),
    });
  }
  if (gapPairs.length > 0) {
    violations.push({
      code: "NEIGHBOUR_GAP",
      message: `${gapPairs.length / 2} neighbour pair${gapPairs.length / 2 > 1 ? "s" : ""} closer than ${HARD.MIN_NEIGHBOUR_GAP_MM} mm`,
      placedIdxs: Array.from(new Set(gapPairs)),
    });
  }

  // ── 3. Support / floating cargo, fragile + non-stack carrying load ─────
  const floating: number[] = [];
  const weak: number[] = [];
  const nonStackLoaded: number[] = [];
  const fragileLoaded: number[] = [];

  // Map: box idx → boxes whose top face supports it (top.z + top.h ≈ b.z).
  for (let i = 0; i < placed.length; i++) {
    const b = placed[i];
    if (b.z <= HARD.EPS_MM) {
      supportRatios[i] = 1; // floor box
      continue;
    }
    const footArea = b.l * b.w;
    if (footArea <= 0) continue;
    let overlapArea = 0;
    for (let j = 0; j < placed.length; j++) {
      if (i === j) continue;
      const s = placed[j];
      if (Math.abs(s.z + s.h - b.z) > HARD.EPS_MM) continue;
      overlapArea += footprintOverlap(b, s);
    }
    const ratio = Math.min(1, overlapArea / footArea);
    supportRatios[i] = ratio;
    if (ratio < HARD.EPS_MM) floating.push(i);
    else if (ratio < HARD.MIN_SUPPORT_RATIO) weak.push(i);
  }

  // Detect non-stackable / fragile carrying load above.
  for (let i = 0; i < placed.length; i++) {
    const b = placed[i];
    const f = flags(b.itemIdx);
    // Skip boxes that are both stackable AND not fragile — only restricted
    // boxes (non-stackable OR fragile) can violate this rule.
    if (f.stackable && !f.fragile) continue;
    // Find any box whose bottom face rests on b's top.
    for (let j = 0; j < placed.length; j++) {
      if (i === j) continue;
      const s = placed[j];
      if (Math.abs(b.z + b.h - s.z) > HARD.EPS_MM) continue;
      if (footprintOverlap(b, s) <= 0) continue;
      if (!f.stackable) nonStackLoaded.push(i);
      if (f.fragile) fragileLoaded.push(i);
      break;
    }
  }

  if (floating.length > 0) {
    violations.push({
      code: "FLOATING",
      message: `${floating.length} box${floating.length > 1 ? "es" : ""} floating with no support below`,
      placedIdxs: floating,
    });
  }
  if (weak.length > 0) {
    violations.push({
      code: "WEAK_SUPPORT",
      message: `${weak.length} stacked box${weak.length > 1 ? "es" : ""} below ${Math.round(HARD.MIN_SUPPORT_RATIO * 100)}% support`,
      placedIdxs: weak,
    });
  }
  if (nonStackLoaded.length > 0) {
    violations.push({
      code: "NONSTACK_LOADED",
      message: `${nonStackLoaded.length} non-stackable item${nonStackLoaded.length > 1 ? "s have" : " has"} cargo loaded on top`,
      placedIdxs: Array.from(new Set(nonStackLoaded)),
    });
  }
  if (fragileLoaded.length > 0) {
    violations.push({
      code: "FRAGILE_LOADED",
      message: `${fragileLoaded.length} fragile item${fragileLoaded.length > 1 ? "s are" : " is"} carrying load above`,
      placedIdxs: Array.from(new Set(fragileLoaded)),
    });
  }

  return {
    allLegal: violations.length === 0,
    violations,
    supportRatios,
  };
}

/** Convenience: validate directly from an AdvancedPackResult, pulling flags from perItem. */
export function validateAdvancedPack(pack: AdvancedPackResult): GeometryAudit {
  return validatePackGeometry(pack.placed, pack.container, (itemIdx) => {
    const stat = pack.perItem[itemIdx];
    return {
      stackable: stat?.stackable ?? true,
      fragile: stat?.fragile ?? false,
    };
  });
}
