/**
 * Loader HUD — slim instruction + playback bar pinned to the bottom-center of
 * the 3D viewer. Empty state collapses to a one-liner so it never blocks the
 * container interior.
 */
import { useState } from "react";
import { Pause, Play, SkipBack, SkipForward, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  /**
   * Optional optimiser metadata. When provided, the HUD uses meta.allLegal +
   * meta.shutOut to drive the badge state instead of relying solely on the
   * recomputed compliance score:
   *   - allLegal && no shut-out → GREEN "READY TO LOAD"
   *   - allLegal && shut-out > 0 → AMBER "MAX LOADED · SHUT-OUT REPORT"
   *   - !allLegal → RED "EXPORT BLOCKED" with the optimiser's hard violations
   */
  planMeta?: BestPlanMeta | null;
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
  // Prefer optimiser meta when available (single source of truth, matches
  // the picker's verdict). Fall back to compliance.status for legacy
  // callers that don't pass planMeta.
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
      label = "EXPORT BLOCKED";
    } else if (hasShutOut) {
      state = "AMBER";
      label = "MAX LOADED · SHUT-OUT";
    } else {
      state = "GREEN";
      label = "READY TO LOAD";
    }
  } else if (compliance) {
    state =
      compliance.status === "GREEN"
        ? "GREEN"
        : compliance.status === "YELLOW"
          ? "AMBER"
          : "RED";
    label =
      state === "GREEN"
        ? "COMPLIANT ✓"
        : state === "AMBER"
          ? "REVIEW REQUIRED"
          : "VIOLATIONS ✗";
  } else {
    state = "GREEN";
    label = "READY";
  }

  const stateColor =
    state === "GREEN" ? "#22c55e" : state === "AMBER" ? "#f59e0b" : "#ef4444";
  const [auditOpen, setAuditOpen] = useState(false);
  const failedAudits = compliance?.foundationAudit.filter((a) => !a.ok).length ?? 0;

  return (
    <div className="pointer-events-auto absolute bottom-2 left-1/2 z-10 -translate-x-1/2 max-w-[min(620px,92%)]">
      {(compliance || planMeta) && (
        <div
          className="mb-1.5 flex items-center justify-center gap-2 rounded-full border bg-background/95 px-3 py-1 text-[10px] font-bold shadow backdrop-blur"
          style={{ borderColor: stateColor, color: stateColor }}
        >
          {compliance && <span className="text-sm">{compliance.score}</span>}
          <span className="uppercase tracking-wide">{label}</span>
          {state === "AMBER" && hasShutOut && planMeta?.shutOut && (
            <span className="opacity-90">
              · {planMeta.shutOut.cartons} pkg / {planMeta.shutOut.cbm.toFixed(2)} m³ left
            </span>
          )}
          <button
            type="button"
            onClick={() => setAuditOpen((v) => !v)}
            className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-current/30 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider hover:bg-current/10"
            aria-expanded={auditOpen}
            title="Foundation audit"
          >
            Audit
            {failedAudits > 0 && (
              <span className="ml-0.5 rounded-full bg-current/20 px-1 text-[9px]">{failedAudits}</span>
            )}
            {auditOpen ? <ChevronDown className="size-2.5" /> : <ChevronUp className="size-2.5" />}
          </button>
        </div>
      )}
      {auditOpen && (compliance || planMeta) && (
        <div className="mb-1.5 rounded-lg border bg-background/95 px-3 py-2 text-[11px] shadow backdrop-blur">
          {state === "RED" && planMeta?.hardViolations && planMeta.hardViolations.length > 0 && (
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
                {planMeta.shutOut.cartons.toLocaleString("en-IN")} pkg · {planMeta.shutOut.cbm.toFixed(2)} m³ ·{" "}
                {planMeta.shutOut.weightKg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg won't fit.
              </p>
            </div>
          )}
          {compliance && (
            <>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Foundation Audit
              </p>
              <ul className="space-y-1">
                {compliance.foundationAudit.map((a) => {
                  const clickable = !a.ok && (a.rowIdxs?.length ?? 0) > 0 && !!onJumpToRow;
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
                        <span className={cn("font-medium", a.ok ? "text-foreground" : "text-red-700 dark:text-red-300")}>
                          {a.label}
                        </span>
                        {a.detail && (
                          <span className="ml-1 text-muted-foreground">— {a.detail}</span>
                        )}
                        {clickable && (
                          <span className="ml-1 text-[9px] uppercase tracking-wider text-brand-navy/80">
                            · jump to row
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
      <div className="flex items-stretch gap-2 rounded-full border-2 border-brand-navy/60 bg-background/95 px-2 py-1.5 shadow-xl backdrop-blur">
        {/* Instruction block */}
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
          <span className="shrink-0 rounded-full bg-brand-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {isEmpty ? "Ready" : `${currentIdx + 1}/${totalSteps}`}
          </span>
          {isEmpty ? (
            <p className="truncate text-[11px] font-medium text-brand-navy">
              Press ▶ to load the first pallet
            </p>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold leading-tight text-brand-navy">
                {step.action}
              </p>
              <p className="truncate text-[10px] leading-tight text-muted-foreground">
                {step.itemLabel} · {step.dimsLabel} · 📍 {step.positionText}
                {step.warnings.length > 0 && (
                  <span className="ml-1 font-medium text-amber-700 dark:text-amber-300">
                    · ⚠ {step.warnings[0]}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

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
          <div className="mx-0.5 h-5 w-px bg-brand-navy/20" />
          <button
            type="button"
            onClick={onToggleForklift}
            className={cn(
              "h-7 rounded px-1.5 text-[10px] font-semibold transition-colors",
              showForklift
                ? "bg-amber-500 text-black"
                : "text-brand-navy hover:bg-brand-navy/10",
            )}
            aria-pressed={showForklift}
            title="Toggle forklift token"
          >
            🚜
          </button>
        </div>
      </div>
    </div>
  );
}
