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
import { DOOR_RESERVE_MM, CEILING_RESERVE_MM, NEIGHBOUR_MIN_GAP_MM, WALL_SAFETY_MARGIN_MM } from "./gap-rules";

/** Universal hard limits — match gap-rules.ts. */
export const HARD = {
  /**
   * Lateral neighbour gap = 1 mm (per gap-rules.ts). Two boxes whose AABBs
   * are within 1 mm of intersecting on every axis are flagged as a
   * NEIGHBOUR_GAP violation. Stacked boxes (top of supporter ≈ bottom of
   * stacked) are exempt — the stack contact is a vertical adjacency, not a
   * lateral neighbour crowding.
   */
  MIN_NEIGHBOUR_GAP_MM: NEIGHBOUR_MIN_GAP_MM,
  /** Side-wall clearance — every cargo unit must keep at least this many mm clear of every side wall. */
  MIN_WALL_GAP_MM: WALL_SAFETY_MARGIN_MM,
  /** Minimum ceiling clearance (top of box to roof). */
  MIN_CEILING_GAP_MM: CEILING_RESERVE_MM,
  /** Minimum door reserve (front-most box face to door wall). */
  MIN_DOOR_GAP_MM: DOOR_RESERVE_MM,
  /** Minimum support ratio for a stacked box. */
  MIN_SUPPORT_RATIO: 0.85,
  /**
   * Tolerance for floating-point coordinate equality (mm). Used for the
   * support-plane test (bottom of B ≈ top of A) and door/ceiling reserve
   * tolerance. NOT used for lateral overlap — that test is strict (0 mm).
   */
  EPS_MM: 2,
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

/**
 * Cheap intersection test for two boxes in mm coords. Returns the 3D overlap
 * volume in mm³ (0 = touching/separate). STRICT: any positive intersection
 * on every axis counts as overlap — touching faces (overlap = 0 on at least
 * one axis) is legal.
 */
function overlapVolume(a: PlacedBox, b: PlacedBox): number {
  // Float-drift tolerance: snap-pass slides cartons in 1mm increments and
  // float arithmetic can leave ≤0.5mm of phantom overlap on flush faces.
  // Anything beyond that is a real intersection.
  const EPS = 0.5;
  const dx = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y);
  const dz = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
  if (dx <= EPS || dy <= EPS || dz <= EPS) return 0;
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

  // ── 1. Door / ceiling / side-wall clearance ─────────────────────────
  const doorOff: number[] = [];
  const ceilOff: number[] = [];
  const wallOff: number[] = [];
  const GAP_EPS = 0.5; // float drift tolerance — must match overlapVolume EPS
  placed.forEach((b, i) => {
    // Door reserve: nothing within MIN_DOOR_GAP of the +X end.
    const xFar = C.l - (b.x + b.l);
    if (xFar < HARD.MIN_DOOR_GAP_MM - HARD.EPS_MM) doorOff.push(i);
    // Ceiling reserve.
    const zFar = C.h - (b.z + b.h);
    if (zFar < HARD.MIN_CEILING_GAP_MM - HARD.EPS_MM) ceilOff.push(i);
    // Side walls (−X back wall, ±Y side walls). Floor (z = 0) is intentionally
    // exempt — boxes rest on the floor.
    if (HARD.MIN_WALL_GAP_MM > 0) {
      const minWall = HARD.MIN_WALL_GAP_MM - GAP_EPS;
      if (b.x < minWall) wallOff.push(i);
      if (b.y < minWall) wallOff.push(i);
      if (C.w - (b.y + b.w) < minWall) wallOff.push(i);
    }
  });

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
  if (wallOff.length > 0) {
    violations.push({
      code: "WALL_GAP",
      message: `${wallOff.length} box${wallOff.length > 1 ? "es" : ""} within ${HARD.MIN_WALL_GAP_MM} mm of a side wall`,
      placedIdxs: Array.from(new Set(wallOff)),
    });
  }

  // ── 2. Strict pairwise overlap + neighbour-gap (≥ 1 mm clearance) ────
  const overlapPairs: number[] = [];
  const gapPairs: number[] = [];
  const minNeighbour = HARD.MIN_NEIGHBOUR_GAP_MM - GAP_EPS;
  // O(n²) — fine up to a few hundred boxes (RENDER_CAP = 500).
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j];
      // Cheap AABB reject — boxes that are clearly far apart skip both checks.
      const gx = Math.max(a.x - (b.x + b.l), b.x - (a.x + a.l));
      const gy = Math.max(a.y - (b.y + b.w), b.y - (a.y + a.w));
      const gz = Math.max(a.z - (b.z + b.h), b.z - (a.z + a.h));
      // Overlap = all three axis "gaps" negative beyond float tolerance.
      if (gx < -GAP_EPS && gy < -GAP_EPS && gz < -GAP_EPS) {
        const ov = overlapVolume(a, b);
        if (ov > 0) overlapPairs.push(i, j);
        continue;
      }
      // Stacking adjacency exempt: bottom of one ≈ top of the other on Z,
      // and the stacked footprint overlaps in X+Y.
      const aOnB = Math.abs(b.z + b.h - a.z) <= HARD.EPS_MM;
      const bOnA = Math.abs(a.z + a.h - b.z) <= HARD.EPS_MM;
      if ((aOnB || bOnA) && gx < 0 && gy < 0) continue;
      // Neighbour-gap: boxes are too close on every axis but not actually
      // intersecting — flag as crowding.
      if (gx < minNeighbour && gy < minNeighbour && gz < minNeighbour) {
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
      message: `${gapPairs.length / 2} pair${gapPairs.length / 2 > 1 ? "s" : ""} of boxes within ${HARD.MIN_NEIGHBOUR_GAP_MM} mm of each other`,
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
    // FLOATING = essentially zero support (≤ 5% of footprint covered).
    // WEAK_SUPPORT = some support but below SUPPORT_MIN_RATIO.
    // (Bug fix: ratio is a 0..1 fraction; previously compared against
    // EPS_MM which is millimetres — a unit mismatch that mis-flagged real
    // stacks once EPS was bumped above 1.)
    if (ratio < 0.05) floating.push(i);
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
