/* eslint-disable no-console */
import { describe, it } from "vitest";
import { packContainerAdvanced } from "../packing-advanced";
import { CONTAINERS } from "../packing";

describe("diag 1066.8 cubes × 40 in 40HC", () => {
  it("dump", () => {
    const hc = CONTAINERS.find((c) => c.id === "40hc")!;
    const r = packContainerAdvanced(
      [
        {
          id: "cube35ft",
          length: 106.68,
          width: 106.68,
          height: 106.68,
          qty: 40,
          weight: 200,
          packageType: "carton",
          stackable: true,
          fragile: false,
          allowSidewaysRotation: true,
          allowAxisRotation: false,
        },
      ],
      hc,
    );

    console.log("inner mm:", hc.inner);
    console.log("placed:", r.placedCartons, "/", r.totalCartons);
    console.log("floorCoveragePct:", r.floorCoveragePct.toFixed(1));
    console.log("usedCbm:", r.usedCbm.toFixed(2), "densityPct:", r.densityPct.toFixed(1));

    const lines = r.placed.map((p, i) =>
      `  ${String(i).padStart(2, "0")}  x=${p.x.toFixed(0).padStart(6)}  y=${p.y.toFixed(0).padStart(5)}  z=${p.z.toFixed(0).padStart(5)}   l=${p.l.toFixed(0)}  w=${p.w.toFixed(0)}  h=${p.h.toFixed(0)}`,
    );
    console.log("\nplaced:\n" + lines.join("\n"));

    const byX = new Map<number, number[]>();
    r.placed.forEach((p, i) => {
      const key = Math.round(p.x / 10) * 10;
      if (!byX.has(key)) byX.set(key, []);
      byX.get(key)!.push(i);
    });
    console.log("\ncolumns by x:");
    [...byX.entries()].sort((a, b) => a[0] - b[0]).forEach(([x, idxs]) => {
      const ys = idxs.map((i) => Math.round(r.placed[i].y)).join(",");
      const zs = idxs.map((i) => Math.round(r.placed[i].z)).join(",");
      console.log(`  x≈${x}  count=${idxs.length}  ys=[${ys}] zs=[${zs}]`);
    });

    let overlaps = 0;
    const overlapPairs: string[] = [];
    for (let i = 0; i < r.placed.length; i++) {
      for (let j = i + 1; j < r.placed.length; j++) {
        const a = r.placed[i], b = r.placed[j];
        const xOv = a.x < b.x + b.l && a.x + a.l > b.x;
        const yOv = a.y < b.y + b.w && a.y + a.w > b.y;
        const zOv = a.z < b.z + b.h && a.z + a.h > b.z;
        if (xOv && yOv && zOv) {
          overlaps++;
          if (overlapPairs.length < 5) overlapPairs.push(`${i}↔${j}`);
        }
      }
    }
    console.log(`\noverlaps: ${overlaps} ${overlapPairs.join(" ")}`);

    let floating = 0;
    for (let i = 0; i < r.placed.length; i++) {
      const p = r.placed[i];
      if (p.z < 1) continue;
      const supported = r.placed.some((s, j) => {
        if (j === i) return false;
        if (Math.abs(s.z + s.h - p.z) > 1) return false;
        const xOv = p.x < s.x + s.l && p.x + p.l > s.x;
        const yOv = p.y < s.y + s.w && p.y + p.w > s.y;
        return xOv && yOv;
      });
      if (!supported) floating++;
    }
    console.log(`floating boxes: ${floating}`);
  });
});
