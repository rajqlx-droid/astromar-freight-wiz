import { packContainerAdvanced } from "./packing-advanced";
import { CONTAINERS } from "./packing";
import type { PlacedBox } from "./packing";
import type { ContainerPreset } from "./packing";
import { describe, it } from "vitest";

describe("debug", () => {
  it("dump", () => {
    const hc = CONTAINERS.find(c => c.id === "40hc")!;
    const r = packContainerAdvanced([{id:"x",length:121.92,width:121.92,height:121.92,qty:30,weight:500,packageType:"carton",stackable:true,fragile:false,allowSidewaysRotation:true,allowAxisRotation:false}], hc);
    console.log("placed:", r.placedCartons, "/", r.totalCartons);
    console.log("stacked count:", r.placed.filter(p=>p.z>10).length);
    console.log("zs:", [...new Set(r.placed.map(p=>Math.round(p.z)))]);
    console.log("diagnostics:", JSON.stringify(r.stackingDiagnostics));
  });
});
