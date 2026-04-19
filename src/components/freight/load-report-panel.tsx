/**
 * Live load report: per-item placement, CBM/weight bars, COG indicator,
 * unplaced-cargo warnings.
 */
import { CheckCircle2, AlertTriangle, XCircle, Scale, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";

interface Props {
  pack: AdvancedPackResult;
}

export function LoadReportPanel({ pack }: Props) {
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

      {/* Volume bar */}
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
            return (
              <div
                key={p.itemId}
                className="flex items-start gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
              >
                <span
                  className="mt-0.5 size-3 shrink-0 rounded-sm border border-black/10"
                  style={{ background: p.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
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
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.placed} / {p.planned} placed
                    {p.reason ? ` — ${p.reason}` : ""}
                  </div>
                </div>
                <Icon className={cn("size-4 shrink-0", tone)} />
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
