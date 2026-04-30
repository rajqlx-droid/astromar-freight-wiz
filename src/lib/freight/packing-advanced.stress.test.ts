/**
 * Viral-traffic readiness — per-device stress tests.
 *
 * Exercises the same packContainerAdvanced() function the Web Worker calls,
 * to verify a single user's repeated pack runs do not leak memory and stay
 * within a per-run time budget.
 */
import { describe, expect, it } from "vitest";
import { packContainerAdvanced } from "./packing-advanced";
import { CONTAINERS } from "./packing";
import type { CbmItem } from "./calculators";

const cube = (qty: number, weight = 10): CbmItem[] => [
  {
    id: "stress-cube",
    length: 45.72,
    width: 45.72,
    height: 45.72,
    qty,
    weight,
    packageType: "carton",
    stackable: true,
    fragile: false,
    allowSidewaysRotation: true,
    allowAxisRotation: false,
  },
];

describe("packing-advanced — viral-traffic stress", () => {
  it("10 sequential 650-carton packs stay within memory + time budget", () => {
    const hc = CONTAINERS.find((c) => c.id === "40hc")!;
    const RUNS = 10;
    const TIME_BUDGET_MS = 5000;
    const HEAP_BUDGET_MB = 50;

    // Warm up V8 so JIT noise doesn't pollute the baseline.
    packContainerAdvanced(cube(50), hc);
    if (typeof global.gc === "function") global.gc();

    const heapBefore = process.memoryUsage().heapUsed;
    const timings: number[] = [];

    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const result = packContainerAdvanced(cube(650), hc);
      const elapsed = performance.now() - t0;
      timings.push(elapsed);
      // Sanity — every run must place a non-trivial number of cartons.
      expect(result.placedCartons).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(TIME_BUDGET_MS);
    }

    if (typeof global.gc === "function") global.gc();
    const heapAfter = process.memoryUsage().heapUsed;
    const heapDeltaMb = (heapAfter - heapBefore) / 1024 / 1024;

    // eslint-disable-next-line no-console
    console.log("[stress] 10× 650-carton pack timings (ms):", timings.map((t) => Math.round(t)));
    // eslint-disable-next-line no-console
    console.log(`[stress] heap delta after 10 runs: ${heapDeltaMb.toFixed(1)} MB`);

    expect(heapDeltaMb).toBeLessThan(HEAP_BUDGET_MB);
  }, 60_000);

  it("20 sequential 250-carton packs return deterministic results", () => {
    const hc = CONTAINERS.find((c) => c.id === "40hc")!;
    const baseline = packContainerAdvanced(cube(250), hc);
    for (let i = 0; i < 20; i++) {
      const r = packContainerAdvanced(cube(250), hc);
      // Deterministic: identical input → identical placed count and weight.
      expect(r.placedCartons).toBe(baseline.placedCartons);
      expect(r.placedWeightKg).toBe(baseline.placedWeightKg);
    }
  }, 30_000);
});
