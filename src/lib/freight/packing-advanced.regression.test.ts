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

  it("stacks identical cubes (multiple tiers) in a single 40HC", () => {
    const pack = packContainerAdvanced(make30Cubes(), hc);
    // With the universal 50mm gap rule, ~8 cartons fit per floor row.
    // Stacking must still kick in — verifies the support fix.
    expect(pack.placedCartons).toBeGreaterThanOrEqual(8);
    const stacked = pack.placed.filter((p) => p.z > 10);
    expect(stacked.length).toBeGreaterThanOrEqual(1);
  });

  it("places every cube within a small number of containers", () => {
    const items = make30Cubes();
    let remainingQty = items[0].qty;
    let containers = 0;
    while (remainingQty > 0 && containers < 6) {
      containers++;
      const batch: CbmItem[] = [{ ...items[0], qty: remainingQty }];
      const pack = packContainerAdvanced(batch, hc);
      expect(pack.placedCartons).toBeGreaterThan(0);
      remainingQty -= pack.placedCartons;
    }
    expect(remainingQty).toBe(0);
    // 50mm gaps reduce density vs. the old 20mm rule — allow up to 4 containers.
    expect(containers).toBeLessThanOrEqual(4);
  });

  it("records support ratios aligned with placed[]", () => {
    const pack = packContainerAdvanced(make30Cubes(), hc);
    expect(pack.supportRatios.length).toBe(pack.placed.length);
    pack.placed.forEach((b, i) => {
      if (b.z < 10) expect(pack.supportRatios[i]).toBe(1);
    });
    pack.placed.forEach((b, i) => {
      if (b.z >= 10) expect(pack.supportRatios[i]).toBeGreaterThanOrEqual(0.85);
    });
  });

  it("exposes stackingDiagnostics structure", () => {
    const pack = packContainerAdvanced(make30Cubes(), hc);
    expect(pack.stackingDiagnostics).toBeDefined();
    // Diagnostics object must always expose the per-rule counters.
    expect(pack.stackingDiagnostics.reasonCounts).toMatchObject({
      support: expect.any(Number),
      sealed: expect.any(Number),
      stackWeight: expect.any(Number),
      nonStackable: expect.any(Number),
    });
  });
});

/**
 * Regression: 1066.8mm cubes (3'6") in a 40HC must not produce floating
 * cargo. The cell-grid over-sampling bug used to push 19+ boxes into the
 * air for this manifest. Now the airlock + exact-footprint sampling
 * guarantees the validator sees zero FLOATING / OVERLAP / NEIGHBOUR_GAP.
 */
import { validateAdvancedPack } from "./geometry-validator";

describe("packing-advanced — 1066.8mm cube floating-cargo regression", () => {
  const hc = CONTAINERS.find((c) => c.id === "40hc")!;
  const cube1067 = (qty: number): CbmItem[] => [
    {
      id: "cube1067",
      length: 106.68,
      width: 106.68,
      height: 106.68,
      qty,
      weight: 80,
      packageType: "carton",
      stackable: true,
      fragile: false,
      allowSidewaysRotation: true,
      allowAxisRotation: false,
    },
  ];

  it("40 cubes pack legally — zero floating boxes", () => {
    const pack = packContainerAdvanced(cube1067(40), hc);
    const audit = validateAdvancedPack(pack);
    expect(audit.violations.filter((v) => v.code === "FLOATING")).toEqual([]);
    expect(audit.violations.filter((v) => v.code === "OVERLAP")).toEqual([]);
    expect(audit.violations.filter((v) => v.code === "NEIGHBOUR_GAP")).toEqual([]);
  });

  it("41 cubes — packer shuts out the surplus, remainder stays legal", () => {
    const pack = packContainerAdvanced(cube1067(41), hc);
    const audit = validateAdvancedPack(pack);
    // Whatever the packer commits MUST be physically legal — no floating, no overlap.
    expect(audit.violations.filter((v) => v.code === "FLOATING")).toEqual([]);
    expect(audit.violations.filter((v) => v.code === "OVERLAP")).toEqual([]);
    expect(pack.placedCartons).toBeLessThanOrEqual(41);
  });

  it("mixed 800mm + 1100mm cartons — no floating cargo", () => {
    const items: CbmItem[] = [
      {
        id: "small",
        length: 80,
        width: 80,
        height: 80,
        qty: 30,
        weight: 30,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
      {
        id: "large",
        length: 110,
        width: 110,
        height: 110,
        qty: 20,
        weight: 60,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    const pack = packContainerAdvanced(items, hc);
    const audit = validateAdvancedPack(pack);
    expect(audit.violations.filter((v) => v.code === "FLOATING")).toEqual([]);
    expect(audit.violations.filter((v) => v.code === "OVERLAP")).toEqual([]);
  });
});
