/**
 * Build a `scenario.json` payload that the Remotion `loading-guide` composition
 * can consume to render a video for the user's *exact* current pack.
 *
 * Format mirrors `remotion/src/scenario-loader.ts`:
 *   { container: { name, inner:{l,w,h}, capCbm, maxPayloadKg }, rows: RowJson[] }
 *
 * where each `RowJson` matches the `Row` shape in `remotion/src/scenario-demo.ts`.
 *
 * Coordinates: origin = back-left-floor, x = length, y = width, z = height (mm).
 * Same convention as both the in-app 3D viewer and the Remotion scene.
 */

import type { AdvancedPackResult } from "./packing-advanced";
import { buildRows, DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD } from "./loading-rows";

export interface ScenarioJsonBox {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  color: string;
  fragile?: boolean;
  nonStack?: boolean;
  rotated?: boolean;
}

export interface ScenarioJsonRow {
  rowIdx: number;
  xStart: number;
  xEnd: number;
  boxes: ScenarioJsonBox[];
  totalWeightKg: number;
  totalCbm: number;
  hasFragile: boolean;
  hasNonStack: boolean;
  rotatedCount: number;
  layers: number;
  wallUtilizationPct: number;
  gapWarning: boolean;
}

export interface ScenarioJson {
  container: {
    name: string;
    inner: { l: number; w: number; h: number };
    capCbm: number;
    maxPayloadKg: number;
  };
  rows: ScenarioJsonRow[];
}

/**
 * Build the scenario JSON from the active pack.
 *
 * `getItemFlags` maps an `itemIdx` to the flags the Remotion video cares about
 * (fragile / nonStack). When the caller doesn't know, returning `{}` is fine —
 * the video falls back to plain cartons.
 */
export function buildScenarioJson(
  pack: AdvancedPackResult,
  getItemFlags?: (itemIdx: number) => { fragile?: boolean; nonStack?: boolean },
): ScenarioJson {
  const rows = buildRows(pack, DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD);
  // Approx kg per box derived from the row's totalWeight / box count.
  const rowKgPerBox = new Map<number, number>();
  for (const r of rows) {
    rowKgPerBox.set(r.rowIdx, r.boxes.length > 0 ? r.totalWeightKg / r.boxes.length : 0);
  }
  return {
    container: {
      name: pack.container.name,
      inner: pack.container.inner,
      capCbm: pack.container.capCbm,
      maxPayloadKg: pack.container.maxPayloadKg,
    },
    rows: rows.map((r) => {
      const boxes: ScenarioJsonBox[] = r.boxes.map((b) => {
        const flags = getItemFlags?.(b.itemIdx) ?? {};
        return {
          x: Math.round(b.x),
          y: Math.round(b.y),
          z: Math.round(b.z),
          l: Math.round(b.l),
          w: Math.round(b.w),
          h: Math.round(b.h),
          color: b.color,
          fragile: flags.fragile,
          nonStack: flags.nonStack,
          rotated: b.rotated != null,
        };
      });
      return {
        rowIdx: r.rowIdx,
        xStart: Math.round(r.xStart),
        xEnd: Math.round(r.xEnd),
        boxes,
        totalWeightKg: Math.round(r.totalWeightKg),
        totalCbm: Number(r.totalCbm.toFixed(4)),
        hasFragile: r.hasFragile,
        hasNonStack: r.hasNonStack,
        rotatedCount: r.rotatedCount,
        layers: r.layers,
        wallUtilizationPct: Number(r.wallUtilizationPct.toFixed(2)),
        gapWarning: r.gapWarning,
      };
    }),
  };
}

/** Trigger a browser download of the JSON payload. */
export function downloadScenarioJson(payload: ScenarioJson, filename = "scenario.json"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
