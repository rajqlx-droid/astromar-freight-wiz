/**
 * Advanced container packing — support-aware skyline packer.
 *
 * Replaces the old shelf-fit cursor algorithm. Maintains a quantised
 * height-map of the container floor and rests every new box on the actual
 * top-Z of cells under its footprint, which eliminates floating boxes.
 *
 * Honours per-item flags:
 *  - stackable / fragile / maxStackWeightKg
 *  - allowSidewaysRotation (swap L↔W)
 *  - allowAxisRotation     (tip onto side, swap H with L or W)
 *
 * Pure JS, deterministic, SSR-safe. No dependencies.
 */

import type { CbmItem, PackageType } from "./calculators";
import { CONTAINERS, ITEM_COLORS, type ContainerPreset, type PlacedBox } from "./packing";
import { getGapRule, DOOR_RESERVE_MM, CEILING_RESERVE_MM } from "./gap-rules";

export interface ItemPlacementStat {
  itemIdx: number;
  itemId: string;
  packageType: PackageType;
  color: string;
  planned: number;
  placed: number;
  unplaced: number;
  reason?: string;
  stackable: boolean;
  fragile: boolean;
  /** Weight per individual package (kg) — used by row-grouping to flag mixed pallets. */
  weightKgPerPkg: number;
}

/** Sort hint that biases which cartons the packer tries first. */
export type PackStrategy = "auto" | "row-back" | "weight-first" | "floor-first" | "mixed";

export interface AdvancedPackResult {
  container: ContainerPreset;
  placed: PlacedBox[];
  /**
   * Support ratio (0..1) recorded at placement time for each `placed[i]`.
   * 1 = floor or fully-supported stack, <0.85 only ever appears in degraded
   * scenarios (won't occur with the current SUPPORT_MIN_RATIO gate).
   * Used by the 3D debug overlay to colour-code stacking decisions.
   */
  supportRatios: number[];
  totalCartons: number;
  placedCartons: number;
  truncated: boolean;
  /** Total CBM of every carton in the manifest (placed + unplaced). */
  cargoCbm: number;
  /** CBM of placed cartons only — used for utilization. */
  placedCargoCbm: number;
  weightKg: number;
  /** Placed cargo weight only (kg). */
  placedWeightKg: number;
  /** placedCargoCbm / capCbm × 100, capped at 100. */
  utilizationPct: number;
  weightUtilizationPct: number;
  perItem: ItemPlacementStat[];
  /** -1..1 along container length. 0 = centered, +ve = forward (door side). */
  cogOffsetPct: number;
  /** CBM of the axis-aligned bounding box of all placed boxes (m³). */
  usedCbm: number;
  /** placedCargoCbm / usedCbm × 100 — packing density inside the occupied volume. */
  densityPct: number;
  cogLateralOffsetPct: number;
  nearCeilingPlacedIdxs: number[];
  floorCoveragePct: number;
  /**
   * Diagnostics about cartons the packer wanted to stack but rejected because
   * a stacking rule fired. Drives the user-facing "stacking reduced" warning.
   * `count` is the number of carton instances rejected for stacking reasons
   * (these may still have placed on the floor of a later container, or been
   * counted as unplaced — the field describes packing behaviour, not the
   * final placement outcome).
   */
  stackingDiagnostics: {
    /** Total candidate placements rejected by a stacking rule. */
    rejectedAttempts: number;
    /** Cartons that ended up unplaced AND failed at least one stacking rule. */
    unplacedDueToStacking: number;
    /** Per-rule rejection counts. Same keys as `dominantReason`. */
    reasonCounts: {
      support: number;
      sealed: number;
      stackWeight: number;
      nonStackable: number;
    };
    /**
     * The rule that triggered most often — drives the warning copy.
     * `null` when no stacking rule fired.
     */
    dominantReason: "support" | "sealed" | "stackWeight" | "nonStackable" | null;
  };
}

const RENDER_CAP = 500;
const CELL_MM = 100; // 10cm grid — good resolution vs. perf
// Support threshold lowered to 0.85 as a defensive backstop. The primary fix
// is geometric overlap (see evaluatePlacement) which removes the cell-grid
// quantization penalty that previously blocked stacking of identical cartons
// whose dimensions weren't a multiple of CELL_MM (e.g. 1219.2 mm cubes).
const SUPPORT_MIN_RATIO = 0.85;
const PLACE_STEP_MM = 50; // candidate XY scan stride (finer = tighter packing)

interface ExpandedCarton {
  /** Original (un-rotated) dimensions in mm. */
  origL: number;
  origW: number;
  origH: number;
  weight: number;
  itemIdx: number;
  itemId: string;
  packageType: PackageType;
  stackable: boolean;
  fragile: boolean;
  maxStackWeightKg: number;
  allowSidewaysRotation: boolean;
  allowAxisRotation: boolean;
}

interface Orientation {
  l: number;
  w: number;
  h: number;
}

function buildOrientations(c: ExpandedCarton): Orientation[] {
  const { origL: l, origW: w, origH: h } = c;
  const list: Orientation[] = [{ l, w, h }];
  if (c.allowSidewaysRotation && (l !== w)) list.push({ l: w, w: l, h });
  if (c.allowAxisRotation && !c.fragile) {
    if (h !== w) list.push({ l, w: h, h: w });
    if (h !== l) list.push({ l: h, w, h: l });
    if (c.allowSidewaysRotation) {
      if (h !== l) list.push({ l: w, w: h, h: l });
      if (h !== w) list.push({ l: h, w: l, h: w });
    }
  }
  return list;
}

interface PlacedInternal extends PlacedBox {
  weight: number;
  fragile: boolean;
  maxStackWeightKg: number;
  /** Cumulative weight currently sitting on top of this box. */
  loadKg: number;
  /** True if a fragile box is on top — nothing more may be stacked on this column. */
  sealed: boolean;
}

export function packContainerAdvanced(
  items: CbmItem[],
  container: ContainerPreset,
  strategy: PackStrategy = "auto",
): AdvancedPackResult {
  const C = container.inner;

  const expanded: ExpandedCarton[] = [];
  let cargoCbm = 0;
  let totalWeight = 0;

  const perItemPlanned: number[] = items.map(() => 0);
  const perItemPlaced: number[] = items.map(() => 0);
  const perItemReason: (string | undefined)[] = items.map(() => undefined);

  items.forEach((it, idx) => {
    if (it.length <= 0 || it.width <= 0 || it.height <= 0 || it.qty <= 0) return;
    const lmm = it.length * 10;
    const wmm = it.width * 10;
    const hmm = it.height * 10;
    perItemPlanned[idx] = it.qty;
    cargoCbm += ((it.length * it.width * it.height) / 1_000_000) * it.qty;
    totalWeight += it.weight * it.qty;

    const stackable = it.stackable !== false;
    const fragile = it.fragile === true;
    // Crates and pallets ship in fixed orientation — never tip onto a side.
    // Pallets keep L↔W (4-way entry forklift), crates also keep L↔W.
    const isRigidUnit = it.packageType === "crate" || it.packageType === "pallet";
    const allowSideways = isRigidUnit ? true : (it.allowSidewaysRotation !== false);
    const allowAxis = isRigidUnit ? false : (it.allowAxisRotation === true);

    for (let i = 0; i < it.qty; i++) {
      expanded.push({
        origL: lmm,
        origW: wmm,
        origH: hmm,
        weight: it.weight,
        itemIdx: idx,
        itemId: it.id,
        packageType: it.packageType ?? "carton",
        stackable,
        fragile,
        maxStackWeightKg: it.maxStackWeightKg ?? 0,
        allowSidewaysRotation: allowSideways,
        allowAxisRotation: allowAxis,
      });
    }
  });

  // Strategy-aware sort. Fragile always last (top). Non-stackable always before
  // stackable so they secure floor space. Within those buckets the strategy
  // hint chooses the primary key.
  const vol = (c: ExpandedCarton) => c.origL * c.origW * c.origH;
  const floor = (c: ExpandedCarton) => c.origL * c.origW;
  expanded.sort((a, b) => {
    if (a.fragile !== b.fragile) return a.fragile ? 1 : -1;
    if (a.stackable !== b.stackable) return a.stackable ? 1 : -1;
    switch (strategy) {
      case "weight-first":
        if (b.weight !== a.weight) return b.weight - a.weight;
        return vol(b) - vol(a);
      case "floor-first":
        if (floor(b) !== floor(a)) return floor(b) - floor(a);
        return b.weight - a.weight;
      case "mixed":
        // Largest volume first, weight as tiebreak — natural loader behaviour.
        if (vol(b) !== vol(a)) return vol(b) - vol(a);
        return b.weight - a.weight;
      case "row-back":
        // Group by item so identical SKUs form full rows back-to-front.
        if (a.itemIdx !== b.itemIdx) return a.itemIdx - b.itemIdx;
        return vol(b) - vol(a);
      case "auto":
      default:
        if (b.weight !== a.weight) return b.weight - a.weight;
        return vol(b) - vol(a);
    }
  });

  // Skyline grid (top-Z per cell, in mm).
  const cellsX = Math.ceil(C.l / CELL_MM);
  const cellsY = Math.ceil(C.w / CELL_MM);
  const heightMap = new Float32Array(cellsX * cellsY);
  // Index of placed box currently topping each cell (-1 = floor).
  const topBoxIdx = new Int32Array(cellsX * cellsY).fill(-1);
  // Cells under a fragile or fragile-supported column are sealed.
  const sealed = new Uint8Array(cellsX * cellsY);

  const placeStep = expanded.length > 30 ? 100 : PLACE_STEP_MM;
  const maxItemLen = expanded.reduce((m, c) => Math.max(m, c.origL, c.origW, c.origH), 0);
  let frontierX = 0;

  const placedInternal: PlacedInternal[] = [];
  const placedSupportRatios: number[] = [];
  let placedCount = 0;
  let truncated = false;

  // Stacking diagnostics — counts how often each rule rejected a candidate
  // placement during the search. Used to surface a user-facing warning
  // explaining why stacking was reduced.
  const stackingReasonCounts = {
    support: 0,
    sealed: 0,
    stackWeight: 0,
    nonStackable: 0,
  };
  let totalStackingRejections = 0;
  // For each carton currently being placed, remember the dominant stacking
  // rule that fired during its scan. If the carton ends up unplaced, this
  // tells us which rule (if any) cost it a placement.
  let unplacedDueToStacking = 0;

  const cellIdx = (cx: number, cy: number) => cy * cellsX + cx;

  /**
   * Inspect cells under footprint at (x,y) with size (l,w). Returns null if invalid.
   *
   * IMPORTANT — exact-footprint sampling: the height-map is sampled on a
   * coarse 100mm grid, but we only count a cell if its CENTER lies inside
   * the candidate footprint. This stops the previous Math.ceil expansion
   * from sampling cells up to 99mm beyond the box's real edges, which was
   * pulling neighbouring tall stacks into topZ and producing real floating
   * cargo (1066.8mm cubes were the canonical victim).
   *
   * For sub-grid footprints (smaller than 1.5 × CELL_MM on either axis) the
   * grid can entirely miss the box, so we fall back to a geometric supporter
   * scan over placedInternal — guaranteed accurate regardless of cell size.
   */
  function evaluatePlacement(
    x: number,
    y: number,
    l: number,
    w: number,
    c: ExpandedCarton,
  ): {
    z: number;
    supportRatio: number;
    supporters: Set<number>;
    anySealed: boolean;
  } | null {
    if (x < 0 || y < 0 || x + l > C.l || y + w > C.w) return null;

    const cx0 = Math.floor(x / CELL_MM);
    const cy0 = Math.floor(y / CELL_MM);
    const cx1 = Math.min(cellsX, Math.ceil((x + l) / CELL_MM));
    const cy1 = Math.min(cellsY, Math.ceil((y + w) / CELL_MM));

    const useGeometricScan = l < CELL_MM * 1.5 || w < CELL_MM * 1.5;

    let topZ = 0;
    let anySealed = false;
    const supporters = new Set<number>();

    if (useGeometricScan) {
      // Sub-grid: ignore height-map, scan placed boxes geometrically.
      for (let pi = 0; pi < placedInternal.length; pi++) {
        const p = placedInternal[pi];
        // XY footprint overlap?
        const ox = Math.min(x + l, p.x + p.l) - Math.max(x, p.x);
        const oy = Math.min(y + w, p.y + p.w) - Math.max(y, p.y);
        if (ox <= 0.5 || oy <= 0.5) continue;
        const top = p.z + p.h;
        if (top > topZ) topZ = top;
      }
      // Resolve sealing + supporters at topZ.
      for (let pi = 0; pi < placedInternal.length; pi++) {
        const p = placedInternal[pi];
        const ox = Math.min(x + l, p.x + p.l) - Math.max(x, p.x);
        const oy = Math.min(y + w, p.y + p.w) - Math.max(y, p.y);
        if (ox <= 0.5 || oy <= 0.5) continue;
        if (Math.abs(p.z + p.h - topZ) < 1) {
          supporters.add(pi);
          if (p.sealed) anySealed = true;
        }
      }
    } else {
      // Grid path: only count cells whose CENTRE lies inside the footprint.
      for (let cy = cy0; cy < cy1; cy++) {
        const cellMidY = cy * CELL_MM + CELL_MM / 2;
        if (cellMidY < y || cellMidY > y + w) continue;
        for (let cx = cx0; cx < cx1; cx++) {
          const cellMidX = cx * CELL_MM + CELL_MM / 2;
          if (cellMidX < x || cellMidX > x + l) continue;
          const idx = cellIdx(cx, cy);
          const h = heightMap[idx];
          if (h > topZ) topZ = h;
        }
      }
      // Second pass: collect supporters + sealed flag for cells at topZ.
      for (let cy = cy0; cy < cy1; cy++) {
        const cellMidY = cy * CELL_MM + CELL_MM / 2;
        if (cellMidY < y || cellMidY > y + w) continue;
        for (let cx = cx0; cx < cx1; cx++) {
          const cellMidX = cx * CELL_MM + CELL_MM / 2;
          if (cellMidX < x || cellMidX > x + l) continue;
          const idx = cellIdx(cx, cy);
          if (sealed[idx]) anySealed = true;
          const h = heightMap[idx];
          if (Math.abs(h - topZ) < 1) {
            const bIdx = topBoxIdx[idx];
            if (bIdx >= 0) supporters.add(bIdx);
          }
        }
      }
    }

    // Compute support ratio.
    let supportRatio: number;
    if (topZ === 0) {
      // Resting on the floor — fully supported by definition.
      supportRatio = 1;
    } else {
      const footprintArea = l * w;

      // Fast path: identical supporter directly below.
      if (supporters.size === 1) {
        const onlyIdx = supporters.values().next().value as number;
        const s = placedInternal[onlyIdx];
        if (
          s &&
          Math.abs(s.x - x) <= 10 &&
          Math.abs(s.y - y) <= 10 &&
          Math.abs(s.l - l) <= 10 &&
          Math.abs(s.w - w) <= 10
        ) {
          supportRatio = 1;
          return { z: topZ, supportRatio, supporters, anySealed };
        }
      }

      // General case: real geometric overlap area across all supporters
      // whose top face equals topZ.
      let overlapArea = 0;
      for (const sIdx of supporters) {
        const s = placedInternal[sIdx];
        if (!s) continue;
        if (Math.abs(s.z + s.h - topZ) > 1) continue;
        const ox0 = Math.max(x, s.x);
        const oy0 = Math.max(y, s.y);
        const ox1 = Math.min(x + l, s.x + s.l);
        const oy1 = Math.min(y + w, s.y + s.w);
        const dx = ox1 - ox0;
        const dy = oy1 - oy0;
        if (dx > 0 && dy > 0) overlapArea += dx * dy;
      }
      supportRatio = footprintArea > 0 ? Math.min(1, overlapArea / footprintArea) : 0;
    }

    return {
      z: topZ,
      supportRatio,
      supporters,
      anySealed,
    };
  }

  /**
   * Pre-commit airlock — runs the same hard-physical-rule subset the final
   * geometry validator uses, against the candidate placement plus the boxes
   * already in placedInternal. Returns true only if the placement would be
   * legal in the final audit. Anything failing here is rejected before the
   * commit so the validator can never see a floating / overlapping box.
   *
   * Lateral neighbour gap and side-wall gap are 0 (per gap-rules.ts). The
   * STRICT pairwise overlap test is the only thing preventing physical
   * intersection. _minGap is accepted but unused — kept for call-site compat.
   */
  function wouldBeLegal(
    x: number,
    y: number,
    z: number,
    l: number,
    w: number,
    h: number,
    _minGap: number,
  ): boolean {
    // Bounds.
    if (x < 0 || y < 0 || z < 0) return false;
    if (x + l > C.l + 0.5) return false;
    if (y + w > C.w + 0.5) return false;
    if (z + h > C.h + 0.5) return false;
    // Door / ceiling reserves are still enforced.
    if (C.l - (x + l) < DOOR_RESERVE_MM - 1) return false;
    if (C.h - (z + h) < CEILING_RESERVE_MM - 1) return false;

    // Geometric support check (against actual placed boxes, not the grid).
    if (z > 0.5) {
      const footArea = l * w;
      let overlapArea = 0;
      for (const p of placedInternal) {
        if (Math.abs(p.z + p.h - z) > 1) continue;
        const ox = Math.min(x + l, p.x + p.l) - Math.max(x, p.x);
        const oy = Math.min(y + w, p.y + p.w) - Math.max(y, p.y);
        if (ox > 0 && oy > 0) overlapArea += ox * oy;
      }
      const ratio = footArea > 0 ? overlapArea / footArea : 0;
      if (ratio < SUPPORT_MIN_RATIO) return false;
    }

    // STRICT pairwise overlap — touching faces (overlap = 0 on any axis)
    // is legal; any positive intersection on every axis is rejected.
    for (const p of placedInternal) {
      const ox = Math.min(x + l, p.x + p.l) - Math.max(x, p.x);
      const oy = Math.min(y + w, p.y + p.w) - Math.max(y, p.y);
      const oz = Math.min(z + h, p.z + p.h) - Math.max(z, p.z);
      if (ox > 0.5 && oy > 0.5 && oz > 0.5) return false;
    }
    return true;
  }

  // ── CoG-aware spread heuristic ─────────────────────────────────────────
  // When the cargo CBM fills less than 65 % of the container, jamming every
  // carton against the back wall puts the centre of gravity badly forward of
  // centre when more cartons are added later. In that regime we score
  // placements to spread them evenly along the usable container length and
  // bias the lateral position toward the centre line.
  const usableLengthMm = Math.max(1, C.l - DOOR_RESERVE_MM);
  const containerCapCbm = Math.max(0.001, container.capCbm);
  const volumeFill = cargoCbm / containerCapCbm;
  const spreadMode = volumeFill < 0.65;
  // Estimate how many cartons will land on the floor (1 layer). Used to
  // choose the stride for evenly-spaced target slots in spread mode.
  const avgFloorFootprintMm2 = expanded.length > 0
    ? expanded.reduce((s, c) => s + c.origL * c.origW, 0) / expanded.length
    : 1;
  const estFloorCount = Math.max(
    1,
    Math.min(expanded.length, Math.floor((C.l * C.w) / Math.max(1, avgFloorFootprintMm2))),
  );
  const spreadStrideMm = usableLengthMm / Math.max(1, Math.min(expanded.length, estFloorCount));
  let spreadCursor = 0; // increments per committed floor box in spread mode

  for (const c of expanded) {
    const orients = buildOrientations(c).filter(
      (o) => o.l <= C.l && o.w <= C.w && o.h <= C.h,
    );
    if (orients.length === 0) {
      perItemReason[c.itemIdx] ||= "Carton larger than container — won't fit any orientation";
      continue;
    }

    let bestScore = Infinity;
    let bestPick: {
      x: number;
      y: number;
      z: number;
      orient: Orientation;
      supporters: Set<number>;
      supportRatio: number;
    } | null = null;
    let lastReason: string | undefined;
    // Track stacking-rule rejections seen by THIS carton so we can attribute
    // an unplaced result to the most-frequent rule.
    const cartonRejects = { support: 0, sealed: 0, stackWeight: 0, nonStackable: 0 };

    for (const o of orients) {
      // Candidate XY positions on a coarse grid.
      const stepX = Math.min(placeStep, Math.max(25, Math.floor(o.l / 4)));
      const stepY = Math.min(placeStep, Math.max(25, Math.floor(o.w / 4)));
      // Frontier bound: back-to-front scoring guarantees no better placement
      // exists far past the furthest already-placed box. Limit X scan to
      // frontierX + 2 × maxBoxLen (clamped to container length).
      const xLimit = Math.min(C.l - o.l, frontierX + 2 * maxItemLen);
      for (let y = 0; y + o.w <= C.w; y += stepY) {
        for (let x = 0; x <= xLimit; x += stepX) {
          const ev = evaluatePlacement(x, y, o.l, o.w, {
            ...c,
            origL: o.l,
            origW: o.w,
            origH: o.h,
          });
          if (!ev) continue;

          if (x + o.l > C.l - DOOR_RESERVE_MM) continue;
          if (ev.z + o.h > C.h - CEILING_RESERVE_MM) continue;
          // Non-stackable must rest on the floor.
          if (!c.stackable && ev.z > 0) {
            lastReason ||= "Non-stackable — no floor space remaining";
            cartonRejects.nonStackable++;
            continue;
          }
          // Sealed (fragile) cells block further stacking.
          if (ev.anySealed) {
            lastReason ||= "Cannot stack on fragile item below";
            cartonRejects.sealed++;
            continue;
          }
          // Support ratio.
          if (ev.z > 0 && ev.supportRatio < SUPPORT_MIN_RATIO) {
            lastReason ||= "Insufficient support below";
            cartonRejects.support++;
            continue;
          }
          // Stack-weight: every supporter must be able to take +c.weight on top of its existing load.
          let weightOk = true;
          for (const sIdx of ev.supporters) {
            const s = placedInternal[sIdx];
            if (!s) continue;
            if (s.maxStackWeightKg > 0 && s.loadKg + c.weight > s.maxStackWeightKg) {
              weightOk = false;
              lastReason ||= "Exceeds max stack weight of item below";
              cartonRejects.stackWeight++;
              break;
            }
          }
          if (!weightOk) continue;

          // Lateral neighbour gap and side-wall gap are 0 — flush packing
          // is legal. The pre-commit airlock (wouldBeLegal, below) is the
          // only gate against actual physical overlap.

          // Score:
          //  - Tight mode (default, container is well-filled): back-to-front
          //    row-wise loading. X dominates so each row finishes against
          //    the back wall before the next row advances forward.
          //  - Spread mode (container under 65 % full): place each new
          //    floor-level carton near its evenly-spaced target slot along
          //    the length, and bias the lateral position to the centre line.
          //    This keeps the centre of gravity balanced when the load is
          //    light enough that we don't need every centimetre.
          let score: number;
          if (spreadMode && ev.z === 0) {
            const targetX = Math.min(usableLengthMm - o.l, spreadCursor * spreadStrideMm);
            const yCentreOffset = Math.abs((y + o.w / 2) - C.w / 2);
            score =
              Math.abs(x - targetX) * 100 +
              ev.z * 1_000 +
              yCentreOffset * 0.5 +
              (1 - ev.supportRatio) * 50;
          } else {
            // Tight mode — original back-to-front scoring. Coefficients chosen
            // so a 100 mm advance in x always outweighs the tallest possible
            // stack progression at the same x.
            score = x * 10_000 + ev.z * 100 + y * 0.1 + (1 - ev.supportRatio) * 50;
          }
          if (score < bestScore) {
            bestScore = score;
            bestPick = { x, y, z: ev.z, orient: o, supporters: ev.supporters, supportRatio: ev.supportRatio };
          }
        }
      }
    }

    // Roll up this carton's stacking-rule rejections into the global counters
    // BEFORE deciding whether to bail out so warnings stay accurate even when
    // most rejections eventually find a non-stacked floor placement instead.
    stackingReasonCounts.support += cartonRejects.support;
    stackingReasonCounts.sealed += cartonRejects.sealed;
    stackingReasonCounts.stackWeight += cartonRejects.stackWeight;
    stackingReasonCounts.nonStackable += cartonRejects.nonStackable;
    const cartonRejectTotal =
      cartonRejects.support +
      cartonRejects.sealed +
      cartonRejects.stackWeight +
      cartonRejects.nonStackable;
    totalStackingRejections += cartonRejectTotal;

    if (!bestPick) {
      perItemReason[c.itemIdx] ||= lastReason || "Container full";
      // If at least one stacking rule fired during this carton's scan, charge
      // the unplaced result to stacking. (A "container full" miss with zero
      // stacking rejections is genuine capacity exhaustion.)
      if (cartonRejectTotal > 0) unplacedDueToStacking++;
      continue;
    }

    // Snap-to-neighbour: slide the chosen placement toward -X (back wall) then
    // -Y (left wall) to close any sub-stride gap left by the coarse scan.
    // No lateral or wall-gap rules apply (gap-rules.ts: minGap = wallMin = 0);
    // the only rejection criterion is strict physical overlap with a placed
    // box. In spread mode we DISABLE the X-snap so deliberate spacing is
    // preserved — Y-snap still hugs the left wall (or centre, depending on
    // the chosen y) which is fine for balance.
    const snapAxis = (axis: "x" | "y") => {
      const tryAt = (nx: number, ny: number) => {
        const ev = evaluatePlacement(nx, ny, bestPick!.orient.l, bestPick!.orient.w, {
          ...c,
          origL: bestPick!.orient.l,
          origW: bestPick!.orient.w,
          origH: bestPick!.orient.h,
        });
        if (!ev) return null;
        if (Math.abs(ev.z - bestPick!.z) > 0.5) return null; // resting plane must match
        if (ev.anySealed) return null;
        if (ev.z + bestPick!.orient.h > C.h) return null;
        if (!c.stackable && ev.z > 0) return null;
        if (ev.z > 0 && ev.supportRatio < SUPPORT_MIN_RATIO) return null;
        for (const sIdx of ev.supporters) {
          const s = placedInternal[sIdx];
          if (!s) continue;
          if (s.maxStackWeightKg > 0 && s.loadKg + c.weight > s.maxStackWeightKg) {
            return null;
          }
        }
        // Strict overlap rejection — flush is fine, intersection is not.
        const ol = bestPick!.orient.l;
        const ow = bestPick!.orient.w;
        const oh = bestPick!.orient.h;
        for (const pb of placedInternal) {
          if (pb.x + pb.l <= nx || nx + ol <= pb.x) continue;
          if (pb.y + pb.w <= ny || ny + ow <= pb.y) continue;
          const zOv = ev.z < pb.z + pb.h && ev.z + oh > pb.z;
          if (zOv) {
            const ox = Math.min(nx + ol, pb.x + pb.l) - Math.max(nx, pb.x);
            const oy = Math.min(ny + ow, pb.y + pb.w) - Math.max(ny, pb.y);
            if (ox > 0.5 && oy > 0.5) return null;
          }
        }
        return ev;
      };

      // Coarse 10mm slide.
      const COARSE = 10;
      while (true) {
        const cur = axis === "x" ? bestPick!.x : bestPick!.y;
        if (cur <= 0) break;
        const next = Math.max(0, cur - COARSE);
        const nx = axis === "x" ? next : bestPick!.x;
        const ny = axis === "y" ? next : bestPick!.y;
        const ev = tryAt(nx, ny);
        if (!ev) break;
        bestPick!.x = nx;
        bestPick!.y = ny;
        bestPick!.supporters = ev.supporters;
        bestPick!.supportRatio = ev.supportRatio;
      }
      // Fine 1mm slide for the last sub-coarse gap.
      for (let i = 0; i < COARSE; i++) {
        const cur = axis === "x" ? bestPick!.x : bestPick!.y;
        if (cur <= 0) break;
        const next = cur - 1;
        const nx = axis === "x" ? next : bestPick!.x;
        const ny = axis === "y" ? next : bestPick!.y;
        const ev = tryAt(nx, ny);
        if (!ev) break;
        bestPick!.x = nx;
        bestPick!.y = ny;
        bestPick!.supporters = ev.supporters;
        bestPick!.supportRatio = ev.supportRatio;
      }
    };
    // In spread mode, X-snap would undo the deliberate longitudinal spacing.
    if (!spreadMode) snapAxis("x");
    snapAxis("y");

    // Z-snap: re-evaluate the resting plane after the XY snaps. If a shorter
    // neighbour now sits under the box, drop the box onto it. Closes the
    // sub-stride vertical gaps that produce the "floating cargo" artifact.
    {
      const ev = evaluatePlacement(bestPick.x, bestPick.y, bestPick.orient.l, bestPick.orient.w, {
        ...c,
        origL: bestPick.orient.l,
        origW: bestPick.orient.w,
        origH: bestPick.orient.h,
      });
      if (ev && ev.z < bestPick.z - 0.5 && !ev.anySealed) {
        // Lower the box. Only allow if support, sealing and stack-weight still pass.
        if (ev.z === 0 || (ev.supportRatio >= SUPPORT_MIN_RATIO && c.stackable)) {
          let weightOk = true;
          for (const sIdx of ev.supporters) {
            const s = placedInternal[sIdx];
            if (!s) continue;
            if (s.maxStackWeightKg > 0 && s.loadKg + c.weight > s.maxStackWeightKg) {
              weightOk = false;
              break;
            }
          }
          if (weightOk) {
            bestPick.z = ev.z;
            bestPick.supporters = ev.supporters;
            bestPick.supportRatio = ev.supportRatio;
          }
        }
      }
    }

    const { x, y, z, orient, supporters, supportRatio } = bestPick;

    // ── Final airlock: pre-commit geometry guard ────────────────────────
    // Even after evaluatePlacement, snap, and z-snap, run the canonical
    // legality check against placedInternal. If the candidate would be
    // floating, overlapping, or crowding a neighbour the validator will
    // catch in the final audit, REJECT IT NOW so the produced pack is
    // guaranteed legal. This is the single airlock that closes the loop
    // between the packer's grid heuristic and the validator's geometric truth.
    {
      const guardGap = getGapRule(c.packageType).minGap;
      if (!wouldBeLegal(x, y, z, orient.l, orient.w, orient.h, guardGap)) {
        perItemReason[c.itemIdx] ||= "Geometry guard rejected (would float / overlap / crowd neighbour)";
        unplacedDueToStacking++;
        stackingReasonCounts.support++; // attribute to support bucket for HUD copy
        continue;
      }
    }

    const internalIdx = placedInternal.length;

    // Detect rotation vs original dimensions.
    let rotated: "sideways" | "axis" | null = null;
    if (orient.h !== c.origH) {
      rotated = "axis"; // tipped — height swapped with L or W
    } else if (orient.l !== c.origL || orient.w !== c.origW) {
      rotated = "sideways"; // L↔W swap
    }

    const box: PlacedInternal = {
      x,
      y,
      z,
      l: orient.l,
      w: orient.w,
      h: orient.h,
      color: ITEM_COLORS[c.itemIdx % ITEM_COLORS.length],
      itemIdx: c.itemIdx,
      rotated,
      weight: c.weight,
      fragile: c.fragile,
      maxStackWeightKg: c.maxStackWeightKg,
      loadKg: 0,
      sealed: false,
    };
    placedInternal.push(box);
    // Floor placements are inherently fully supported. Stacked placements
    // record the geometric overlap ratio captured at the chosen position.
    placedSupportRatios.push(z === 0 ? 1 : supportRatio);

    // Update supporter loads.
    for (const sIdx of supporters) {
      const s = placedInternal[sIdx];
      if (s) s.loadKg += c.weight;
    }

    // Update height-map and topBoxIdx for footprint.
    // Same exact-footprint rule as evaluatePlacement: only write to a cell
    // when its CENTRE is inside the placed box. Without this guard the
    // ceil() expansion would paint a 100mm "halo" around every box, inflating
    // the topZ seen by the next placement and re-introducing floating cargo.
    const cx0 = Math.floor(x / CELL_MM);
    const cy0 = Math.floor(y / CELL_MM);
    const cx1 = Math.min(cellsX, Math.ceil((x + orient.l) / CELL_MM));
    const cy1 = Math.min(cellsY, Math.ceil((y + orient.w) / CELL_MM));
    const newTop = z + orient.h;
    for (let cy = cy0; cy < cy1; cy++) {
      const cellMidY = cy * CELL_MM + CELL_MM / 2;
      if (cellMidY < y || cellMidY > y + orient.w) continue;
      for (let cx = cx0; cx < cx1; cx++) {
        const cellMidX = cx * CELL_MM + CELL_MM / 2;
        if (cellMidX < x || cellMidX > x + orient.l) continue;
        const idx = cellIdx(cx, cy);
        heightMap[idx] = newTop;
        topBoxIdx[idx] = internalIdx;
        if (c.fragile) sealed[idx] = 1;
      }
    }

    placedCount++;
    perItemPlaced[c.itemIdx]++;
    if (x + orient.l > frontierX) frontierX = x + orient.l;
  }

  // Render-cap truncation (rare with skyline since we score; just in case).
  const toPlaced = (p: PlacedInternal): PlacedBox => ({
    x: p.x, y: p.y, z: p.z, l: p.l, w: p.w, h: p.h,
    color: p.color, itemIdx: p.itemIdx, rotated: p.rotated ?? null,
  });
  let placed: PlacedBox[];
  let supportRatios: number[];
  if (placedInternal.length > RENDER_CAP) {
    truncated = true;
    placed = placedInternal.slice(0, RENDER_CAP).map(toPlaced);
    supportRatios = placedSupportRatios.slice(0, RENDER_CAP);
  } else {
    placed = placedInternal.map(toPlaced);
    supportRatios = placedSupportRatios.slice();
  }

  // COG along container length (X axis).
  let totWeight = 0;
  let weightedX = 0;
  for (const p of placed) {
    const w = items[p.itemIdx]?.weight ?? 0;
    const cx = p.x + p.l / 2;
    weightedX += cx * w;
    totWeight += w;
  }
  const cog = totWeight > 0 ? weightedX / totWeight : C.l / 2;
  const cogOffsetPct = (cog - C.l / 2) / (C.l / 2);
  let weightedY = 0;
  for (const p of placed) {
    weightedY += (p.y + p.w / 2) * (items[p.itemIdx]?.weight ?? 0);
  }
  const cogLateralOffsetPct = totWeight > 0 ? (weightedY / totWeight - C.w / 2) / (C.w / 2) : 0;

  const perItem: ItemPlacementStat[] = items.map((it, idx) => {
    const planned = perItemPlanned[idx];
    const placedN = perItemPlaced[idx];
    return {
      itemIdx: idx,
      itemId: it.id,
      packageType: it.packageType ?? "carton",
      color: ITEM_COLORS[idx % ITEM_COLORS.length],
      planned,
      placed: placedN,
      unplaced: Math.max(0, planned - placedN),
      reason: planned > 0 && placedN < planned ? perItemReason[idx] || "Container full" : undefined,
      stackable: it.stackable !== false,
      fragile: it.fragile === true,
      weightKgPerPkg: it.weight ?? 0,
    };
  });

  // Density: cargo CBM (placed boxes only) ÷ axis-aligned bounding-box CBM.
  // Tells the user how tightly the placed cargo is squeezed inside the
  // volume it actually occupies — independent of total container size.
  let placedCargoCbm = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of placed) {
    placedCargoCbm += (p.l * p.w * p.h) / 1_000_000_000;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x + p.l > maxX) maxX = p.x + p.l;
    if (p.y + p.w > maxY) maxY = p.y + p.w;
    if (p.z + p.h > maxZ) maxZ = p.z + p.h;
  }
  const usedCbm =
    placed.length > 0
      ? ((maxX - minX) * (maxY - minY) * (maxZ - minZ)) / 1_000_000_000
      : 0;
  const densityPct = usedCbm > 0 ? (placedCargoCbm / usedCbm) * 100 : 0;

  const nearCeilingPlacedIdxs: number[] = [];
  placed.forEach((p, i) => { if (p.z + p.h > C.h - CEILING_RESERVE_MM) nearCeilingPlacedIdxs.push(i); });
  const floorCoveredMm2 = placed.filter(p => p.z < 10).reduce((s, p) => s + p.l * p.w, 0);
  const floorCoveragePct = C.l * C.w > 0 ? Math.min(100, (floorCoveredMm2 / (C.l * C.w)) * 100) : 0;

  // Placed-only weight for honest utilization (matches placedCargoCbm).
  let placedWeightKg = 0;
  for (const p of placedInternal) placedWeightKg += p.weight;

  // Pick the rule that fired most often as the dominant cause.
  let dominantReason: AdvancedPackResult["stackingDiagnostics"]["dominantReason"] = null;
  {
    let bestN = 0;
    (Object.keys(stackingReasonCounts) as Array<keyof typeof stackingReasonCounts>).forEach(
      (k) => {
        if (stackingReasonCounts[k] > bestN) {
          bestN = stackingReasonCounts[k];
          dominantReason = k;
        }
      },
    );
  }

  return {
    container,
    placed,
    supportRatios,
    totalCartons: expanded.length,
    placedCartons: placedCount,
    truncated,
    cargoCbm,
    placedCargoCbm,
    weightKg: totalWeight,
    placedWeightKg,
    utilizationPct:
      container.capCbm > 0
        ? Math.min(100, (placedCargoCbm / container.capCbm) * 100)
        : 0,
    weightUtilizationPct:
      container.maxPayloadKg > 0
        ? Math.min(100, (placedWeightKg / container.maxPayloadKg) * 100)
        : 0,
    perItem,
    cogOffsetPct,
    usedCbm,
    densityPct,
    cogLateralOffsetPct,
    nearCeilingPlacedIdxs,
    floorCoveragePct,
    stackingDiagnostics: {
      rejectedAttempts: totalStackingRejections,
      unplacedDueToStacking,
      reasonCounts: { ...stackingReasonCounts },
      dominantReason,
    },
  };
}

export { CONTAINERS };
