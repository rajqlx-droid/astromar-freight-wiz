/**
 * Accuracy suite: end-to-end packer + validator must produce zero
 * OVERLAP / FLOATING / DOOR_GAP / CEILING_GAP across realistic manifests.
 *
 * Pins the "100% accurate 3D loading view" promise:
 * cartons render exactly where the packer placed them, no two ever
 * intersect, none float, and the door + ceiling reserves are honoured.
 */
import { describe, expect, it } from "vitest";
import { packContainerAdvanced } from "./packing-advanced";
import { validateAdvancedPack } from "./geometry-validator";
import { CONTAINERS } from "./packing";
import type { CbmItem } from "./calculators";

const C20 = CONTAINERS.find((c) => c.id === "20gp")!;
const C40 = CONTAINERS.find((c) => c.id === "40gp")!;
const HC = CONTAINERS.find((c) => c.id === "40hc")!;

// Helper: assert the pack passes the strict accuracy checks.
function assertAccurate(pack: ReturnType<typeof packContainerAdvanced>) {
  const audit = validateAdvancedPack(pack);
  const groups = ["OVERLAP", "FLOATING", "DOOR_GAP", "CEILING_GAP"] as const;
  for (const code of groups) {
    expect(
      audit.violations.filter((v) => v.code === code),
      `unexpected ${code} violations`,
    ).toEqual([]);
  }
  // Pairwise AABB intersection — no two boxes share more than 0.5 mm in
  // every axis. This catches drift the OVERLAP rule would also flag, but
  // we restate it here so a future validator change can never silently
  // hide an overlap.
  const EPS = 0.5;
  for (let i = 0; i < pack.placed.length; i++) {
    for (let j = i + 1; j < pack.placed.length; j++) {
      const a = pack.placed[i];
      const b = pack.placed[j];
      const dx = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y);
      const dz = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
      if (dx > EPS && dy > EPS && dz > EPS) {
        throw new Error(
          `boxes ${i} and ${j} overlap by ${dx.toFixed(2)}×${dy.toFixed(2)}×${dz.toFixed(2)} mm`,
        );
      }
    }
  }
  // Floor/support check: every box either sits on the floor (z≈0) or has
  // a supporter whose top face matches its bottom within 2 mm.
  for (let i = 0; i < pack.placed.length; i++) {
    const b = pack.placed[i];
    if (b.z < 2) continue;
    const supported = pack.placed.some(
      (s, k) =>
        k !== i &&
        Math.abs(s.z + s.h - b.z) < 2 &&
        Math.min(s.x + s.l, b.x + b.l) > Math.max(s.x, b.x) &&
        Math.min(s.y + s.w, b.y + b.w) > Math.max(s.y, b.y),
    );
    expect(supported, `box ${i} at z=${b.z} has no supporter`).toBe(true);
  }
  // Counter consistency.
  expect(pack.placed.length).toBe(pack.placedCartons);
}

describe("packing-advanced — 3D-accuracy regression", () => {
  it("dense single SKU — 41 × 1067 mm cubes in 40HC", () => {
    const items: CbmItem[] = [
      {
        id: "cube",
        length: 106.68,
        width: 106.68,
        height: 106.68,
        qty: 41,
        weight: 80,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    assertAccurate(packContainerAdvanced(items, HC));
  });

  it("light single SKU — 6 × 1 m cubes in 40HC (spread mode)", () => {
    const items: CbmItem[] = [
      {
        id: "cube",
        length: 100,
        width: 100,
        height: 100,
        qty: 6,
        weight: 200,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    assertAccurate(packContainerAdvanced(items, HC));
  });

  it("mixed cartons — 30 × 80 cm + 20 × 110 cm in 20GP", () => {
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
    assertAccurate(packContainerAdvanced(items, C20));
  });

  it("Euro pallets — 16 × 120×80×150 in 40HC", () => {
    const items: CbmItem[] = [
      {
        id: "euro",
        length: 120,
        width: 80,
        height: 150,
        qty: 16,
        weight: 800,
        packageType: "pallet",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    assertAccurate(packContainerAdvanced(items, HC));
  });

  it("tall cargo — 8 × 100×100×260 cm cartons in 40HC", () => {
    const items: CbmItem[] = [
      {
        id: "tall",
        length: 100,
        width: 100,
        height: 260,
        qty: 8,
        weight: 400,
        packageType: "carton",
        stackable: false,
        fragile: false,
        allowSidewaysRotation: false,
        allowAxisRotation: false,
      },
    ];
    assertAccurate(packContainerAdvanced(items, HC));
  });

  it("heavy + light mix — 10 drums + 30 cartons in 40GP", () => {
    const items: CbmItem[] = [
      {
        id: "drum",
        length: 60,
        width: 60,
        height: 90,
        qty: 10,
        weight: 600,
        packageType: "drum",
        stackable: false,
        fragile: false,
        allowSidewaysRotation: false,
        allowAxisRotation: false,
      },
      {
        id: "carton",
        length: 50,
        width: 40,
        height: 40,
        qty: 30,
        weight: 20,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    assertAccurate(packContainerAdvanced(items, C40));
  });
});
