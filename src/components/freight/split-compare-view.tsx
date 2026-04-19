/**
 * Split-view container that renders two calculators at once.
 *
 * Layout:
 * - xl (≥1280px): true side-by-side, two columns, each scrolls independently.
 * - below xl: an A / B segmented switcher at the top, only one calc visible
 *   at a time. We still mount both so state is preserved when the user toggles
 *   (just toggle visibility via `hidden`).
 *
 * Each pane gets a header with the tool name and a "swap" + "exit" affordance.
 */
import { useState, type ReactNode } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CALCULATORS, type CalcKey } from "@/lib/freight/types";

interface Props {
  left: CalcKey;
  right: CalcKey;
  /** Renders the calculator UI for a given key. */
  renderCalc: (key: CalcKey) => ReactNode;
  /** Swap left and right panes. */
  onSwap: () => void;
  /** Exit split mode and return to the single-tool view. */
  onExit: () => void;
}

export function SplitCompareView({
  left,
  right,
  renderCalc,
  onSwap,
  onExit,
}: Props) {
  // Below xl: which pane is the user currently looking at?
  const [mobilePane, setMobilePane] = useState<"left" | "right">("left");

  const leftMeta = CALCULATORS.find((c) => c.key === left)!;
  const rightMeta = CALCULATORS.find((c) => c.key === right)!;

  return (
    <div className="space-y-3">
      {/* Compare-mode toolbar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 px-3 py-2"
        style={{
          borderColor: "var(--brand-orange)",
          background: "var(--brand-orange-soft)",
        }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-navy">
          <ArrowLeftRight className="size-4 text-brand-orange" />
          <span>Compare mode</span>
          <span className="hidden text-muted-foreground sm:inline">
            · {leftMeta.emoji} {leftMeta.label} vs {rightMeta.emoji} {rightMeta.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSwap}
            className="h-7 border-brand-navy text-xs text-brand-navy"
          >
            <ArrowLeftRight className="size-3.5" />
            Swap
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onExit}
            className="h-7 border-destructive text-xs text-destructive hover:bg-destructive/10"
          >
            <X className="size-3.5" />
            Exit
          </Button>
        </div>
      </div>

      {/* Mobile/tablet: A / B segmented switcher (hidden on xl) */}
      <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1 xl:hidden">
        <button
          type="button"
          onClick={() => setMobilePane("left")}
          className={
            "rounded-md px-3 py-2 text-xs font-semibold transition-colors " +
            (mobilePane === "left"
              ? "bg-background text-brand-navy shadow-sm"
              : "text-muted-foreground hover:text-brand-navy")
          }
        >
          <span aria-hidden>{leftMeta.emoji}</span> {leftMeta.label}
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("right")}
          className={
            "rounded-md px-3 py-2 text-xs font-semibold transition-colors " +
            (mobilePane === "right"
              ? "bg-background text-brand-navy shadow-sm"
              : "text-muted-foreground hover:text-brand-navy")
          }
        >
          <span aria-hidden>{rightMeta.emoji}</span> {rightMeta.label}
        </button>
      </div>

      {/* Two panes — side-by-side on xl, stacked-with-toggle below.
          Both stay mounted so state persists when toggling. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section
          aria-label={`${leftMeta.label} calculator`}
          className={
            (mobilePane === "left" ? "block" : "hidden") +
            " xl:block min-w-0 rounded-xl border-2 bg-card p-3 sm:p-4"
          }
          style={{
            borderColor: "color-mix(in oklab, var(--brand-navy) 30%, transparent)",
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <span aria-hidden className="text-lg">
              {leftMeta.emoji}
            </span>
            <div>
              <div className="text-sm font-bold text-brand-navy">{leftMeta.label}</div>
              <div className="text-[11px] text-muted-foreground">{leftMeta.sub}</div>
            </div>
          </div>
          {renderCalc(left)}
        </section>

        <section
          aria-label={`${rightMeta.label} calculator`}
          className={
            (mobilePane === "right" ? "block" : "hidden") +
            " xl:block min-w-0 rounded-xl border-2 bg-card p-3 sm:p-4"
          }
          style={{
            borderColor: "color-mix(in oklab, var(--brand-orange) 35%, transparent)",
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <span aria-hidden className="text-lg">
              {rightMeta.emoji}
            </span>
            <div>
              <div className="text-sm font-bold text-brand-navy">{rightMeta.label}</div>
              <div className="text-[11px] text-muted-foreground">{rightMeta.sub}</div>
            </div>
          </div>
          {renderCalc(right)}
        </section>
      </div>
    </div>
  );
}
