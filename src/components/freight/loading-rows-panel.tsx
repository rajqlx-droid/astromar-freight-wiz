/**
 * Row-by-row loading guide.
 *
 * Groups the placed boxes into rows along the container length (x-axis),
 * back wall first. Each row card explains how a loader (standing outside
 * the container) should build that row from the floor up before advancing
 * to the next row toward the door.
 */
import { useMemo, useState } from "react";
import { ChevronDown, Layers, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import {
  buildRowSideViewSvg,
  buildRows,
  instructionFor,
  itemCountsForRow,
  type RowGroup,
} from "@/lib/freight/loading-rows";

interface Props {
  pack: AdvancedPackResult;
}

/** Per-item count breakdown for a row (returns array of {itemIdx, count, color}). */
function itemCounts(row: RowGroup, pack: AdvancedPackResult) {
  return itemCountsForRow(row, pack);
}

/**
 * Mini side-view of a single row — wraps the shared SVG builder so the panel,
 * print HTML, and PDF all render the exact same artwork.
 */
function RowSideView({ row, pack }: { row: RowGroup; pack: AdvancedPackResult }) {
  const svg = buildRowSideViewSvg(row, pack);
  return (
    <div
      className="row-side-view h-[90px] w-full max-w-[260px] overflow-hidden rounded border bg-background [&_svg]:h-full [&_svg]:w-full"
      // SVG is built from sanitised numeric data + theme constants — safe to inject.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
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

  const handlePrint = () => {
    const rowsHtml = rows
      .map((row) => {
        const counts = itemCounts(row, pack);
        const xStartM = (row.xStart / 1000).toFixed(2);
        const xEndM = (row.xEnd / 1000).toFixed(2);
        const badges: string[] = [];
        if (row.hasFragile) badges.push('<span class="badge fragile">FRAGILE</span>');
        if (row.hasNonStack) badges.push('<span class="badge nostack">NO-STACK</span>');
        if (row.needsSeparator)
          badges.push('<span class="badge mixed">⚠ MIXED PALLET</span>');
        if (row.rotatedCount > 0)
          badges.push(`<span class="badge tilt">↻ ${row.rotatedCount} TILTED</span>`);
        const itemsHtml = counts
          .map(
            (c) =>
              `<div class="chip"><span class="swatch" style="background:${c.color}"></span><strong>Item ${c.itemIdx + 1}</strong> × ${c.count} ${c.packageType}</div>`,
          )
          .join("");
        const wt =
          row.totalWeightKg > 0
            ? `· ~${row.totalWeightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg`
            : "";
        const sideSvg = buildRowSideViewSvg(row, pack, { width: 240, height: 96 });
        return `
          <li class="row">
            <div class="row-head">
              <span class="rnum">R${row.rowIdx + 1}</span>
              <div class="row-meta">
                <div class="row-title">Row ${row.rowIdx + 1} <span class="dim">— ${xStartM}–${xEndM} m from rear wall</span></div>
                <div class="row-sub">${row.boxes.length} pkg · ${row.layers} layer${row.layers > 1 ? "s" : ""} · ${row.totalCbm.toFixed(2)} m³ ${wt}</div>
              </div>
              <div class="badges">${badges.join(" ")}</div>
              <span class="check"></span>
            </div>
            <div class="row-body">
              <div class="row-body-grid">
                <div class="side-view">
                  <div class="side-view-label">Side view (looking down container)</div>
                  ${sideSvg}
                </div>
                <div class="row-body-text">
                  <div class="chips">${itemsHtml}</div>
                  ${row.needsSeparator ? '<div class="warn">⚠ Mixed pallet — insert a plywood/cardboard separator board between heavy non-fragile units and fragile units before stacking.</div>' : ""}
                  <div class="instruction"><strong>Loader:</strong> ${instructionFor(row)}</div>
                </div>
              </div>
            </div>
          </li>`;
      })
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>Loading Checklist — Row by Row</title>
      <style>
        @page { size: A4; margin: 16mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
        h1 { color: #1B3A6B; margin: 0 0 4px; font-size: 20px; }
        .sub { color: #666; font-size: 11px; margin-bottom: 14px; }
        .accent { height: 3px; background: #F97316; margin-bottom: 14px; }
        ol { list-style: none; padding: 0; margin: 0; }
        li.row { border: 1px solid #d6dde8; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; page-break-inside: avoid; }
        .row-head { display: flex; align-items: center; gap: 10px; }
        .rnum { width: 28px; height: 28px; border-radius: 999px; background: #1B3A6B; color: #fff; font-weight: 700; font-size: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .row-meta { flex: 1; min-width: 0; }
        .row-title { font-weight: 600; color: #1B3A6B; font-size: 13px; }
        .dim { color: #777; font-weight: 400; font-size: 11px; }
        .row-sub { color: #666; font-size: 10px; margin-top: 1px; }
        .badges { display: flex; gap: 4px; }
        .badge { font-size: 9px; padding: 2px 5px; border-radius: 3px; font-weight: 600; letter-spacing: 0.3px; }
        .badge.fragile { background: #fef3c7; color: #92400e; }
        .badge.nostack { background: #ffe4e6; color: #9f1239; }
        .badge.tilt { background: #fef9c3; color: #854d0e; }
        .check { width: 18px; height: 18px; border: 1.5px solid #1B3A6B; border-radius: 4px; flex-shrink: 0; }
        .row-body { margin-top: 8px; padding-left: 38px; }
        .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
        .chip { display: inline-flex; align-items: center; gap: 5px; background: #f4f6fa; padding: 3px 7px; border-radius: 4px; font-size: 10px; }
        .swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
        .instruction { border-left: 2px solid #F97316; padding: 4px 8px; background: #fafbfd; font-size: 11px; color: #1B3A6B; border-radius: 0 4px 4px 0; }
        .row-body-grid { display: grid; grid-template-columns: 240px 1fr; gap: 12px; align-items: start; }
        .side-view { display: flex; flex-direction: column; gap: 3px; }
        .side-view svg { display: block; width: 100%; height: auto; border: 1px solid #d6dde8; border-radius: 4px; background: #fff; }
        .side-view-label { font-size: 8px; font-weight: 600; color: #777; letter-spacing: 0.4px; text-transform: uppercase; }
        .row-body-text { display: flex; flex-direction: column; gap: 6px; }
        .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #d6dde8; color: #777; font-size: 9px; }
      </style></head><body>
      <h1>Loading Checklist — Row by Row</h1>
      <div class="sub">${rows.length} row${rows.length > 1 ? "s" : ""} · back wall to door · generated ${new Date().toLocaleString("en-IN")}</div>
      <div class="accent"></div>
      <ol>${rowsHtml}</ol>
      <div class="footer">Always work from the back wall outward — never climb on loaded cargo. Build each row to full height before advancing toward the door. Tick the box once a row is fully loaded and verified.</div>
      <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });</script>
      </body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className="ml-2 h-7 gap-1.5 px-2 text-[11px]"
        >
          <Printer className="size-3.5" />
          Print checklist
        </Button>
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
                  {/* Mini side-view of just this row */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Side view (looking down container length)
                    </span>
                    <RowSideView row={row} pack={pack} />
                  </div>

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
