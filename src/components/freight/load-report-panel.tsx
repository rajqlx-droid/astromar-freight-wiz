/**
 * Live load report: per-item placement, CBM/weight bars, COG indicator,
 * unplaced-cargo warnings.
 */
import { CheckCircle2, AlertTriangle, XCircle, Scale, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";

interface Props {
  pack: AdvancedPackResult;
  /** Optional roll-up across all containers in a multi-container plan. */
  rollup?: {
    totalCbm: number;
    totalWeightKg: number;
    totalContainers: number;
    totalPlaced: number;
    totalPlanned: number;
  };
}

export function LoadReportPanel({ pack, rollup }: Props) {
  const volPct = Math.min(100, pack.utilizationPct);
  const wtPct = Math.min(100, pack.weightUtilizationPct);
  const volColor = volPct < 80 ? "bg-emerald-500" : volPct < 95 ? "bg-amber-500" : "bg-rose-500";
  const wtColor = wtPct < 80 ? "bg-emerald-500" : wtPct < 95 ? "bg-amber-500" : "bg-rose-500";

  const cogOffset = pack.cogOffsetPct;
  const cogLabel =
    Math.abs(cogOffset) < 0.1
      ? "Balanced"
      : cogOffset > 0
        ? "Forward-heavy"
        : "Rear-heavy";
  const cogTone =
    Math.abs(cogOffset) < 0.1
      ? "text-emerald-600"
      : Math.abs(cogOffset) < 0.25
        ? "text-amber-600"
        : "text-rose-600";

  const lateralOffset = (pack as unknown as { cogLateralOffsetPct?: number }).cogLateralOffsetPct ?? 0;
  const lateralLabel =
    Math.abs(lateralOffset) < 0.1
      ? "Centred"
      : lateralOffset > 0
        ? "Right-heavy"
        : "Left-heavy";
  const lateralTone =
    Math.abs(lateralOffset) < 0.1
      ? "text-emerald-600"
      : Math.abs(lateralOffset) < 0.15
        ? "text-amber-600"
        : "text-rose-600";

  const anyUnplaced = pack.perItem.some((p) => p.unplaced > 0);

  return (
    <div className="space-y-3 rounded-lg border-2 bg-card p-3"
      style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 18%, transparent)" }}
    >
      <div className="flex items-center gap-2">
        <Box className="size-4 text-brand-navy" />
        <h4 className="text-sm font-semibold text-brand-navy">Load Report</h4>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {pack.container.name}
        </span>
      </div>

      {rollup && (
        <div className="rounded-md border border-brand-navy/30 bg-brand-navy/5 p-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-brand-navy">
            Total shipment ({rollup.totalContainers} containers)
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1.5 text-[11px]">
            <div>
              <div className="text-muted-foreground">CBM</div>
              <div className="font-semibold text-brand-navy">{rollup.totalCbm.toFixed(2)} m³</div>
            </div>
            <div>
              <div className="text-muted-foreground">Weight</div>
              <div className="font-semibold text-brand-navy">
                {rollup.totalWeightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Cartons</div>
              <div className="font-semibold text-brand-navy">
                {rollup.totalPlaced} / {rollup.totalPlanned}
              </div>
            </div>
          </div>
        </div>
      )}
      <Bar
        label="Volume used"
        value={`${pack.cargoCbm.toFixed(2)} / ${pack.container.capCbm} m³`}
        pct={volPct}
        color={volColor}
      />
      {/* Weight bar */}
      <Bar
        label="Payload"
        value={`${pack.weightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} / ${pack.container.maxPayloadKg.toLocaleString("en-IN")} kg`}
        pct={wtPct}
        color={wtColor}
      />

      {/* COG */}
      <div className="rounded-md bg-muted/40 p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Scale className="size-3.5" /> Center of gravity
          <span className={cn("ml-auto font-semibold", cogTone)}>{cogLabel}</span>
        </div>
        <div className="relative h-2 rounded-full bg-muted">
          <div className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/40" />
          <div
            className={cn(
              "absolute top-1/2 size-3 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white shadow",
              Math.abs(cogOffset) < 0.1 ? "bg-emerald-500" : Math.abs(cogOffset) < 0.25 ? "bg-amber-500" : "bg-rose-500",
            )}
            style={{ left: `${50 + cogOffset * 50}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wide text-muted-foreground">
          <span>Rear</span>
          <span>Door</span>
        </div>
      </div>

      {/* Lateral COG */}
      <div className="rounded-md bg-muted/40 p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Scale className="size-3.5 rotate-90" /> Lateral balance
          <span className={cn("ml-auto font-semibold", lateralTone)}>
            {lateralLabel} ({(lateralOffset * 100).toFixed(1)}%)
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-muted">
          <div className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/40" />
          <div
            className={cn(
              "absolute top-1/2 size-3 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white shadow",
              Math.abs(lateralOffset) < 0.1 ? "bg-emerald-500" : Math.abs(lateralOffset) < 0.15 ? "bg-amber-500" : "bg-rose-500",
            )}
            style={{ left: `${50 + Math.max(-1, Math.min(1, lateralOffset)) * 50}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wide text-muted-foreground">
          <span>Left</span>
          <span>Right</span>
        </div>
      </div>

      {/* Per-item rows */}
      <div className="space-y-1">
        {pack.perItem
          .filter((p) => p.planned > 0)
          .map((p) => {
            const status = p.unplaced === 0 ? "ok" : p.placed === 0 ? "fail" : "partial";
            const Icon = status === "ok" ? CheckCircle2 : status === "fail" ? XCircle : AlertTriangle;
            const tone =
              status === "ok"
                ? "text-emerald-600"
                : status === "fail"
                  ? "text-rose-600"
                  : "text-amber-600";
            // Boxes belonging to this item.
            const itemBoxes = pack.placed.filter((b) => b.itemIdx === p.itemIdx);
            const rotatedBoxes = itemBoxes.filter(
              (b) => b.rotated === "sideways" || b.rotated === "axis",
            );
            const rotatedCount = rotatedBoxes.length;
            const tippedCount = rotatedBoxes.filter((b) => b.rotated === "axis").length;
            const turnedCount = rotatedCount - tippedCount;

            // Cluster rotated boxes into loader-friendly zones along container length.
            // Container length axis: 0 = back wall, max = door.
            const containerLenMm = pack.container.inner.l * 1000;
            const zoneOf = (xMm: number) => {
              const ratio = xMm / Math.max(1, containerLenMm);
              if (ratio < 0.25) return "back";
              if (ratio < 0.5) return "mid-back";
              if (ratio < 0.75) return "mid-door";
              return "door";
            };
            const zoneLabel: Record<string, string> = {
              back: "back wall",
              "mid-back": "mid (back half)",
              "mid-door": "mid (door half)",
              door: "near door",
            };
            const zoneCounts: Record<string, number> = {};
            rotatedBoxes.forEach((b) => {
              const z = zoneOf(b.x);
              zoneCounts[z] = (zoneCounts[z] ?? 0) + 1;
            });
            const tiltedWhere = Object.entries(zoneCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([z, n]) => `${n}× ${zoneLabel[z]}`)
              .join(", ");

            // Total boxes per zone (for context).
            const allZoneCounts: Record<string, number> = {};
            itemBoxes.forEach((b) => {
              const z = zoneOf(b.x);
              allZoneCounts[z] = (allZoneCounts[z] ?? 0) + 1;
            });
            const placementWhere = Object.entries(allZoneCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([z, n]) => `${n} ${zoneLabel[z]}`)
              .join(" · ");

            return (
              <div
                key={p.itemId}
                className="rounded-md bg-muted/30 px-2 py-1.5 text-xs"
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 size-3 shrink-0 rounded-sm border border-black/10"
                    style={{ background: p.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-brand-navy">Item {p.itemIdx + 1}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {p.packageType}
                      </span>
                      {!p.stackable && (
                        <span className="rounded bg-rose-100 px-1 text-[9px] font-medium uppercase text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          no-stack
                        </span>
                      )}
                      {p.fragile && (
                        <span className="rounded bg-amber-100 px-1 text-[9px] font-medium uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          fragile
                        </span>
                      )}
                      {rotatedCount > 0 && (
                        <span
                          className="rounded bg-yellow-100 px-1 text-[9px] font-medium uppercase text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200"
                          title={
                            tippedCount > 0
                              ? `${tippedCount} tipped on side, ${turnedCount} rotated sideways`
                              : `${turnedCount} rotated sideways for fit`
                          }
                        >
                          ↻ tilted {rotatedCount}×
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.placed} / {p.planned} placed
                      {p.reason ? ` — ${p.reason}` : ""}
                    </div>
                    {/* Loader guidance — where each box sits in the container. */}
                    {placementWhere && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        <span className="font-semibold text-brand-navy/70">Place:</span>{" "}
                        {placementWhere}
                      </div>
                    )}
                    {rotatedCount > 0 && (
                      <div className="mt-0.5 rounded border border-yellow-300/60 bg-yellow-50 px-1.5 py-0.5 text-[10px] text-yellow-900 dark:border-yellow-700/40 dark:bg-yellow-950/30 dark:text-yellow-200">
                        <span className="font-bold">↻ Tilt instructions:</span>{" "}
                        {turnedCount > 0 && (
                          <span>
                            {turnedCount} rotated 90° (long-side along width)
                            {tippedCount > 0 ? "; " : ""}
                          </span>
                        )}
                        {tippedCount > 0 && (
                          <span>{tippedCount} tipped onto its side (height ↔ length)</span>
                        )}
                        {tiltedWhere && (
                          <span className="block">
                            <span className="font-semibold">Location:</span> {tiltedWhere}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Icon className={cn("size-4 shrink-0", tone)} />
                </div>
              </div>
            );
          })}
      </div>

      {anyUnplaced && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 px-2 py-2 text-[11px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Some cargo did not fit in this container. Consider a larger container, splitting the
            load, or removing non-stackable / fragile constraints where possible.
          </span>
        </div>
      )}
    </div>
  );
}

function Bar({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold text-brand-navy">
          {value} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
