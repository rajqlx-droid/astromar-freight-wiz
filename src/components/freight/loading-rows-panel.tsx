/**
 * Row-by-row loading guide.
 *
 * Groups the placed boxes into rows along the container length (x-axis),
 * back wall first. Each row card explains how a loader (standing outside
 * the container) should build that row from the floor up before advancing
 * to the next row toward the door.
 */
import { useMemo, useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import type { PlacedBox } from "@/lib/freight/packing";

interface Props {
  pack: AdvancedPackResult;
}

interface RowGroup {
  rowIdx: number;
  xStart: number; // mm
  xEnd: number; // mm
  boxes: PlacedBox[];
  totalWeightKg: number;
  totalCbm: number;
  hasFragile: boolean;
  hasNonStack: boolean;
  rotatedCount: number;
  layers: number; // number of distinct z-levels
}

/**
 * Group boxes by their x-range. Two boxes belong to the same row when their
 * x-spans overlap. Rows are ordered back-to-front (lowest x first).
 */
function buildRows(pack: AdvancedPackResult): RowGroup[] {
  if (pack.placed.length === 0) return [];

  // Sort by x ascending so we can sweep left-to-right.
  const sorted = [...pack.placed].sort((a, b) => a.x - b.x);

  const rows: { boxes: PlacedBox[]; xStart: number; xEnd: number }[] = [];
  for (const b of sorted) {
    const bxEnd = b.x + b.l;
    const last = rows[rows.length - 1];
    // Same row if this box overlaps the current row's x-range.
    if (last && b.x < last.xEnd - 1) {
      last.boxes.push(b);
      if (bxEnd > last.xEnd) last.xEnd = bxEnd;
    } else {
      rows.push({ boxes: [b], xStart: b.x, xEnd: bxEnd });
    }
  }

  return rows.map((r, i) => {
    let totalWeightKg = 0;
    let totalCbm = 0;
    let hasFragile = false;
    let hasNonStack = false;
    let rotatedCount = 0;
    const zLevels = new Set<number>();
    for (const b of r.boxes) {
      const stat = pack.perItem[b.itemIdx];
      const itemWeight = stat ? 0 : 0; // weight is per-box from items, captured below
      totalCbm += (b.l * b.w * b.h) / 1_000_000_000; // mm³ → m³
      // Use the per-item average weight (we don't store per-box weight on PlacedBox).
      const placedOfItem = pack.perItem[b.itemIdx]?.placed ?? 1;
      const itemTotal = pack.perItem[b.itemIdx];
      if (itemTotal && placedOfItem > 0) {
        const itemSliceWeight = (pack.weightKg * (placedOfItem / pack.placedCartons || 0)) / placedOfItem;
        totalWeightKg += itemSliceWeight;
      }
      if (stat?.fragile) hasFragile = true;
      if (stat && !stat.stackable) hasNonStack = true;
      if (b.rotated === "sideways" || b.rotated === "axis") rotatedCount++;
      zLevels.add(Math.round(b.z / 10) * 10);
      void itemWeight;
    }
    return {
      rowIdx: i,
      xStart: r.xStart,
      xEnd: r.xEnd,
      boxes: r.boxes,
      totalWeightKg,
      totalCbm,
      hasFragile,
      hasNonStack,
      rotatedCount,
      layers: zLevels.size,
    };
  });
}

/** Per-item count breakdown for a row (returns array of {itemIdx, count, color}). */
function itemCounts(row: RowGroup, pack: AdvancedPackResult) {
  const map = new Map<number, number>();
  for (const b of row.boxes) {
    map.set(b.itemIdx, (map.get(b.itemIdx) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([itemIdx, count]) => ({
      itemIdx,
      count,
      color: pack.perItem[itemIdx]?.color ?? "#888",
      packageType: pack.perItem[itemIdx]?.packageType ?? "carton",
    }));
}

function instructionFor(row: RowGroup): string {
  const parts: string[] = [];
  const total = row.boxes.length;
  if (row.layers > 1) {
    parts.push(`Push ${total} package${total > 1 ? "s" : ""} to back of row, build ${row.layers} layer${row.layers > 1 ? "s" : ""} bottom-up`);
  } else {
    parts.push(`Push ${total} package${total > 1 ? "s" : ""} flat against the back of this row`);
  }
  if (row.hasFragile) parts.push("cap with fragile units last");
  if (row.hasNonStack) parts.push("leave no-stack items uncovered");
  if (row.rotatedCount > 0) parts.push(`rotate ${row.rotatedCount} unit${row.rotatedCount > 1 ? "s" : ""} as marked in 3D view`);
  return parts.join(", ") + ".";
}

export function LoadingRowsPanel({ pack }: Props) {
  const rows = useMemo(() => buildRows(pack), [pack]);
  // First row open by default; others collapsed.
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set([0]));

  if (rows.length === 0) return null;

  const toggle = (idx: number) => {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div
      className="rounded-lg border-2"
      style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 18%, transparent)" }}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Layers className="size-4 text-brand-navy" />
        <span className="text-sm font-semibold text-brand-navy">
          Row-by-row loading guide
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          {rows.length} row{rows.length > 1 ? "s" : ""} · back to door
        </span>
      </div>

      <ol className="divide-y">
        {rows.map((row) => {
          const isOpen = openRows.has(row.rowIdx);
          const counts = itemCounts(row, pack);
          const xStartM = row.xStart / 1000;
          const xEndM = row.xEnd / 1000;
          return (
            <li key={row.rowIdx}>
              <button
                type="button"
                onClick={() => toggle(row.rowIdx)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[11px] font-bold text-white shadow">
                  R{row.rowIdx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5 text-xs">
                    <span className="font-semibold text-brand-navy">
                      Row {row.rowIdx + 1}
                    </span>
                    <span className="text-muted-foreground">
                      {xStartM.toFixed(2)}–{xEndM.toFixed(2)} m from rear wall
                    </span>
                    {row.hasFragile && (
                      <span className="rounded bg-amber-100 px-1 text-[9px] font-medium uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        fragile
                      </span>
                    )}
                    {row.hasNonStack && (
                      <span className="rounded bg-rose-100 px-1 text-[9px] font-medium uppercase text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        no-stack
                      </span>
                    )}
                    {row.rotatedCount > 0 && (
                      <span className="rounded bg-yellow-100 px-1 text-[9px] font-medium uppercase text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
                        ↻ {row.rotatedCount} tilted
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{row.boxes.length} pkg</span>
                    <span>·</span>
                    <span>{row.layers} layer{row.layers > 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{row.totalCbm.toFixed(2)} m³</span>
                    {row.totalWeightKg > 0 && (
                      <>
                        <span>·</span>
                        <span>
                          ~{row.totalWeightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {isOpen && (
                <div className="space-y-2 bg-muted/20 px-3 pb-3 pt-1">
                  {/* Item color chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {counts.map((c) => (
                      <div
                        key={c.itemIdx}
                        className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1 text-[11px] shadow-sm"
                      >
                        <span
                          className="size-2.5 rounded-sm"
                          style={{ background: c.color }}
                          aria-hidden
                        />
                        <span className="font-medium text-brand-navy">
                          Item {c.itemIdx + 1}
                        </span>
                        <span className="text-muted-foreground">
                          × {c.count} {c.packageType}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Instruction */}
                  <div className="rounded-md border-l-2 border-brand-orange bg-background px-2 py-1.5 text-[11px] leading-relaxed text-brand-navy">
                    <strong className="font-semibold">Loader:</strong>{" "}
                    {instructionFor(row)}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Always work from the back wall outward — never climb on loaded cargo. Build each row to its full height before starting the next row toward the door.
      </p>
    </div>
  );
}
