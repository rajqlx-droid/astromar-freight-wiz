/**
 * Gap & reserve rules.
 *
 * Per user spec (2026-04-25, revised): every cargo unit must keep ≥ 1 mm
 * clear of every neighbour and of every side wall. This prevents flush
 * face-to-face touching and guarantees no two units ever appear to overlap
 * in the 3D viewer (or in real life).
 *
 * The door and ceiling reserves remain physical / regulatory:
 *   - DOOR_RESERVE_MM: 100 mm clear at the +X (door) end so the doors close.
 *   - CEILING_RESERVE_MM: 80 mm clear under the roof for crossbeam clearance.
 *
 * The packer's wouldBeLegal airlock + the geometry validator's neighbour-gap
 * check together enforce the 1 mm minimum.
 */
export const DOOR_RESERVE_MM = 100;

export const CEILING_RESERVE_MM = 80;

/** Minimum clearance between any cargo unit and a side wall (mm). */
export const WALL_SAFETY_MARGIN_MM = 1;

/** Minimum clearance between any pair of cargo units (mm). */
export const NEIGHBOUR_MIN_GAP_MM = 1;

export interface GapRule {
  minGap: number;
  wallMin: number;
  maxGap: number;
  doorMin: number;
  ceilingMin: number;
  notes: string;
}

// Tight-fit rule for every package type. minGap = 0 and wallMin = 0 mean
// flush placement is legal; the validator only flags actual overlap.
export const GAP_RULES_MM: Record<string, GapRule> = {
  carton: { minGap: 0, wallMin: 0, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Tight pack, door + ceiling reserve enforced" },
  pallet: { minGap: 0, wallMin: 0, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Tight pack, door + ceiling reserve enforced" },
  drum:   { minGap: 0, wallMin: 0, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Tight pack, chocks mandatory, upright only" },
  crate:  { minGap: 0, wallMin: 0, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Tight pack, door + ceiling reserve enforced" },
  bale:   { minGap: 0, wallMin: 0, maxGap: 100, doorMin: 100, ceilingMin: 80, notes: "Tight pack, compression gaps monitored" },
  bag:    { minGap: 0, wallMin: 0, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Tight pack, door + ceiling reserve enforced" },
};

export function getGapRule(packageType: string): GapRule {
  return GAP_RULES_MM[packageType] ?? GAP_RULES_MM.carton;
}

export type TightStuffScenario = "ALLOWED" | "WARN" | "BLOCK";

export function classifyGap(
  gapMm: number,
  packageType: string,
  context: "neighbour" | "wall" | "door" | "ceiling",
): TightStuffScenario {
  const rule = getGapRule(packageType);
  const min =
    context === "wall" ? rule.wallMin
    : context === "door" ? rule.doorMin
    : context === "ceiling" ? rule.ceilingMin
    : rule.minGap;
  if (gapMm < 0) return "BLOCK"; // physical overlap
  if (packageType === "drum" && context === "neighbour" && gapMm === 0) return "WARN"; // chock advisory
  if (context === "door" && gapMm < min) return "BLOCK";
  if (context === "ceiling" && gapMm < min) return "BLOCK";
  if (gapMm < min) return "WARN";
  if (gapMm > rule.maxGap) return "WARN";
  return "ALLOWED";
}
