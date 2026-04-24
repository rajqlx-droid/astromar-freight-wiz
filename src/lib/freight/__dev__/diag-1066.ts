/* eslint-disable no-console */
import { packContainerAdvanced } from "../packing-advanced";
import { CONTAINERS } from "../packing";

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

console.log("container inner mm:", hc.inner);
console.log("placed:", r.placedCartons, "/", r.totalCartons);
console.log("floorCoveragePct:", r.floorCoveragePct.toFixed(1));
console.log("usedCbm:", r.usedCbm.toFixed(2), "densityPct:", r.densityPct.toFixed(1));
console.log("\nplaced[i] = x, y, z, l, w, h (mm):");
r.placed.forEach((p, i) => {
  console.log(
    `  ${String(i).padStart(2, "0")}  x=${p.x.toFixed(0).padStart(6)}  y=${p.y.toFixed(0).padStart(5)}  z=${p.z.toFixed(0).padStart(5)}   l=${p.l.toFixed(0)}  w=${p.w.toFixed(0)}  h=${p.h.toFixed(0)}`,
  );
});

// Group by (rounded) x to see rows
const byX = new Map<number, number[]>();
r.placed.forEach((p, i) => {
  const key = Math.round(p.x / 10) * 10;
  if (!byX.has(key)) byX.set(key, []);
  byX.get(key)!.push(i);
});
console.log("\ncolumns by x (mm) → indices:");
[...byX.entries()].sort((a, b) => a[0] - b[0]).forEach(([x, idxs]) => {
  console.log(`  x≈${x}  count=${idxs.length}  idxs=${idxs.join(",")}`);
});

// Overlap check
let overlaps = 0;
for (let i = 0; i < r.placed.length; i++) {
  for (let j = i + 1; j < r.placed.length; j++) {
    const a = r.placed[i], b = r.placed[j];
    const xOv = a.x < b.x + b.l && a.x + a.l > b.x;
    const yOv = a.y < b.y + b.w && a.y + a.w > b.y;
    const zOv = a.z < b.z + b.h && a.z + a.h > b.z;
    if (xOv && yOv && zOv) {
      overlaps++;
      if (overlaps <= 5) console.log(`OVERLAP: ${i} ↔ ${j}`);
    }
  }
}
console.log(`\ntotal overlaps: ${overlaps}`);

// Floating check
let floating = 0;
for (let i = 0; i < r.placed.length; i++) {
  const p = r.placed[i];
  if (p.z < 1) continue;
  // is there a supporter under it whose top == p.z?
  const supported = r.placed.some((s, j) => {
    if (j === i) return false;
    if (Math.abs(s.z + s.h - p.z) > 1) return false;
    const xOv = p.x < s.x + s.l && p.x + p.l > s.x;
    const yOv = p.y < s.y + s.w && p.y + p.w > s.y;
    return xOv && yOv;
  });
  if (!supported) {
    floating++;
    if (floating <= 5) console.log(`FLOATING: idx=${i} at z=${p.z}`);
  }
}
console.log(`total floating (no supporter): ${floating}`);
