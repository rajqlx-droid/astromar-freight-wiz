/**
 * Row-by-row loading guide.
 *
 * Groups the placed boxes into rows along the container length (x-axis),
 * back wall first. Each row card explains how a loader (standing outside
 * the container) should build that row from the floor up before advancing
 * to the next row toward the door.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Layers, Lightbulb, Printer, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import {
  buildRowFrontViewSvg,
  buildRowSideViewSvg,
  buildRowTopViewSvg,
  buildRows,
  computeWallEfficiency,
  DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD,
  instructionFor,
  itemCountsForRow,
  suggestReshuffle,
  type RowGroup,
} from "@/lib/freight/loading-rows";

const HEAVY_THRESHOLD_STORAGE_KEY = "freight:heavyKgPerPkg";
const HEAVY_MIN = 5;
const HEAVY_MAX = 100;

function clampHeavy(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD;
  return Math.min(HEAVY_MAX, Math.max(HEAVY_MIN, Math.round(n)));
}

/** Read the persisted user threshold (browser only — safe during SSR, returns default). */
export function readHeavyThreshold(): number {
  if (typeof window === "undefined") return DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD;
  const raw = window.localStorage.getItem(HEAVY_THRESHOLD_STORAGE_KEY);
  if (!raw) return DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD;
  const n = Number(raw);
  return Number.isFinite(n) ? clampHeavy(n) : DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD;
}

interface Props {
  pack: AdvancedPackResult;
  /**
   * Emit per-box width-axis offsets (placedIdx → metres along scene-z) when the
   * loader applies a "Suggested re-shuffle" preview. Pass `null` to clear it.
   */
  onApplyShuffle?: (overrides: Map<number, number> | null) => void;
  /** True while a preview is active (drives the Apply/Clear button label). */
  shufflePreviewActive?: boolean;
  /** True when the parent is showing the 2D iso view — preview needs 3D enabled to be visible. */
  previewRequires3D?: boolean;
  /** Index of the row currently being inspected by the 3D step-load mode (null when stepper off). */
  activeRowIdx?: number | null;
  /**
   * Called when the user clicks a row card header. Parent uses this to drive
   * the 3D step-loader — clicking Row N reveals rows 0..N cumulatively.
   */
  onRowSelect?: (rowIdx: number) => void;
}

/** Per-item count breakdown for a row (returns array of {itemIdx, count, color}). */
function itemCounts(row: RowGroup, pack: AdvancedPackResult) {
  return itemCountsForRow(row, pack);
}

/**
 * Mini projection of a single row — wraps a shared SVG builder so the panel,
 * print HTML, and PDF all render the exact same artwork.
 */
function RowProjection({
  svg,
}: {
  svg: string;
}) {
  return (
    <div
      className="h-[90px] w-full overflow-hidden rounded border bg-background [&_svg]:h-full [&_svg]:w-full"
      // SVG is built from sanitised numeric data + theme constants — safe to inject.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}



export function LoadingRowsPanel({
  pack,
  onApplyShuffle,
  shufflePreviewActive = false,
  previewRequires3D = false,
  activeRowIdx = null,
  onRowSelect,
}: Props) {
  // Configurable kg/pkg threshold for the "heavy" mixed-pallet warning.
  // Hydrate from localStorage AFTER mount to avoid SSR/CSR mismatch.
  const [heavyThreshold, setHeavyThreshold] = useState<number>(
    DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD,
  );
  useEffect(() => {
    setHeavyThreshold(readHeavyThreshold());
  }, []);
  const persistThreshold = (n: number) => {
    const v = clampHeavy(n);
    setHeavyThreshold(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HEAVY_THRESHOLD_STORAGE_KEY, String(v));
    }
  };

  const rows = useMemo(() => buildRows(pack, heavyThreshold), [pack, heavyThreshold]);
  const efficiency = useMemo(() => computeWallEfficiency(rows), [rows]);
  // First row open by default; others collapsed.
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set([0]));
  // Per-row "Suggest re-shuffle" toggle state.
  const [shuffleOpen, setShuffleOpen] = useState<Set<number>>(() => new Set());
  // Which row's preview is currently applied to the 3D view (null = none).
  const [previewedRow, setPreviewedRow] = useState<number | null>(null);

  // Refs to each row <li> so we can scroll the active row into view when the
  // 3D step-load mode advances. Map is rebuilt every render — cheap and safe.
  const rowRefs = useRef(new Map<number, HTMLLIElement>());

  // Clear preview if the pack changes (re-pack invalidates placedIdx mapping).
  useEffect(() => {
    setPreviewedRow(null);
    onApplyShuffle?.(null);
    // Intentionally only on pack identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack]);

  // Keep this panel in sync with the 3D row stepper: auto-open the active row
  // and scroll it into view so the user sees the matching loader instructions.
  useEffect(() => {
    if (activeRowIdx == null) return;
    setOpenRows((prev) => {
      if (prev.has(activeRowIdx)) return prev;
      const next = new Set(prev);
      next.add(activeRowIdx);
      return next;
    });
    const el = rowRefs.current.get(activeRowIdx);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeRowIdx]);

  const toggleShuffle = (idx: number) => {
    setShuffleOpen((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  /**
   * Build a placedIdx → metres-along-scene-z offset map for one row using its
   * reshuffle suggestion. Bottom-layer boxes are slid toward the chosen side
   * so they meet the rest of the wall pack and close the gap.
   */
  const buildPreviewOffsets = (row: RowGroup): Map<number, number> => {
    const sug = suggestReshuffle(row, pack);
    const offsets = new Map<number, number>();
    if (sug.direction === "none") return offsets;
    const containerWmm = pack.container.inner.w;
    // Compute per-box slide amounts. We work in mm then convert to metres.
    const bottoms = row.boxes.filter((b) => b.z < 10);
    if (bottoms.length === 0) return offsets;
    const minY = Math.min(...bottoms.map((b) => b.y));
    const maxY = Math.max(...bottoms.map((b) => b.y + b.w));
    // Slack on each side of the cluster.
    const leftSlackMm = minY;
    const rightSlackMm = containerWmm - maxY;
    for (const b of bottoms) {
      const placedIdx = pack.placed.indexOf(b);
      if (placedIdx < 0) continue;
      let slideMm = 0;
      if (sug.direction === "left") {
        // Slide the left-side cluster RIGHT to meet the right wall pack.
        slideMm = leftSlackMm;
      } else if (sug.direction === "right") {
        // Slide the right-side cluster LEFT to meet the left wall pack.
        slideMm = -rightSlackMm;
      } else if (sug.direction === "split") {
        // Move both halves toward the centre.
        const mid = containerWmm / 2;
        const boxCentre = b.y + b.w / 2;
        slideMm = boxCentre < mid ? leftSlackMm / 2 : -rightSlackMm / 2;
      }
      offsets.set(placedIdx, slideMm / 1000);
    }
    return offsets;
  };

  const applyPreview = (row: RowGroup) => {
    const offsets = buildPreviewOffsets(row);
    setPreviewedRow(row.rowIdx);
    onApplyShuffle?.(offsets);
  };
  const clearPreview = () => {
    setPreviewedRow(null);
    onApplyShuffle?.(null);
  };


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
        if (row.gapWarning)
          badges.push('<span class="badge gap">⚠ GAP — RE-SHUFFLE</span>');
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
        const wallPct = Math.round(row.wallUtilizationPct);
        const wallClass = row.gapWarning ? "wall warn" : "wall ok";
        const doorSvg = buildRowSideViewSvg(row, pack, { width: 200, height: 90 });
        const sideSvg = buildRowFrontViewSvg(row, pack, { width: 200, height: 90 });
        const topSvg = buildRowTopViewSvg(row, pack, { width: 200, height: 90 });
        return `
          <li class="row">
            <div class="row-head">
              <span class="rnum">R${row.rowIdx + 1}</span>
              <div class="row-meta">
                <div class="row-title">Row ${row.rowIdx + 1} <span class="dim">— ${xStartM}–${xEndM} m from rear wall</span></div>
                <div class="row-sub">${row.boxes.length} pkg · ${row.layers} layer${row.layers > 1 ? "s" : ""} · ${row.totalCbm.toFixed(2)} m³ ${wt} · <span class="${wallClass}">${wallPct}% wall used</span></div>
              </div>
              <div class="badges">${badges.join(" ")}</div>
              <span class="check"></span>
            </div>
            <div class="row-body">
              <div class="row-body-grid">
                <div class="views">
                  <div class="view">
                    <div class="view-label">Door view (W × H)</div>
                    ${doorSvg}
                  </div>
                  <div class="view">
                    <div class="view-label">Side view (depth × H)</div>
                    ${sideSvg}
                  </div>
                  <div class="view">
                    <div class="view-label">Top view (W × depth)</div>
                    ${topSvg}
                  </div>
                </div>
                <div class="row-body-text">
                  <div class="chips">${itemsHtml}</div>
                  ${row.gapWarning ? `<div class="warn warn-gap">⚠ Gap warning — back wall only ${Math.round(row.wallUtilizationPct)}% covered. Re-shuffle pallets side-to-side to close gaps before sealing the container.</div>` : ""}
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
        .badge.mixed { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        .badge.gap { background: #ffedd5; color: #9a3412; border: 1px solid #fdba74; }
        .warn { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; padding: 5px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .warn.warn-gap { background: #fff7ed; border-color: #fdba74; color: #9a3412; }
        .wall.ok { color: #047857; font-weight: 700; }
        .wall.warn { color: #c2410c; font-weight: 700; }
        .check { width: 18px; height: 18px; border: 1.5px solid #1B3A6B; border-radius: 4px; flex-shrink: 0; }
        .row-body { margin-top: 8px; padding-left: 38px; }
        .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
        .chip { display: inline-flex; align-items: center; gap: 5px; background: #f4f6fa; padding: 3px 7px; border-radius: 4px; font-size: 10px; }
        .swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
        .instruction { border-left: 2px solid #F97316; padding: 4px 8px; background: #fafbfd; font-size: 11px; color: #1B3A6B; border-radius: 0 4px 4px 0; }
        .row-body-grid { display: grid; grid-template-columns: 220px 1fr; gap: 12px; align-items: start; }
        .views { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
        .view { display: flex; flex-direction: column; gap: 2px; }
        .view:first-child { grid-column: 1 / -1; }
        .view svg { display: block; width: 100%; height: auto; border: 1px solid #d6dde8; border-radius: 4px; background: #fff; }
        .view-label { font-size: 8px; font-weight: 600; color: #777; letter-spacing: 0.4px; text-transform: uppercase; }
        .row-body-text { display: flex; flex-direction: column; gap: 6px; }
        .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #d6dde8; color: #777; font-size: 9px; }
        .eff { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid; }
        .eff.green { background: #d1fae5; border-color: #059669; color: #065f46; }
        .eff.amber { background: #fef3c7; border-color: #d97706; color: #92400e; }
        .eff.red { background: #ffe4e6; border-color: #e11d48; color: #9f1239; }
        .eff .pct { font-size: 18px; font-weight: 800; min-width: 48px; }
        .eff .label { font-size: 11px; font-weight: 700; color: #1B3A6B; }
        .eff .sub { font-size: 10px; }
      </style></head><body>
      <h1>Loading Checklist — Row by Row</h1>
      <div class="sub">${rows.length} row${rows.length > 1 ? "s" : ""} · back wall to door · heavy threshold ${heavyThreshold} kg/pkg · generated ${new Date().toLocaleString("en-IN")}</div>
      <div class="accent"></div>
      ${
        efficiency.rowCount > 0
          ? `<div class="eff ${efficiency.status}"><span class="pct">${Math.round(efficiency.scorePct)}%</span><div><div class="label">Container wall efficiency target</div><div class="sub">${
              efficiency.status === "green"
                ? "● Optimal — all rows tight to back wall."
                : efficiency.status === "amber"
                  ? `● Close gaps — ${efficiency.gapRowCount} of ${efficiency.rowCount} row${efficiency.rowCount > 1 ? "s" : ""} need re-shuffle.`
                  : `● Re-shuffle needed — ${efficiency.gapRowCount} of ${efficiency.rowCount} row${efficiency.rowCount > 1 ? "s" : ""} flagged.`
            }</div></div></div>`
          : ""
      }
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
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-2 h-7 gap-1.5 px-2 text-[11px]"
              aria-label={`Mixed-pallet warning settings — heavy threshold ${heavyThreshold} kg per package`}
              title={`Heavy threshold: ${heavyThreshold} kg/pkg`}
            >
              <Settings2 className="size-3.5" />
              Settings
              <span
                className={cn(
                  "ml-0.5 rounded px-1 py-0.5 text-[9px] font-bold tabular-nums",
                  heavyThreshold === DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD
                    ? "bg-muted text-muted-foreground"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                )}
              >
                ⚖ {heavyThreshold}kg
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <div>
              <Label htmlFor="heavy-threshold-input" className="text-xs font-semibold text-brand-navy">
                Heavy package cutoff
              </Label>
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                Non-fragile units at or above this weight (per package) trigger a
                <strong className="font-semibold"> mixed-pallet</strong> warning when
                stacked with fragile items.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="heavy-threshold-input"
                type="number"
                inputMode="numeric"
                min={HEAVY_MIN}
                max={HEAVY_MAX}
                step={1}
                value={heavyThreshold}
                onChange={(e) => persistThreshold(Number(e.target.value))}
                className="h-8 w-20 text-sm"
              />
              <span className="text-xs text-muted-foreground">kg / pkg</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-[10px]"
                onClick={() => persistThreshold(DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD)}
              >
                Reset
              </Button>
            </div>
            <Slider
              min={HEAVY_MIN}
              max={HEAVY_MAX}
              step={1}
              value={[heavyThreshold]}
              onValueChange={(v) => persistThreshold(v[0] ?? DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD)}
              aria-label="Heavy package threshold slider"
            />
            <div className="flex justify-between text-[9.5px] uppercase tracking-wide text-muted-foreground">
              <span>{HEAVY_MIN} kg</span>
              <span>default {DEFAULT_HEAVY_KG_PER_PKG_THRESHOLD} kg</span>
              <span>{HEAVY_MAX} kg</span>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className="h-7 gap-1.5 px-2 text-[11px]"
        >
          <Printer className="size-3.5" />
          Print checklist
        </Button>
      </div>

      {/* Container-level wall efficiency — traffic light. */}
      <div
        className={cn(
          "flex items-center gap-3 border-b px-3 py-2.5",
          efficiency.status === "green" && "bg-emerald-50 dark:bg-emerald-950/20",
          efficiency.status === "amber" && "bg-amber-50 dark:bg-amber-950/20",
          efficiency.status === "red" && "bg-rose-50 dark:bg-rose-950/20",
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums text-white shadow",
            efficiency.status === "green" && "bg-emerald-600",
            efficiency.status === "amber" && "bg-amber-500",
            efficiency.status === "red" && "bg-rose-600",
          )}
          aria-label={`Container wall efficiency ${Math.round(efficiency.scorePct)} percent — ${efficiency.status}`}
        >
          {Math.round(efficiency.scorePct)}%
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-brand-navy">
              Container wall efficiency
            </span>
            <span
              className={cn(
                "text-[9px] font-bold uppercase tracking-wide",
                efficiency.status === "green" && "text-emerald-700 dark:text-emerald-300",
                efficiency.status === "amber" && "text-amber-700 dark:text-amber-300",
                efficiency.status === "red" && "text-rose-700 dark:text-rose-300",
              )}
            >
              {efficiency.status === "green"
                ? "● optimal"
                : efficiency.status === "amber"
                  ? "● close gaps"
                  : "● re-shuffle needed"}
            </span>
          </div>
          <div className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
            Depth-weighted average across {efficiency.rowCount} row
            {efficiency.rowCount > 1 ? "s" : ""}
            {efficiency.gapRowCount > 0 && (
              <>
                {" · "}
                <strong className="font-semibold text-orange-700 dark:text-orange-300">
                  {efficiency.gapRowCount} row{efficiency.gapRowCount > 1 ? "s" : ""} need re-shuffle
                </strong>
              </>
            )}
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                efficiency.status === "green" && "bg-emerald-500",
                efficiency.status === "amber" && "bg-amber-500",
                efficiency.status === "red" && "bg-rose-500",
              )}
              style={{ width: `${Math.max(2, Math.round(efficiency.scorePct))}%` }}
            />
          </div>
        </div>
      </div>

      <ol className="divide-y">
        {rows.map((row) => {
          const isOpen = openRows.has(row.rowIdx);
          const isActive = activeRowIdx === row.rowIdx;
          const counts = itemCounts(row, pack);
          const xStartM = row.xStart / 1000;
          const xEndM = row.xEnd / 1000;
          return (
            <li
              key={row.rowIdx}
              ref={(el) => {
                if (el) rowRefs.current.set(row.rowIdx, el);
                else rowRefs.current.delete(row.rowIdx);
              }}
              className={cn(
                "transition-colors",
                isActive && "bg-amber-50 ring-2 ring-inset ring-amber-400 dark:bg-amber-950/30",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  toggle(row.rowIdx);
                  onRowSelect?.(row.rowIdx);
                }}
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
                    {row.needsSeparator && (
                      <span className="rounded border border-red-300 bg-red-100 px-1 text-[9px] font-medium uppercase text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                        ⚠ mixed pallet
                      </span>
                    )}
                    {row.gapWarning && (
                      <span className="rounded border border-orange-300 bg-orange-100 px-1 text-[9px] font-medium uppercase text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">
                        ⚠ gap — re-shuffle
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
                    <span>·</span>
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        row.gapWarning ? "text-orange-700 dark:text-orange-300" : "text-emerald-700 dark:text-emerald-300",
                      )}
                      title="Back-wall floor area covered by bottom layer"
                    >
                      {Math.round(row.wallUtilizationPct)}% wall used
                    </span>
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
                  {/* Three projections of just this row */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Door view (W × H)
                      </span>
                      <RowProjection svg={buildRowSideViewSvg(row, pack)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Side view (depth × H)
                      </span>
                      <RowProjection svg={buildRowFrontViewSvg(row, pack)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Top view (W × depth)
                      </span>
                      <RowProjection svg={buildRowTopViewSvg(row, pack)} />
                    </div>
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

                  {/* Wall utilization bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide">
                      <span className="text-muted-foreground">Back-wall utilization</span>
                      <span
                        className={cn(
                          "tabular-nums",
                          row.gapWarning ? "text-orange-700 dark:text-orange-300" : "text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {Math.round(row.wallUtilizationPct)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          row.gapWarning ? "bg-orange-500" : "bg-emerald-500",
                        )}
                        style={{ width: `${Math.max(2, Math.round(row.wallUtilizationPct))}%` }}
                      />
                    </div>
                  </div>

                  {row.gapWarning && (
                    <div className="space-y-1.5 rounded-md border border-orange-300 bg-orange-50 px-2 py-1.5 dark:border-orange-900 dark:bg-orange-950/30">
                      <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-orange-800 dark:text-orange-200">
                        <span aria-hidden>⚠</span>
                        <span className="flex-1">
                          <strong className="font-semibold">Gap warning:</strong>{" "}
                          Back wall only {Math.round(row.wallUtilizationPct)}% covered. Re-shuffle pallets side-to-side to close gaps before sealing the container.
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleShuffle(row.rowIdx);
                          }}
                          className="h-6 gap-1 px-1.5 text-[10px]"
                          aria-expanded={shuffleOpen.has(row.rowIdx)}
                        >
                          <Lightbulb className="size-3" />
                          {shuffleOpen.has(row.rowIdx) ? "Hide" : "Suggest re-shuffle"}
                        </Button>
                      </div>
                      {shuffleOpen.has(row.rowIdx) && (() => {
                        const sug = suggestReshuffle(row, pack);
                        const isPreviewing = previewedRow === row.rowIdx;
                        return (
                          <div className="rounded border border-orange-200 bg-background/80 p-2 text-[11px] leading-relaxed text-brand-navy dark:border-orange-900/60">
                            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                              <Lightbulb className="size-3" />
                              Suggested re-shuffle
                            </div>
                            <p>{sug.text}</p>
                            {sug.direction !== "none" && (
                              <p className="mt-1 text-[10.5px] text-muted-foreground">
                                Projected back-wall utilisation after shuffle:{" "}
                                <strong className="font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                                  {Math.round(sug.projectedUtilizationPct)}%
                                </strong>
                                {" "}(currently {Math.round(row.wallUtilizationPct)}%).
                              </p>
                            )}
                            {sug.direction !== "none" && onApplyShuffle && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isPreviewing) clearPreview();
                                    else applyPreview(row);
                                  }}
                                  className={cn(
                                    "h-6 gap-1 px-2 text-[10px]",
                                    isPreviewing
                                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                      : "bg-brand-navy hover:bg-brand-navy/90 text-white",
                                  )}
                                >
                                  {isPreviewing ? "Clear preview" : "Apply suggested re-shuffle"}
                                </Button>
                                {isPreviewing && previewRequires3D && (
                                  <span className="text-[10px] text-orange-700 dark:text-orange-300">
                                    Switch to 3D view to see the slid pallets.
                                  </span>
                                )}
                                {isPreviewing && !previewRequires3D && (
                                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
                                    ● Preview active in 3D view (green ring under slid pallets).
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                        );
                      })()}
                    </div>
                  )}

                  {row.needsSeparator && (
                    <div className="flex items-start gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] leading-relaxed text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                      <span aria-hidden>⚠</span>
                      <span>
                        <strong className="font-semibold">Mixed pallet:</strong>{" "}
                        Insert a plywood or cardboard separator board between the heavy non-fragile units and the fragile units before stacking.
                      </span>
                    </div>
                  )}

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
