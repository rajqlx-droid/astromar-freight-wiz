/**
 * Loader HUD — persistent overlay that tells the dock loader EXACTLY what
 * the next pallet is, where it goes, what to do with it, and what to watch
 * out for. Renders inside the 3D viewer (top-left).
 */
import { Pause, Play, SkipBack, SkipForward, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PalletStep } from "@/lib/freight/loading-rows";

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
  showForklift: boolean;
  onToggleForklift: () => void;
}

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
  showForklift,
  onToggleForklift,
}: Props) {
  const isEmpty = currentIdx < 0 || !step;
  const atLast = currentIdx >= totalSteps - 1;

  return (
    <div className="pointer-events-auto absolute right-2 top-44 z-10 w-[240px] max-w-[55vw] space-y-2">
      {/* Instruction card */}
      <div className="rounded-lg border-2 border-brand-navy/60 bg-background/95 p-2.5 shadow-xl backdrop-blur">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="rounded-full bg-brand-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {isEmpty ? "Ready" : `Pallet ${currentIdx + 1} / ${totalSteps}`}
          </span>
          {step && (
            <span className="text-[10px] font-medium text-muted-foreground">
              Row {step.rowIdx + 1} · step {step.stepInRow}
            </span>
          )}
        </div>
        {isEmpty ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-brand-navy">Container empty.</p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Press ▶ or ⏭ to load the first pallet against the back wall.
            </p>
          </div>
        ) : (
          <>
            <div className="text-xs font-bold leading-tight text-brand-navy">
              {step.action}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-foreground">
              {step.itemLabel}
              <span className="ml-1 font-normal text-muted-foreground">
                — {step.dimsLabel}
              </span>
            </div>
            <div className="mt-1 text-[11px] capitalize leading-snug text-muted-foreground">
              📍 {step.positionText}
            </div>
            {step.warnings.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 border-t border-amber-500/30 pt-1.5">
                {step.warnings.map((w, i) => (
                  <li key={i} className="text-[10.5px] font-medium leading-snug text-amber-700 dark:text-amber-300">
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Playback bar */}
      <div className="flex items-center gap-1 rounded-lg border border-brand-navy/30 bg-background/95 p-1 shadow backdrop-blur">
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
          <span className="ml-1">{isPlaying ? "Pause" : atLast ? "Replay" : "Play"}</span>
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
        <div className="mx-1 h-5 w-px bg-brand-navy/20" />
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
        <div className="mx-1 h-5 w-px bg-brand-navy/20" />
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
  );
}
