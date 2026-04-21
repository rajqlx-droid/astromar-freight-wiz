/**
 * Smart container recommendation banner.
 * Shows when total CBM/weight suggests a different container (or multi-container)
 * than what the user currently has selected. In multi-container mode each unit
 * card is clickable and drives the 3D viewer's active tab below.
 */
import { Boxes, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContainerRecommendation } from "@/lib/freight/container-recommender";

interface Props {
  recommendation: ContainerRecommendation;
  /** Currently selected container id (or "auto"). */
  currentChoice: string;
  /** Called with the container id to apply (only meaningful when single-container). */
  onApply: (containerId: "20gp" | "40gp" | "40hc") => void;
  /** Active unit index in the 3D viewer (multi-container mode). */
  activeUnitIdx?: number;
  /** Called when user clicks a unit card to switch the 3D viewer's tab. */
  onUnitSelect?: (idx: number) => void;
  /** Per-unit placed/total counts to render badges on each card. */
  unitStats?: Array<{ placed: number; total: number }>;
}

export function ContainerSuggestion({
  recommendation,
  currentChoice,
  onApply,
  activeUnitIdx,
  onUnitSelect,
  unitStats,
}: Props) {
  const { units, summary, isMulti, reason, totalCbm, totalWeightKg } = recommendation;

  // Hide the banner when the current choice already matches a single-container recommendation.
  if (
    !isMulti &&
    units.length === 1 &&
    (currentChoice === "auto" || currentChoice === units[0].container.id)
  ) {
    return null;
  }

  const tone = isMulti
    ? "border-amber-400/60 bg-amber-50 dark:bg-amber-950/20"
    : "border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/20";
  const headTone = isMulti
    ? "text-amber-900 dark:text-amber-200"
    : "text-emerald-900 dark:text-emerald-200";

  const reasonText =
    reason === "exceeds-single-cbm"
      ? `Your ${totalCbm.toFixed(1)} m³ shipment exceeds the largest single container (40ft HC ≈ 70 m³ usable).`
      : reason === "exceeds-single-weight"
        ? `Your ${totalWeightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg payload exceeds a single container's limit.`
        : reason === "exceeds-single-geometry"
          ? recommendation.reasonDetail ??
            `Cargo volume fits on paper, but height/footprint geometry prevents a single smaller container from physically holding every piece — escalating size.`
          : `Optimal fit for ${totalCbm.toFixed(1)} m³ / ${totalWeightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg.`;

  const isClickable = isMulti && typeof onUnitSelect === "function";

  return (
    <div className={cn("rounded-lg border-2 p-3 sm:p-4", tone)}>
      <div className={cn("mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold", headTone)}>
        {isMulti ? <Boxes className="size-4" /> : <Sparkles className="size-4" />}
        <span>Smart recommendation: {summary}</span>
        {!isMulti && (
          <Button
            size="sm"
            variant="default"
            className="ml-auto h-7 bg-brand-navy px-2.5 text-[11px] text-white hover:bg-brand-navy/90"
            onClick={() => onApply(units[0].container.id)}
          >
            Apply
          </Button>
        )}
      </div>

      <p className={cn("mb-3 flex items-start gap-1.5 text-[11px]", headTone, "opacity-90")}>
        <Lightbulb className="mt-0.5 size-3 shrink-0" />
        <span>{reasonText}</span>
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {units.map((u, i) => {
          const stats = unitStats?.[i];
          const isActive = isClickable && activeUnitIdx === i;
          const allPlaced = stats ? stats.placed >= stats.total && stats.total > 0 : false;
          const cardBody = (
            <>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="font-semibold text-brand-navy">
                  #{i + 1} {u.container.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {u.fillCbm.toFixed(1)} / {u.container.capCbm} m³
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full transition-all",
                    u.cbmPct < 80
                      ? "bg-emerald-500"
                      : u.cbmPct < 95
                        ? "bg-amber-500"
                        : "bg-rose-500",
                  )}
                  style={{ width: `${Math.min(100, u.cbmPct)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>{u.cbmPct.toFixed(0)}% volume</span>
                <span>
                  {u.fillWeightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg ·{" "}
                  {u.weightPct.toFixed(0)}%
                </span>
              </div>
              {stats && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      allPlaced
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
                    )}
                  >
                    {stats.placed} / {stats.total} placed
                  </span>
                  {isClickable && (
                    <span className="text-[10px] font-medium text-brand-navy/70">
                      {isActive ? "Viewing →" : "View in 3D →"}
                    </span>
                  )}
                </div>
              )}
            </>
          );

          if (isClickable) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onUnitSelect?.(i)}
                className={cn(
                  "rounded-md border bg-white/80 p-2 text-left text-xs shadow-sm transition-all hover:shadow-md dark:bg-black/30",
                  isActive
                    ? "border-brand-navy/60 ring-2 ring-brand-navy ring-offset-1 ring-offset-transparent"
                    : "border-black/5 hover:border-brand-navy/30 dark:border-white/10",
                )}
                aria-pressed={isActive}
              >
                {cardBody}
              </button>
            );
          }

          return (
            <div
              key={i}
              className="rounded-md border border-black/5 bg-white/80 p-2 text-xs shadow-sm dark:border-white/10 dark:bg-black/30"
            >
              {cardBody}
            </div>
          );
        })}
      </div>

      {isMulti && (
        <p className={cn("mt-2 text-[10px] italic", headTone, "opacity-75")}>
          {isClickable
            ? "Click a container above to inspect it in the 3D viewer below."
            : "Cargo will be split across the containers below — switch tabs in the load plan to inspect each."}
        </p>
      )}
    </div>
  );
}
