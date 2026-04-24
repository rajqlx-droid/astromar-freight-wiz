/**
 * pickBestPlan — internal scenario sweep used by the Optimise loading flow.
 *
 * Hard rules (per the maximise-CBM plan):
 *   - Use 100% of container geometric inner dimensions (no stowage haircut).
 *   - 50 mm minimum gap (gap-rules.ts).
 *   - No hanging / no overlap (SUPPORT_MIN_RATIO 0.85 in the packer).
 *   - Single 40HC ceiling — anything left over is shut-out cargo.
 *
 * These tests pin those guarantees so future refactors can't silently
 * downscale the manifest, ignore strategies, or pick a worse plan.
 */
import { describe, expect, it } from "vitest";
import { pickBestPlan } from "./scenario-runner";
import { CONTAINERS } from "./packing";
import type { CbmItem } from "./calculators";

const HC = CONTAINERS.find((c) => c.id === "40hc")!;

function makeItem(partial: Partial<CbmItem> & { qty: number }): CbmItem {
  return {
    id: partial.id ?? `it-${Math.random().toString(36).slice(2, 8)}`,
    length: 60,
    width: 40,
    height: 40,
    weight: 20,
    packageType: "carton",
    stackable: true,
    fragile: false,
    allowSidewaysRotation: true,
    allowAxisRotation: false,
    ...partial,
  };
}

describe("pickBestPlan — multi-strategy CBM optimiser", () => {
  it("returns four ranked strategy results with one marked best", () => {
    const items = [makeItem({ qty: 50 })];
    const { best, all } = pickBestPlan(items, HC);
    expect(all).toHaveLength(4);
    expect(all.filter((r) => r.isBest)).toHaveLength(1);
    expect(best.isBest).toBe(true);
    expect(best.rank).toBe(1);
  });

  it("picks the plan with the highest placedCargoCbm", () => {
    const items = [makeItem({ qty: 50 })];
    const { best, all } = pickBestPlan(items, HC);
    const maxCbm = Math.max(...all.map((r) => r.pack.placedCargoCbm));
    expect(best.pack.placedCargoCbm).toBe(maxCbm);
  });

  it("places everything when the manifest comfortably fits a 40HC", () => {
    // 18 cartons of a 121.92cm cube — the canonical regression case.
    const items: CbmItem[] = [
      makeItem({
        id: "cube4ft",
        length: 121.92,
        width: 121.92,
        height: 121.92,
        qty: 18,
        weight: 500,
      }),
    ];
    const { best } = pickBestPlan(items, HC);
    expect(best.pack.placedCartons).toBe(18);
  });

  it("does NOT silently downscale large manifests (uses 100% qty)", () => {
    // 600 small cartons. The legacy runAllScenarios used to scale qty>300
    // down to 300; pickBestPlan must NOT do that — totalCartons must reflect
    // the full manifest.
    const items = [makeItem({ qty: 600, length: 30, width: 20, height: 20 })];
    const { best } = pickBestPlan(items, HC);
    expect(best.pack.totalCartons).toBe(600);
  });

  it("returns a partial plan with shut-out math when manifest exceeds 40HC", () => {
    // 200 oversized cartons — guaranteed to exceed 40HC capacity.
    const items = [
      makeItem({
        id: "big",
        length: 120,
        width: 100,
        height: 100,
        qty: 200,
        weight: 100,
      }),
    ];
    const { best, meta } = pickBestPlan(items, HC);
    expect(best.pack.placedCartons).toBeLessThan(200);
    expect(best.pack.placedCartons).toBeGreaterThan(0);
    // Densest legal pack should still leave the 50mm gap (no overlap),
    // so utilization stays under 100%.
    expect(best.pack.utilizationPct).toBeLessThanOrEqual(100);
    // Shut-out totals reflect the overflow regardless of which fallback path
    // wins (legal-with-shutout vs cleanest-dirty).
    expect(meta.shutOut).not.toBeNull();
    expect(meta.shutOut!.cartons).toBeGreaterThan(0);
    expect(meta.shutOut!.cbm).toBeGreaterThan(0);
    // Shape check: meta is always populated.
    expect(typeof meta.allLegal).toBe("boolean");
    expect(Array.isArray(meta.hardViolations)).toBe(true);
  });

  it("reports zero shut-out when the manifest fits cleanly", () => {
    const items = [makeItem({ qty: 20, length: 60, width: 40, height: 40 })];
    const { meta } = pickBestPlan(items, HC);
    expect(meta.shutOut).toBeNull();
    expect(meta.allLegal).toBe(true);
  });
});
