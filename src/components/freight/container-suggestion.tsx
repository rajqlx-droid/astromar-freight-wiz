/**
 * Smart container recommendation banner.
 * Single-container only (max 40HC). When cargo exceeds the 40HC's capacity,
 * shows a "Cargo shut out" warning with the number of cartons / volume that
 * cannot be loaded so the user can adjust their manifest.
 */
import { AlertTriangle, Download, Lightbulb, PackageX, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContainerRecommendation } from "@/lib/freight/container-recommender";

function downloadShutOutCsv(rec: ContainerRecommendation) {
  const { shutOut, totalCbm, totalWeightKg, units, summary, reason } = rec;
  if (!shutOut) return;
  const unit = units[0];
  const reasonLabel =
    reason === "exceeds-single-cbm"
      ? "Exceeds 40HC usable volume"
      : reason === "exceeds-single-weight"
        ? "Exceeds 40HC payload"
        : reason === "exceeds-single-geometry"
          ? "Geometry prevents full placement in 40HC"
          : "Within 40HC capacity";
  const rows: (string | number)[][] = [
    ["Cargo Shut-Out Summary"],
    ["Generated", new Date().toISOString()],
    ["Recommended container", summary],
    ["Reason", reasonLabel],
    [],
    ["Metric", "Total manifest", "Loaded in 40HC", "Shut out (left unplaced)"],
    [
      "Packages",
      "—",
      "—",
      shutOut.cartons,
    ],
    [
      "Volume (m³)",
      totalCbm.toFixed(3),
      unit ? unit.fillCbm.toFixed(3) : "",
      shutOut.cbm.toFixed(3),
    ],
    [
      "Weight (kg)",
      totalWeightKg.toFixed(2),
      unit ? unit.fillWeightKg.toFixed(2) : "",
      shutOut.weightKg.toFixed(2),
    ],
    [],
    ["Note", "Reduce quantities, change packaging, or split the shipment to load the excess separately."],
  ];
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cargo-shutout-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("Shut-out summary downloaded");
}

interface Props {
  recommendation: ContainerRecommendation;
  /** Currently selected container id (or "auto"). */
  currentChoice: string;
  /** Called with the container id to apply. */
  onApply: (containerId: "20gp" | "40gp" | "40hc") => void;
}

export function ContainerSuggestion({
  recommendation,
  currentChoice,
  onApply,
}: Props) {
  const { units, summary, reason, totalCbm, totalWeightKg, shutOut } = recommendation;
  const unit = units[0];
  if (!unit) return null;

  const hasShutOut = !!shutOut && (shutOut.cartons > 0 || shutOut.cbm > 0.0001);

  // Hide the banner when there's no shut-out and the current choice already
  // matches the single recommendation.
  if (
    !hasShutOut &&
    (currentChoice === "auto" || currentChoice === unit.container.id)
  ) {
    return null;
  }

  const tone = hasShutOut
    ? "border-rose-400/60 bg-rose-50 dark:bg-rose-950/20"
    : "border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/20";
  const headTone = hasShutOut
    ? "text-rose-900 dark:text-rose-200"
    : "text-emerald-900 dark:text-emerald-200";

  const reasonText =
    reason === "exceeds-single-cbm"
      ? `Your ${totalCbm.toFixed(1)} m³ shipment exceeds the largest container (40ft HC ≈ 70 m³ usable). Excess cargo is shut out.`
      : reason === "exceeds-single-weight"
        ? `Your ${totalWeightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg payload exceeds the 40ft HC's weight limit. Excess cargo is shut out.`
        : reason === "exceeds-single-geometry"
          ? recommendation.reasonDetail ??
            `Cargo volume fits on paper, but height/footprint geometry prevents the 40ft HC from physically holding every piece.`
          : `Optimal fit for ${totalCbm.toFixed(1)} m³ / ${totalWeightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg.`;

  return (
    <div className={cn("rounded-lg border-2 p-3 sm:p-4", tone)}>
      <div className={cn("mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold", headTone)}>
        {hasShutOut ? <AlertTriangle className="size-4" /> : <Sparkles className="size-4" />}
        <span>Smart recommendation: {summary}</span>
        <Button
          size="sm"
          variant="default"
          className="ml-auto h-7 bg-brand-navy px-2.5 text-[11px] text-white hover:bg-brand-navy/90"
          onClick={() => onApply(unit.container.id)}
        >
          Apply
        </Button>
      </div>

      <p className={cn("mb-3 flex items-start gap-1.5 text-[11px]", headTone, "opacity-90")}>
        <Lightbulb className="mt-0.5 size-3 shrink-0" />
        <span>{reasonText}</span>
      </p>

      <div className="rounded-md border border-black/5 bg-white/80 p-2 text-xs shadow-sm dark:border-white/10 dark:bg-black/30">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="font-semibold text-brand-navy">{unit.container.name}</span>
          <span className="text-[10px] text-muted-foreground">
            {unit.fillCbm.toFixed(1)} / {unit.container.capCbm} m³
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all",
              unit.cbmPct < 80
                ? "bg-emerald-500"
                : unit.cbmPct < 95
                  ? "bg-amber-500"
                  : "bg-rose-500",
            )}
            style={{ width: `${Math.min(100, unit.cbmPct)}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>{unit.cbmPct.toFixed(0)}% volume</span>
          <span>
            {unit.fillWeightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg ·{" "}
            {unit.weightPct.toFixed(0)}%
          </span>
        </div>
      </div>

      {hasShutOut && shutOut && (
        <div className="mt-3 rounded-md border-2 border-rose-300/60 bg-white/90 p-2.5 dark:border-rose-700/60 dark:bg-black/30">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-rose-900 dark:text-rose-200">
            <PackageX className="size-3.5" />
            <span>Cargo shut out — won't fit in a single 40ft HC</span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 gap-1 border-rose-400/60 px-2 text-[11px] text-rose-900 hover:bg-rose-100 dark:border-rose-600/60 dark:text-rose-100 dark:hover:bg-rose-900/40"
              onClick={() => downloadShutOutCsv(recommendation)}
            >
              <Download className="size-3" />
              Download summary
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <ShutOutStat label="Packages" value={shutOut.cartons > 0 ? shutOut.cartons.toLocaleString("en-IN") : "—"} />
            <ShutOutStat label="Volume" value={`${shutOut.cbm.toFixed(2)} m³`} />
            <ShutOutStat
              label="Weight"
              value={`${shutOut.weightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg`}
            />
          </div>
          <p className="mt-1.5 text-[10px] italic text-rose-900/80 dark:text-rose-200/80">
            Reduce quantities, change packaging, or split the shipment to load the excess separately.
          </p>
        </div>
      )}
    </div>
  );
}

function ShutOutStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-rose-50/60 px-1.5 py-1 text-center dark:bg-rose-950/30">
      <div className="text-[9px] uppercase tracking-wide text-rose-900/70 dark:text-rose-200/70">
        {label}
      </div>
      <div className="font-semibold text-rose-900 dark:text-rose-100">{value}</div>
    </div>
  );
}
