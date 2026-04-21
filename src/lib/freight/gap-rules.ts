export const DOOR_RESERVE_MM = 100;

export const CEILING_RESERVE_MM = 80;

export const WALL_SAFETY_MARGIN_MM = 30;

export interface GapRule {

  minGap: number;

  wallMin: number;

  maxGap: number;

  doorMin: number;

  ceilingMin: number;

  notes: string;

}

export const GAP_RULES_MM: Record<string, GapRule> = {

  carton: { minGap: 20, wallMin: 30, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Edge protectors mandatory" },

  pallet: { minGap: 50, wallMin: 50, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Forklift access 50mm all sides" },

  drum:   { minGap: 50, wallMin: 50, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Chocks mandatory, upright only" },

  crate:  { minGap: 50, wallMin: 50, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Fork access required" },

  bale:   { minGap: 30, wallMin: 40, maxGap: 100, doorMin: 100, ceilingMin: 80, notes: "Compression gaps monitored" },

  bag:    { minGap: 20, wallMin: 30, maxGap: 80, doorMin: 100, ceilingMin: 80, notes: "Stack weight limit applies" },

};

export function getGapRule(packageType: string): GapRule {

  return GAP_RULES_MM[packageType] ?? GAP_RULES_MM.carton;

}

export type TightStuffScenario = "ALLOWED" | "WARN" | "BLOCK";

export function classifyGap(

  gapMm: number,

  packageType: string,

  context: "neighbour" | "wall" | "door" | "ceiling"

): TightStuffScenario {

  const rule = getGapRule(packageType);

  const min =

    context === "wall" ? rule.wallMin

    : context === "door" ? rule.doorMin

    : context === "ceiling" ? rule.ceilingMin

    : rule.minGap;

  if (gapMm < 0) return "BLOCK";

  if (packageType === "drum" && gapMm === 0) return "BLOCK";

  if (context === "door" && gapMm < min) return "BLOCK";

  if (context === "ceiling" && gapMm < min) return "BLOCK";

  if (gapMm < min) return "WARN";

  if (gapMm > rule.maxGap) return "WARN";

  return "ALLOWED";

}
