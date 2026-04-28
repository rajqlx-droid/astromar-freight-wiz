/**
 * Loader HUD — single slim playback bar pinned to the bottom-center of the
 * 3D viewer. State badge, step counter, one-line instruction, and playback
 * controls all live in one row. Foundation Audit / hard violations open in
 * a Popover anchored above the bar so they never permanently overlay cargo.
 */
import { useState } from "react";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  RotateCcw,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PalletStep, RowGroup } from "@/lib/freight/loading-rows";
import { computeComplianceReport } from "@/lib/freight/compliance";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import type { BestPlanMeta } from "@/lib/freight/scenario-runner";

interface Props {
  step: PalletStep | null;
  totalSteps: number;
  currentIdx: number; // -1 == empty container
  isPlaying: boolean;
  speed: 0.5 | 1 | 2;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onSpeedChange: (s: 0.5 | 1 | 2) => void;
  pack?: AdvancedPackResult | null;
  rows?: RowGroup[];
  /** Optional optimiser metadata — drives state badge when present. */
  planMeta?: BestPlanMeta | null;
  /** Indices of currently revealed boxes — kept for API compatibility. */
  visiblePlacedIdxs?: ReadonlySet<number> | null;
  /** Called when the user clicks a failed Foundation Audit row. */
  onJumpToRow?: (rowIdx1Based: number) => void;
}

type HudState = "GREEN" | "AMBER" | "RED";

export function LoaderHUD({
  step,
  totalSteps,
  currentIdx,
  isPlaying,
  speed,
  onPlayPause,
  onPrev,
  onNext,
  onReset,
  onSpeedChange,
  pack = null,
  rows,
  planMeta = null,
  onJumpToRow,
}: Props) {
  const isEmpty = currentIdx < 0 || !step;
  const atLast = currentIdx >= totalSteps - 1;
  const compliance = pack ? computeComplianceReport(pack, { rows }) : null;

  // ── HUD state machine ────────────────────────────────────────────────
  const hasShutOut =
    !!planMeta?.shutOut &&
    (planMeta.shutOut.cartons > 0 ||
      planMeta.shutOut.cbm > 0.0001 ||
      planMeta.shutOut.weightKg > 0.01);
  let state: HudState;
  let label: string;
  if (planMeta) {
    if (!planMeta.allLegal) {
      state = "RED";
      label = "Blocked";
    } else if (hasShutOut) {
      state = "AMBER";
      label = "Shut-out";
    } else {
      state = "GREEN";
      label = "Ready";
    }
  } else if (compliance) {
    state =
      compliance.status === "GREEN"
        ? "GREEN"
        : compliance.status === "YELLOW"
          ? "AMBER"
          : "RED";
    label = state === "GREEN" ? "OK" : state === "AMBER" ? "Review" : "Issues";
  } else {
    state = "GREEN";
    label = "Ready";
  }

  const stateColor =
    state === "GREEN" ? "#22c55e" : state === "AMBER" ? "#f59e0b" : "#ef4444";
  const [auditOpen, setAuditOpen] = useState(false);
  const failedAudits = compliance?.foundationAudit.filter((a) => !a.ok).length ?? 0;
  const hasDetail =
    !!compliance ||
    (state === "RED" && (planMeta?.hardViolations?.length ?? 0) > 0) ||
    (state === "AMBER" && hasShutOut);

  const warning = !isEmpty && step.warnings.length > 0 ? step.warnings[0] : null;
  const instructionTitle = isEmpty
    ? "Press Play to start"
    : `${step.action}${warning ? ` — ⚠ ${warning}` : ""}\n${step.itemLabel} · ${step.dimsLabel} · ${step.positionText}`;

  return (
    <div className="pointer-events-auto absolute bottom-2 left-1/2 z-10 -translate-x-1/2 max-w-[min(620px,92%)]">
      <div className="flex items-stretch gap-2 rounded-full border-2 border-brand-navy/60 bg-background/95 px-2 py-1.5 shadow-xl backdrop-blur">
        {/* State dot + step counter */}
        <div className="flex shrink-0 items-center gap-1.5 pl-1">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: stateColor }}
            title={label}
          />
          <span className="rounded-full bg-brand-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {isEmpty ? "Ready" : `${currentIdx + 1}/${totalSteps}`}
          </span>
        </div>

        {/* Single-line instruction */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5" title={instructionTitle}>
          <p className="truncate text-[11px] font-medium text-brand-navy">
            {isEmpty ? "Press ▶ to start" : step.action}
          </p>
          {warning && (
            <AlertTriangle
              aria-label={warning}
              className="size-3 shrink-0 text-amber-600"
            />
          )}
        </div>

        {/* Audit / detail popover trigger */}
        {hasDetail && (
          <Popover open={auditOpen} onOpenChange={setAuditOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="ml-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider hover:bg-current/10"
                style={{ borderColor: stateColor, color: stateColor }}
                aria-label="Show plan details"
                title="Plan details"
              >
                <Info className="size-2.5" />
                {failedAudits > 0 && (
                  <span className="rounded-full bg-current/20 px-1 text-[9px]">
                    {failedAudits}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="w-80 p-3 text-[11px]"
            >
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                <span
                  className="size-2 rounded-full"
                  style={{ background: stateColor }}
                  aria-hidden
                />
                <span style={{ color: stateColor }}>{label}</span>
                {compliance && (
                  <span className="ml-auto text-muted-foreground">
                    Score {compliance.score}
                  </span>
                )}
              </div>

              {state === "RED" &&
                planMeta?.hardViolations &&
                planMeta.hardViolations.length > 0 && (
                  <div className="mb-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 dark:border-red-900 dark:bg-red-950/40">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                      Hard violations
                    </p>
                    <ul className="space-y-0.5 text-red-800 dark:text-red-200">
                      {planMeta.hardViolations.map((v, i) => (
                        <li key={i}>• {v}</li>
                      ))}
                    </ul>
                  </div>
                )}

              {state === "AMBER" && hasShutOut && planMeta?.shutOut && (
                <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                    Shut-out
                  </p>
                  <p className="text-amber-900 dark:text-amber-200">
                    {planMeta.shutOut.cartons.toLocaleString("en-IN")} pkg ·{" "}
                    {planMeta.shutOut.cbm.toFixed(2)} m³ ·{" "}
                    {planMeta.shutOut.weightKg.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })}{" "}
                    kg won't fit.
                  </p>
                </div>
              )}

              {compliance && (
                <>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Foundation audit
                  </p>
                  <ul className="space-y-1">
                    {compliance.foundationAudit.map((a) => {
                      const clickable =
                        !a.ok && (a.rowIdxs?.length ?? 0) > 0 && !!onJumpToRow;
                      return (
                        <li
                          key={a.code}
                          className={cn(
                            "flex items-start gap-2 rounded px-1 py-0.5",
                            clickable && "cursor-pointer hover:bg-muted/60",
                          )}
                          onClick={() => {
                            if (clickable && a.rowIdxs && a.rowIdxs[0] != null) {
                              onJumpToRow?.(a.rowIdxs[0]);
                              setAuditOpen(false);
                            }
                          }}
                        >
                          <span
                            className={cn(
                              "mt-[1px] inline-block size-3 shrink-0 rounded-full text-center text-[9px] font-bold leading-3 text-white",
                              a.ok ? "bg-emerald-600" : "bg-red-600",
                            )}
                            aria-hidden
                          >
                            {a.ok ? "✓" : "✗"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "font-medium",
                                a.ok
                                  ? "text-foreground"
                                  : "text-red-700 dark:text-red-300",
                              )}
                            >
                              {a.label}
                            </span>
                            {a.detail && (
                              <span className="ml-1 text-muted-foreground">
                                — {a.detail}
                              </span>
                            )}
                            {clickable && (
                              <span className="ml-1 text-[9px] uppercase tracking-wider text-brand-navy/80">
                                · jump
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* Divider */}
        <div className="my-0.5 w-px shrink-0 bg-brand-navy/20" />

        {/* Playback controls */}
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReset}
            className="h-7 w-7 p-0 text-brand-navy hover:bg-brand-navy/10"
            aria-label="Reset to empty"
            title="Reset (empty container)"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onPrev}
            disabled={isEmpty}
            className="h-7 w-7 p-0 text-brand-navy hover:bg-brand-navy/10"
            aria-label="Previous pallet"
            title="Previous pallet"
          >
            <SkipBack className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onPlayPause}
            className={cn(
              "h-7 px-2 text-[11px]",
              isPlaying
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-brand-navy text-white hover:bg-brand-navy/90",
            )}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="size-3" /> : <Play className="size-3" />}
            <span className="ml-1 hidden sm:inline">
              {isPlaying ? "Pause" : atLast ? "Replay" : "Play"}
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onNext}
            disabled={atLast}
            className="h-7 w-7 p-0 text-brand-navy hover:bg-brand-navy/10"
            aria-label="Next pallet"
            title="Next pallet"
          >
            <SkipForward className="size-3.5" />
          </Button>
          <div className="mx-0.5 h-5 w-px bg-brand-navy/20" />
          {([0.5, 1, 2] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              className={cn(
                "h-7 rounded px-1.5 text-[10px] font-bold transition-colors",
                speed === s
                  ? "bg-brand-navy text-white"
                  : "text-brand-navy hover:bg-brand-navy/10",
              )}
              aria-pressed={speed === s}
              title={`${s}× speed`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
