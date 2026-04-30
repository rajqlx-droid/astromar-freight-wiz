/**
 * Multi-commodity packing — single container, 10–20 distinct SKUs.
 *
 * Real freight manifests routinely span 10–20 line items in one container.
 * This suite covers the gap between the single-SKU dense suite
 * (packing-advanced.accuracy.test.ts) and the 2–3 SKU mixes elsewhere.
 *
 * Asserts for every scenario:
 *   - zero pairwise AABB overlap (>0.5 mm any axis)
 *   - every placed box is on the floor or supported within 2 mm
 *   - placed weight ≤ container.maxPayloadKg
 *   - sum of placed-cartons CBM == result.placedCargoCbm (±0.0001 m³)
 *   - validateAdvancedPack() returns zero OVERLAP/FLOATING/DOOR_GAP/CEILING_GAP
 *   - per-SKU: planned === placed + unplaced
 *
 * Multi-container loading was removed from the app — every scenario packs
 * into a SINGLE container. SKUs that don't fit must be reported as
 * `unplaced` with a `reason`, never silently dropped or overlapped.
 */
import { describe, expect, it } from "vitest";
import { packContainerAdvanced } from "./packing-advanced";
import { validateAdvancedPack } from "./geometry-validator";
import { CONTAINERS } from "./packing";
import type { CbmItem, PackageType } from "./calculators";

const C20 = CONTAINERS.find((c) => c.id === "20gp")!;
const C40 = CONTAINERS.find((c) => c.id === "40gp")!;
const HC = CONTAINERS.find((c) => c.id === "40hc")!;

type Pack = ReturnType<typeof packContainerAdvanced>;

interface SkuSpec {
  id: string;
  l: number; w: number; h: number; // cm
  qty: number;
  weight: number; // kg per piece
  type: PackageType;
  stackable?: boolean;
  fragile?: boolean;
  sideways?: boolean;
  axis?: boolean;
}

function mk(specs: SkuSpec[]): CbmItem[] {
  return specs.map((s) => ({
    id: s.id,
    length: s.l,
    width: s.w,
    height: s.h,
    qty: s.qty,
    weight: s.weight,
    packageType: s.type,
    stackable: s.stackable ?? true,
    fragile: s.fragile ?? false,
    allowSidewaysRotation: s.sideways ?? true,
    allowAxisRotation: s.axis ?? false,
  }));
}

function assertNoOverlapOrFloat(pack: Pack) {
  const audit = validateAdvancedPack(pack);
  for (const code of ["OVERLAP", "FLOATING", "DOOR_GAP", "CEILING_GAP"] as const) {
    expect(
      audit.violations.filter((v) => v.code === code),
      `unexpected ${code} violations`,
    ).toEqual([]);
  }

  const EPS = 0.5;
  for (let i = 0; i < pack.placed.length; i++) {
    for (let j = i + 1; j < pack.placed.length; j++) {
      const a = pack.placed[i], b = pack.placed[j];
      const dx = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y);
      const dz = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
      if (dx > EPS && dy > EPS && dz > EPS) {
        throw new Error(
          `boxes ${i}((idx ${a.itemIdx}) and ${j}((idx ${b.itemIdx}) overlap by ` +
          `${dx.toFixed(2)}×${dy.toFixed(2)}×${dz.toFixed(2)} mm`,
        );
      }
    }
  }

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
    expect(supported, `box ${i} ((idx ${b.itemIdx}) at z=${b.z} has no supporter`).toBe(true);
  }
}

function assertCommonInvariants(pack: Pack, manifest: CbmItem[]) {
  // Counter consistency.
  expect(pack.placed.length).toBe(pack.placedCartons);

  // Weight cap honoured.
  expect(pack.placedWeightKg).toBeLessThanOrEqual(pack.container.maxPayloadKg + 0.5);

  // Per-SKU planned == placed + unplaced.
  expect(pack.perItem.length).toBe(manifest.length);
  for (const stat of pack.perItem) {
    expect(stat.planned).toBe(stat.placed + stat.unplaced);
    const src = manifest.find((m) => m.id === stat.itemId);
    expect(src, `perItem includes unknown SKU ${stat.itemId}`).toBeDefined();
    expect(stat.planned).toBe(src!.qty);
  }

  // Sum of placed-carton CBM matches placedCargoCbm.
  const summed = pack.placed.reduce(
    (acc, b) => acc + (b.l * b.w * b.h) / 1e9, // mm³ → m³
    0,
  );
  expect(Math.abs(summed - pack.placedCargoCbm)).toBeLessThan(1e-4);

  // No overlap / floating / door / ceiling violations and every box supported.
  assertNoOverlapOrFloat(pack);
}

describe("packing-advanced — multi-commodity (single container)", () => {
  it("12-SKU general cargo fits a 40HC", () => {
    const manifest = mk([
      { id: "ctn-A", l: 60, w: 40, h: 40, qty: 30, weight: 18, type: "carton" },
      { id: "ctn-B", l: 50, w: 50, h: 50, qty: 20, weight: 22, type: "carton" },
      { id: "ctn-C", l: 80, w: 60, h: 60, qty: 12, weight: 35, type: "carton" },
      { id: "ctn-D", l: 45, w: 35, h: 35, qty: 40, weight: 12, type: "carton" },
      { id: "ctn-E", l: 70, w: 50, h: 45, qty: 15, weight: 25, type: "carton" },
      { id: "ctn-F", l: 55, w: 40, h: 50, qty: 18, weight: 16, type: "carton" },
      { id: "pal-G", l: 120, w: 80, h: 100, qty: 4, weight: 320, type: "pallet", sideways: false },
      { id: "pal-H", l: 120, w: 100, h: 110, qty: 3, weight: 380, type: "pallet", sideways: false },
      { id: "drm-I", l: 60, w: 60, h: 90, qty: 6, weight: 180, type: "drum", stackable: false },
      { id: "bag-J", l: 70, w: 50, h: 25, qty: 25, weight: 30, type: "bag" },
      { id: "bal-K", l: 90, w: 60, h: 60, qty: 8, weight: 90, type: "bale" },
      { id: "crt-L", l: 100, w: 80, h: 80, qty: 5, weight: 110, type: "crate", sideways: false },
    ]);
    const pack = packContainerAdvanced(manifest, HC);
    assertCommonInvariants(pack, manifest);
    const totalPlanned = manifest.reduce((a, m) => a + m.qty, 0);
    // 40HC has ~76 m³ stowable; manifest is sized to fit comfortably.
    expect(pack.placedCartons / totalPlanned).toBeGreaterThan(0.9);
    // eslint-disable-next-line no-console
    console.log(
      `[multi-12] placed ${pack.placedCartons}/${totalPlanned} ` +
      `util=${pack.utilizationPct.toFixed(1)}% wt=${pack.placedWeightKg.toFixed(0)}kg`,
    );
  }, 30_000);

  it("18-SKU e-commerce mix fits a 40GP", () => {
    const manifest = mk([
      { id: "sku-01", l: 30, w: 25, h: 20, qty: 60, weight: 4, type: "carton" },
      { id: "sku-02", l: 35, w: 30, h: 25, qty: 50, weight: 6, type: "carton" },
      { id: "sku-03", l: 40, w: 30, h: 30, qty: 45, weight: 8, type: "carton" },
      { id: "sku-04", l: 45, w: 35, h: 30, qty: 40, weight: 10, type: "carton" },
      { id: "sku-05", l: 50, w: 40, h: 35, qty: 35, weight: 12, type: "carton" },
      { id: "sku-06", l: 55, w: 40, h: 40, qty: 30, weight: 14, type: "carton" },
      { id: "sku-07", l: 60, w: 45, h: 40, qty: 25, weight: 18, type: "carton" },
      { id: "sku-08", l: 50, w: 50, h: 50, qty: 24, weight: 20, type: "carton" },
      { id: "sku-09", l: 40, w: 40, h: 40, qty: 36, weight: 11, type: "carton" },
      { id: "sku-10", l: 35, w: 35, h: 35, qty: 40, weight: 9, type: "carton" },
      { id: "sku-11", l: 60, w: 40, h: 30, qty: 28, weight: 15, type: "carton" },
      { id: "sku-12", l: 70, w: 40, h: 40, qty: 18, weight: 19, type: "carton" },
      { id: "sku-13", l: 45, w: 30, h: 25, qty: 50, weight: 7, type: "carton" },
      { id: "sku-14", l: 50, w: 30, h: 20, qty: 45, weight: 6, type: "carton" },
      { id: "sku-15", l: 30, w: 30, h: 30, qty: 50, weight: 5, type: "carton" },
      { id: "sku-16", l: 80, w: 50, h: 40, qty: 12, weight: 24, type: "carton" },
      { id: "sku-17", l: 25, w: 20, h: 15, qty: 80, weight: 3, type: "carton" },
      { id: "sku-18", l: 40, w: 25, h: 25, qty: 55, weight: 7, type: "carton" },
    ]);
    const pack = packContainerAdvanced(manifest, C40);
    assertCommonInvariants(pack, manifest);
    const totalPlanned = manifest.reduce((a, m) => a + m.qty, 0);
    // Tight fit: at least 80% must be placed; utilization should be healthy.
    expect(pack.placedCartons / totalPlanned).toBeGreaterThan(0.8);
    expect(pack.utilizationPct).toBeGreaterThan(50);
    // eslint-disable-next-line no-console
    console.log(
      `[multi-18] placed ${pack.placedCartons}/${totalPlanned} ` +
      `util=${pack.utilizationPct.toFixed(1)}% wt=${pack.placedWeightKg.toFixed(0)}kg`,
    );
  }, 60_000);

  it("20-SKU industrial mix overflows a 20GP gracefully (no silent drops)", () => {
    // Intentionally exceeds 20GP capacity (~33 m³, 28 t) so we exercise
    // the unplaced-reporting path with 20 distinct SKUs.
    const manifest = mk([
      { id: "drm-01", l: 60, w: 60, h: 90, qty: 12, weight: 200, type: "drum", stackable: false },
      { id: "drm-02", l: 55, w: 55, h: 85, qty: 10, weight: 180, type: "drum", stackable: false },
      { id: "crt-03", l: 100, w: 80, h: 80, qty: 6, weight: 250, type: "crate", sideways: false },
      { id: "crt-04", l: 120, w: 90, h: 100, qty: 4, weight: 320, type: "crate", sideways: false },
      { id: "pal-05", l: 120, w: 80, h: 120, qty: 6, weight: 450, type: "pallet", sideways: false },
      { id: "pal-06", l: 120, w: 100, h: 130, qty: 4, weight: 500, type: "pallet", sideways: false },
      { id: "bal-07", l: 90, w: 60, h: 60, qty: 12, weight: 80, type: "bale" },
      { id: "bal-08", l: 80, w: 50, h: 50, qty: 14, weight: 65, type: "bale" },
      { id: "bag-09", l: 70, w: 50, h: 25, qty: 30, weight: 35, type: "bag" },
      { id: "bag-10", l: 60, w: 40, h: 20, qty: 40, weight: 28, type: "bag" },
      { id: "ctn-11", l: 80, w: 60, h: 60, qty: 14, weight: 30, type: "carton" },
      { id: "ctn-12", l: 70, w: 50, h: 50, qty: 18, weight: 22, type: "carton" },
      { id: "ctn-13", l: 60, w: 40, h: 40, qty: 25, weight: 16, type: "carton" },
      { id: "ctn-14", l: 50, w: 50, h: 50, qty: 20, weight: 18, type: "carton" },
      { id: "ctn-15", l: 45, w: 35, h: 35, qty: 30, weight: 12, type: "carton" },
      { id: "ctn-16", l: 55, w: 40, h: 30, qty: 25, weight: 14, type: "carton" },
      { id: "ctn-17", l: 40, w: 40, h: 40, qty: 30, weight: 11, type: "carton" },
      { id: "ctn-18", l: 65, w: 45, h: 45, qty: 18, weight: 20, type: "carton" },
      { id: "ctn-19", l: 75, w: 55, h: 50, qty: 12, weight: 26, type: "carton" },
      { id: "ctn-20", l: 90, w: 70, h: 70, qty: 8, weight: 40, type: "carton" },
    ]);
    const pack = packContainerAdvanced(manifest, C20);
    assertCommonInvariants(pack, manifest);

    const totalPlanned = manifest.reduce((a, m) => a + m.qty, 0);
    const totalUnplaced = pack.perItem.reduce((a, s) => a + s.unplaced, 0);

    // Overflow expected: at least one SKU must be partially or fully unplaced,
    // and every unplaced SKU must carry an explanatory reason (no silent drops).
    expect(totalUnplaced).toBeGreaterThan(0);
    for (const stat of pack.perItem) {
      if (stat.unplaced > 0) {
        expect(stat.reason, `SKU ${stat.itemId} unplaced without reason`).toBeTruthy();
      }
    }
    // Container must still be well-utilized despite overflow.
    expect(pack.utilizationPct).toBeGreaterThan(40);

    // eslint-disable-next-line no-console
    console.log(
      `[multi-20-overflow] placed ${pack.placedCartons}/${totalPlanned} ` +
      `unplaced=${totalUnplaced} util=${pack.utilizationPct.toFixed(1)}% ` +
      `wt=${pack.placedWeightKg.toFixed(0)}/${C20.maxPayloadKg}kg`,
    );
  }, 60_000);
});
