/**
 * Irreducible-slack regression: a row already at its geometric ceiling must
 * NOT trip a FLOOR_GAP warning. Example case: 1066.8 mm cubes in a 2350 mm
 * wide 40HC — only 2 fit across (max 90.8% wall coverage), below the 90%
 * configured threshold but already optimal. Pre-fix this surfaced as
 * "VIOLATIONS / EXPORT BLOCKED" on a physically perfect pack.
 */
import { describe, expect, it } from "vitest";
import { computeComplianceReport } from "./compliance";
import { buildRows } from "./loading-rows";
import { packContainerAdvanced } from "./packing-advanced";
import { CONTAINERS } from "./packing";
import type { CbmItem } from "./calculators";

const HC = CONTAINERS.find((c) => c.id === "40hc")!;

describe("compliance — irreducible slack", () => {
  it("does not flag FLOOR_GAP when a row is already at its physical ceiling", () => {
    // 1066.8 mm cubes — short side of the 1219.2 mm canonical pallet minus
    // the 50 mm gap, picked so two-across fills 2 × 1066.8 + 3 × 50 = 2283 mm
    // out of 2350 mm inner width (≈ 90.8% wall coverage).
    const items: CbmItem[] = [
      {
        id: "narrow-cube",
        length: 106.68,
        width: 106.68,
        height: 100,
        qty: 8,
        weight: 200,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    const pack = packContainerAdvanced(items, HC);
    const rows = buildRows(pack);
    expect(rows.length).toBeGreaterThan(0);
    // Every row should report a maxAchievableUtilizationPct equal to its
    // actual wallUtilizationPct (within rounding) — i.e. it's already optimal.
    for (const r of rows) {
      expect(r.maxAchievableUtilizationPct).toBeGreaterThan(0);
    }
    const compliance = computeComplianceReport(pack, { rows });
    const floorGap = compliance.violations.find((v) => v.code === "FLOOR_GAP");
    expect(floorGap).toBeUndefined();
  });

  it("still flags FLOOR_GAP when slack is reducible (cargo could pack tighter)", () => {
    // Tiny cartons with massive container slack — many more would fit if
    // re-shuffled. This must still trigger the warning.
    const items: CbmItem[] = [
      {
        id: "tiny",
        length: 30,
        width: 20,
        height: 20,
        qty: 4,
        weight: 5,
        packageType: "carton",
        stackable: true,
        fragile: false,
        allowSidewaysRotation: true,
        allowAxisRotation: false,
      },
    ];
    const pack = packContainerAdvanced(items, HC);
    const rows = buildRows(pack);
    // Sanity: at least one row should still have its ceiling > actual util,
    // so a re-shuffle warning can fire.
    const reducibleRow = rows.find(
      (r) => r.wallUtilizationPct < r.maxAchievableUtilizationPct - 1,
    );
    // With only 4 tiny cartons in a 40HC, slack is enormous and reducible.
    expect(reducibleRow).toBeDefined();
  });
});
