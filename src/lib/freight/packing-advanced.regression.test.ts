/**
 * Regression: 4ft (121.92 cm) cube cartons must stack in a 40HC.
 *
 * Bug history: the support check used a 100mm cell grid. A 1219.2mm
 * footprint covered 13 cells per side and only filled ~87.9% of them,
 * which fell below the old 0.9 SUPPORT_MIN_RATIO and rejected stacking
 * even for identical cartons sitting flush on top of each other. Result:
 * 30 cartons spilled across 3 containers when 2 sufficed.
 *
 * Fix: geometric-overlap support ratio + identical-supporter shortcut +
 * threshold lowered to 0.85. See packing-advanced.ts evaluatePlacement.
 *
 * This test pins the expected outcome so the fix can never regress.
 */
import { describe, expect, it } from "vitest";
import { packContainerAdvanced } from "./packing-advanced";
import { CONTAINERS } from "./packing";
import type { CbmItem } from "./calculators";

describe("packing-advanced — 121.92cm cube regression", () => {
  const make30Cubes = (): CbmItem[] => [
    {
      id: "cube4ft",
      length: 121.92,
      width: 121.92,
      height: 121.92,
      qty: 30,
      weight: 500,
      packageType: "carton",
      stackable: true,
      fragile: false,
      allowSidewaysRotation: true,
      allowAxisRotation: false,
    },
  ];

  const hc = CONTAINERS.find((c) => c.id === "40hc")!;

  it("stacks at least 18 cartons (2 tiers × 9 floor) in a single 40HC", () => {
    const pack = packContainerAdvanced(make30Cubes(), hc);
    // Floor row geometry: ~9 cartons along 12.032m container length with door
    // reserve. Stacking must add a second tier — verifies the fix.
    expect(pack.placedCartons).toBeGreaterThanOrEqual(18);
    // At least one carton must be stacked above the floor.
    const stacked = pack.placed.filter((p) => p.z > 10);
    expect(stacked.length).toBeGreaterThanOrEqual(9);
  });

  it("does not spill the 30-cube load into a third container", () => {
    const items = make30Cubes();
    let remainingQty = items[0].qty;
    let containers = 0;
    // Iteratively pack until every cube is placed.
    while (remainingQty > 0 && containers < 5) {
      containers++;
      const batch: CbmItem[] = [{ ...items[0], qty: remainingQty }];
      const pack = packContainerAdvanced(batch, hc);
      // Safety: every iteration must place at least one carton or we'd loop.
      expect(pack.placedCartons).toBeGreaterThan(0);
      remainingQty -= pack.placedCartons;
    }
    expect(remainingQty).toBe(0);
    expect(containers).toBeLessThanOrEqual(2);
  });

  it("records support ratios aligned with placed[]", () => {
    const pack = packContainerAdvanced(make30Cubes(), hc);
    expect(pack.supportRatios.length).toBe(pack.placed.length);
    // Floor cartons must record support ratio 1.
    pack.placed.forEach((b, i) => {
      if (b.z < 10) expect(pack.supportRatios[i]).toBe(1);
    });
    // Stacked cartons must clear the 0.85 minimum.
    pack.placed.forEach((b, i) => {
      if (b.z >= 10) expect(pack.supportRatios[i]).toBeGreaterThanOrEqual(0.85);
    });
  });

  it("exposes stackingDiagnostics with no support-rule rejections for identical cubes", () => {
    const pack = packContainerAdvanced(make30Cubes(), hc);
    expect(pack.stackingDiagnostics).toBeDefined();
    // Identical cubes flush on each other must NOT trip the support rule —
    // that was the original bug. Allow other rules (none expected here)
    // but assert support specifically is zero.
    expect(pack.stackingDiagnostics.reasonCounts.support).toBe(0);
  });
});
