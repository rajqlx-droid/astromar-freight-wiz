import { validatePackGeometry } from "./src/lib/freight/geometry-validator";
import { CONTAINERS } from "./src/lib/freight/packing";
const HC = CONTAINERS.find(c => c.id === "40hc")!;
const placed = [
  { x: 60, y: 60, z: 0, l: 1200, w: 1000, h: 1000, color: "#fff", itemIdx: 0, rotated: null },
  { x: 60, y: 60, z: 1000, l: 1200, w: 1000, h: 1000, color: "#fff", itemIdx: 0, rotated: null },
] as any;
const a = validatePackGeometry(placed, HC);
console.log(JSON.stringify(a, null, 2));
