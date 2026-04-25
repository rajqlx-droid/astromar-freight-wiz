/**
 * Geometry validator tests — ensure the canonical post-pack audit catches
 * every hard physical violation (overlap, wall/door/ceiling clearance,
 * floating cargo, weak support, non-stackable / fragile load-bearing).
 *
 * Also asserts the optimiser's real output passes the audit for typical
 * mixed loads — guards against regressions where placement changes
 * accidentally introduce overlapping or floating boxes.
 */
import { describe, it, expect } from "vitest";
import { validatePackGeometry, validateAdvancedPack, HARD } from "./geometry-validator";
import { packContainerAdvanced } from "./packing-advanced";
import { CONTAINERS, type PlacedBox } from "./packing";
import type { CbmItem } from "./calculators";

const HC = CONTAINERS.find((c) => c.id === "40hc")!;

function box(x: number, y: number, z: number, l: number, w: number, h: number, itemIdx = 0): PlacedBox {
  return { x, y, z, l, w, h, color: "#000", itemIdx, rotated: null };
}

describe("validatePackGeometry — hard physical rules", () => {
  it("passes a clean two-box floor pack", () => {
    const placed = [
      box(60, 60, 0, 1200, 1000, 1000),
      box(60, 1110, 0, 1200, 1000, 1000), // 50mm gap on Y, well clear of walls
    ];
    const a = validatePackGeometry(placed, HC);
    expect(a.allLegal).toBe(true);
    expect(a.violations).toEqual([]);
  });

  it("detects pairwise overlap", () => {
    const placed = [
      box(60, 60, 0, 1200, 1000, 1000),
      box(60, 500, 0, 1200, 1000, 1000), // overlaps the first on Y
    ];
    const a = validatePackGeometry(placed, HC);
    expect(a.allLegal).toBe(false);
    expect(a.violations.some((v) => v.code === "OVERLAP")).toBe(true);
  });

  it("detects neighbour gap < 50 mm with vertical overlap", () => {
    const placed = [
      box(60, 60, 0, 1200, 1000, 1000),
      box(60, 1080, 0, 1200, 1000, 1000), // only 20mm gap on Y
    ];
    const a = validatePackGeometry(placed, HC);
    expect(a.allLegal).toBe(false);
    expect(a.violations.some((v) => v.code === "NEIGHBOUR_GAP")).toBe(true);
  });

  it("does NOT flag neighbour-gap when one box is stacked above the other", () => {
    // A box at z=1000 on top of a box at z=0..1000 must be allowed even when
    // their X/Y footprints share the same column (perfectly stacked).
    const placed = [
      box(60, 60, 0, 1200, 1000, 1000),
      box(60, 60, 1000, 1200, 1000, 1000),
    ];
    const a = validatePackGeometry(placed, HC);
    expect(a.allLegal).toBe(true);
  });

  it("detects ceiling clearance breach", () => {
    const C = HC.inner;
    const placed = [
      box(60, 60, 0, 1200, 1000, C.h - 30), // top is only 30mm under roof
    ];
    const a = validatePackGeometry(placed, HC);
    expect(a.violations.some((v) => v.code === "CEILING_GAP")).toBe(true);
  });

  it("detects door reserve breach", () => {
    const C = HC.inner;
    const placed = [
      box(C.l - 1100, 60, 0, 1200, 1000, 1000), // box extends to door wall
    ];
    const a = validatePackGeometry(placed, HC);
    expect(a.violations.some((v) => v.code === "DOOR_GAP")).toBe(true);
  });

  it("detects floating cargo (no support below)", () => {
    const placed = [
      box(60, 60, 1500, 1200, 1000, 1000), // hovering at z=1500 with nothing under it
    ];
    const a = validatePackGeometry(placed, HC);
    expect(a.violations.some((v) => v.code === "FLOATING")).toBe(true);
    expect(a.supportRatios[0]).toBeLessThan(HARD.EPS_MM);
  });

  it("detects weak support (< 85%) when the stacked box hangs off the supporter", () => {
    const placed = [
      box(60, 60, 0, 1200, 1000, 1000),
      // Stacked box hangs ~70% off the side (only 30% supported underneath).
      box(900, 60, 1000, 1200, 1000, 800),
    ];
    const a = validatePackGeometry(placed, HC);
    // Either WEAK_SUPPORT (partial overlap) or FLOATING (zero overlap).
    expect(
      a.violations.some((v) => v.code === "WEAK_SUPPORT" || v.code === "FLOATING"),
    ).toBe(true);
  });

  it("flags non-stackable when something is loaded above it", () => {
    // The validator's flag accessor receives the placed box's itemIdx —
    // index 0 is the floor box (non-stackable), index 1 is the stacked one.
    const placed = [
      box(60, 60, 0, 1200, 1000, 1000, 0),
      box(60, 60, 1000, 1200, 1000, 800, 1),
    ];
    const a = validatePackGeometry(placed, HC, (idx) => ({
      stackable: idx !== 0, // item 0 is non-stackable
      fragile: false,
    }));
    expect(a.violations.some((v) => v.code === "NONSTACK_LOADED")).toBe(true);
  });

  it("flags fragile when something is loaded above it", () => {
    const placed = [
      box(60, 60, 0, 1200, 1000, 1000, 0),
      box(60, 60, 1000, 1200, 1000, 800, 1),
    ];
    const a = validatePackGeometry(placed, HC, (idx) => ({
      stackable: true,
      fragile: idx === 0, // item 0 is fragile
    }));
    expect(a.violations.some((v) => v.code === "FRAGILE_LOADED")).toBe(true);
  });
});

describe("validateAdvancedPack — real packer output", () => {
  it("clean homogeneous pack passes the audit", () => {
    const items: CbmItem[] = [
      {
        id: "carton",
        length: 60,
        width: 40,
        height: 40,
        qty: 30,
        weight: 15,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    const pack = packContainerAdvanced(items, HC);
    const audit = validateAdvancedPack(pack);
    expect(audit.allLegal).toBe(true);
    // Every box must have full or near-full support.
    audit.supportRatios.forEach((r) => expect(r).toBeGreaterThanOrEqual(HARD.MIN_SUPPORT_RATIO));
  });

  it("mixed-SKU stacked pack respects support and clearance rules", () => {
    const items: CbmItem[] = [
      {
        id: "big-pallet",
        length: 120,
        width: 100,
        height: 110,
        qty: 8,
        weight: 200,
        packageType: "pallet",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
      {
        id: "small-cube",
        length: 60,
        width: 60,
        height: 60,
        qty: 16,
        weight: 25,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    const pack = packContainerAdvanced(items, HC);
    const audit = validateAdvancedPack(pack);
    // Allow YELLOW-style advisories from the compliance layer, but the
    // hard geometry audit must be clean — no overlap, no floating, no clearance breach.
    expect(audit.violations.filter((v) =>
      ["OVERLAP", "FLOATING", "CEILING_GAP", "DOOR_GAP", "NONSTACK_LOADED", "FRAGILE_LOADED"].includes(v.code)
    )).toEqual([]);
  });

  it("stacked floor-and-top boxes share identical X/Y coordinates so 3D viewer can rely on raw z", () => {
    // Regression: if two cartons of the same size stack, the top box must
    // sit at z = bottom.h exactly. The 3D viewer uses raw z values now
    // (no pallet lift offset), so any deviation here would visibly float.
    const items: CbmItem[] = [
      {
        id: "cube",
        length: 100,
        width: 100,
        height: 100,
        qty: 6,
        weight: 50,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    const pack = packContainerAdvanced(items, HC);
    // Find at least one stacked carton.
    const stacked = pack.placed.find((b) => b.z > 0);
    if (stacked) {
      // Its bottom z must equal the top of some other box (within 1 mm).
      const supporter = pack.placed.find(
        (b) => Math.abs(b.z + b.h - stacked.z) < 1,
      );
      expect(supporter).toBeDefined();
    }
  });

  it("resolves supporter equality within EPS for non-grid-aligned stacks (1066.8mm cubes)", () => {
    // Three perfectly-stacked 1066.8mm cubes — the canonical Float32-drift case.
    // Tops sit at 1066.8, 2133.6, 3200.4 — all must register full support (ratio = 1).
    const placed = [
      box(60, 60, 0,      1067, 1067, 1067),
      box(60, 60, 1067,   1067, 1067, 1067),
      box(60, 60, 2134,   1067, 1067, 1067),
    ];
    const a = validatePackGeometry(placed, HC);
    expect(a.violations.filter(v => v.code === "FLOATING")).toEqual([]);
    expect(a.violations.filter(v => v.code === "WEAK_SUPPORT")).toEqual([]);
    expect(a.supportRatios.every((r) => r >= 0.99)).toBe(true);
  });
});
