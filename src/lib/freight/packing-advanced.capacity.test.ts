/**
 * Capacity regression: 1.5 ft (45.72 cm) cubes must hit theoretical maxima
 * across all standard containers, with no zig-zag drift or one-sided piling.
 *
 * Theoretical maxima (floor(inner/457.2) per axis):
 *   20GP (5900×2352×2395): 12 × 5 × 5 = 300
 *   40GP (12032×2352×2395): 26 × 5 × 5 = 650
 *   40HC (12032×2350×2700): 26 × 5 × 5 = 650
 */
import { describe, expect, it } from "vitest";
import { packContainerAdvanced } from "./packing-advanced";
import { CONTAINERS } from "./packing";
import { validateAdvancedPack } from "./geometry-validator";
import type { CbmItem } from "./calculators";

const cubes = (qty: number): CbmItem[] => [
  {
    id: "cube18in",
    length: 45.72,
    width: 45.72,
    height: 45.72,
    qty,
    weight: 10,
    packageType: "carton",
    stackable: true,
    fragile: false,
    allowSidewaysRotation: true,
    allowAxisRotation: false,
  },
];

describe("packing-advanced — 1.5ft cube theoretical capacity", () => {
  it.each([
    ["20gp", 300],
    ["40gp", 650],
    ["40hc", 650],
  ] as const)("%s loads at least %i cubes legally", (cid, expected) => {
    const c = CONTAINERS.find((x) => x.id === cid)!;
    const pack = packContainerAdvanced(cubes(expected + 20), c);
    const audit = validateAdvancedPack(pack);
    expect(audit.allLegal).toBe(true);
    expect(pack.placedCartons).toBeGreaterThanOrEqual(expected);
  });
});

describe("packing-advanced — multi-SKU lateral balance (no one-sided pile)", () => {
  const hc = CONTAINERS.find((c) => c.id === "40hc")!;

  it("3-SKU mix distributes across the width, not piled on one wall", () => {
    const items: CbmItem[] = [
      { id: "big", length: 80, width: 80, height: 80, qty: 20, weight: 40, packageType: "carton", stackable: true, fragile: false, allowSidewaysRotation: true, allowAxisRotation: false },
      { id: "med", length: 60, width: 60, height: 60, qty: 30, weight: 20, packageType: "carton", stackable: true, fragile: false, allowSidewaysRotation: true, allowAxisRotation: false },
      { id: "sm",  length: 40, width: 40, height: 40, qty: 50, weight: 10, packageType: "carton", stackable: true, fragile: false, allowSidewaysRotation: true, allowAxisRotation: false },
    ];
    const pack = packContainerAdvanced(items, hc);
    const audit = validateAdvancedPack(pack);
    expect(audit.allLegal).toBe(true);
    // Centre of mass in Y should sit within ±25% of container centre.
    const ys = pack.placed.map((b) => b.y + b.w / 2);
    const meanY = ys.reduce((s, v) => s + v, 0) / ys.length;
    const halfW = hc.inner.w / 2;
    expect(Math.abs(meanY - halfW) / halfW).toBeLessThan(0.25);
  });

  it("identical-cube tiers are vertically aligned (no zig-zag drift)", () => {
    // 100 × 80mm cubes → multiple tiers, all stacks should align
    const items: CbmItem[] = [
      { id: "u", length: 80, width: 80, height: 80, qty: 100, weight: 25, packageType: "carton", stackable: true, fragile: false, allowSidewaysRotation: true, allowAxisRotation: false },
    ];
    const pack = packContainerAdvanced(items, hc);
    const audit = validateAdvancedPack(pack);
    expect(audit.allLegal).toBe(true);
    // Every stacked box must sit on a supporter sharing its (x,y) within 5mm.
    const stacked = pack.placed.filter((b) => b.z > 10);
    for (const s of stacked) {
      const supporter = pack.placed.find(
        (p) => Math.abs(p.x - s.x) <= 5 && Math.abs(p.y - s.y) <= 5 && p.z + p.h <= s.z + 5 && p.z + p.h >= s.z - 5,
      );
      expect(supporter, `unaligned stack at (${s.x},${s.y},${s.z})`).toBeDefined();
    }
  });
});
