/**
 * Walkthrough audit harness — proves that for every scenario × container in
 * the test matrix, every revealed step of the row-by-row Play/Next walkthrough
 * shows a geometrically legal subset (no overlaps, no sub-1 mm crowding,
 * no floating cargo).
 *
 * The 3D viewer's fly-in animation is purely visual — the placed[] coordinates
 * are the ground truth. This test reproduces exactly what `container-load-view`
 * computes for `visiblePlacedIdxs` at every step, then runs the same
 * `validateAdvancedPackSubset` the live HUD chip uses.
 *
 * If any step ever fails, we know it is a real packer / reveal-order bug — not
 * a fly-in artefact.
 */
import { describe, expect, it } from "vitest";
import { CONTAINERS } from "../packing";
import { pickBestPlan } from "../scenario-runner";
import { buildPalletSequence, buildRows } from "../loading-rows";
import { validateAdvancedPackSubset } from "../geometry-validator";
import type { CbmItem } from "../calculators";

const C20 = CONTAINERS.find((c) => c.id === "20gp")!;
const C40 = CONTAINERS.find((c) => c.id === "40gp")!;
const HC = CONTAINERS.find((c) => c.id === "40hc")!;

function makeItem(p: Partial<CbmItem> & { qty: number }): CbmItem {
  return {
    id: p.id ?? `it-${Math.random().toString(36).slice(2, 8)}`,
    length: 60,
    width: 40,
    height: 40,
    weight: 20,
    packageType: "carton",
    stackable: true,
    fragile: false,
    allowSidewaysRotation: true,
    allowAxisRotation: false,
    ...p,
  };
}

/**
 * Reproduce `container-load-view.tsx`'s `visiblePlacedIdxs` derivation
 * (including the supporter auto-include loop) for step `palletIdx`.
 */
function visibleAtStep(
  pack: ReturnType<typeof pickBestPlan>["best"]["pack"],
  palletSequence: ReturnType<typeof buildPalletSequence>,
  palletIdx: number,
): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i <= palletIdx; i++) {
    const step = palletSequence[i];
    if (step) s.add(step.placedIdx);
  }
  const placed = pack.placed;
  const SUPPORT_EPS = 2;
  let changed = true;
  while (changed) {
    changed = false;
    for (const idx of Array.from(s)) {
      const b = placed[idx];
      if (!b || b.z < SUPPORT_EPS) continue;
      for (let j = 0; j < placed.length; j++) {
        if (s.has(j)) continue;
        const c = placed[j];
        if (Math.abs(c.z + c.h - b.z) > SUPPORT_EPS) continue;
        const xo = Math.min(c.x + c.l, b.x + b.l) - Math.max(c.x, b.x);
        const yo = Math.min(c.y + c.w, b.y + b.w) - Math.max(c.y, b.y);
        if (xo > 1 && yo > 1) {
          s.add(j);
          changed = true;
        }
      }
    }
  }
  return s;
}

const matrix: Array<{ name: string; container: typeof C20; items: CbmItem[] }> = [
  {
    name: "20GP · cartons + drums + bales",
    container: C20,
    items: [
      makeItem({ id: "carton", qty: 60, length: 50, width: 40, height: 35, weight: 12 }),
      makeItem({ id: "drum", qty: 8, length: 60, width: 60, height: 90, weight: 70, packageType: "drum", allowAxisRotation: false }),
      makeItem({ id: "bale", qty: 6, length: 100, width: 70, height: 50, weight: 40, packageType: "bale" }),
    ],
  },
  {
    name: "20GP · dense same-size carton stack",
    container: C20,
    items: [
      makeItem({ id: "uni", qty: 100, length: 40, width: 30, height: 30, weight: 8 }),
    ],
  },
  {
    name: "40GP · bales + bags on top",
    container: C40,
    items: [
      makeItem({ id: "bale", qty: 40, length: 100, width: 80, height: 60, weight: 50, packageType: "bale" }),
      makeItem({ id: "bag", qty: 30, length: 90, width: 60, height: 30, weight: 25, packageType: "bag" }),
    ],
  },
  {
    name: "40HC · tall pallet stack",
    container: HC,
    items: [
      makeItem({ id: "pal", qty: 22, length: 120, width: 100, height: 120, weight: 400, packageType: "pallet", allowSidewaysRotation: false }),
    ],
  },
  {
    name: "40HC · crates + drums + non-stackable",
    container: HC,
    items: [
      makeItem({ id: "crate", qty: 18, length: 110, width: 90, height: 100, weight: 220, packageType: "crate", allowSidewaysRotation: false }),
      makeItem({ id: "drum", qty: 14, length: 60, width: 60, height: 90, weight: 80, packageType: "drum", allowAxisRotation: false }),
      makeItem({ id: "ns", qty: 8, length: 80, width: 60, height: 70, weight: 90, stackable: false }),
    ],
  },
  {
    name: "40HC · oversized cubes",
    container: HC,
    items: [
      makeItem({ id: "cube", qty: 8, length: 121.92, width: 121.92, height: 121.92, weight: 500 }),
    ],
  },
];

describe("walkthrough audit — revealed subset stays legal at every step", () => {
  for (const scenario of matrix) {
    it(scenario.name, () => {
      const { best } = pickBestPlan(scenario.items, scenario.container);
      const pack = best.pack;
      // Skip if packer placed nothing (e.g. shut-out edge case).
      if (pack.placed.length === 0) {
        expect(pack.placed.length).toBe(0);
        return;
      }
      const rows = buildRows(pack);
      const palletSequence = buildPalletSequence(pack, rows);
      expect(palletSequence.length).toBeGreaterThan(0);

      // Walk every revealed step. For each, the visible subset must be legal.
      const failures: Array<{ step: number; codes: string[] }> = [];
      for (let k = 0; k < palletSequence.length; k++) {
        const visible = visibleAtStep(pack, palletSequence, k);
        const audit = validateAdvancedPackSubset(pack, visible);
        // Only OVERLAP / NEIGHBOUR_GAP / FLOATING are walkthrough-critical.
        // (Door / ceiling / wall reserves are container-edge rules and apply
        // to the final state — irrelevant for partial reveals.)
        const critical = audit.violations.filter((v) =>
          ["OVERLAP", "NEIGHBOUR_GAP", "FLOATING"].includes(v.code),
        );
        if (critical.length > 0) {
          failures.push({ step: k, codes: critical.map((v) => v.code) });
        }
      }

      if (failures.length > 0) {
        const summary = failures
          .slice(0, 5)
          .map((f) => `step ${f.step + 1}: ${f.codes.join(", ")}`)
          .join(" · ");
        throw new Error(
          `Walkthrough produced ${failures.length} illegal frame(s): ${summary}`,
        );
      }
      expect(failures.length).toBe(0);
    });
  }
});
