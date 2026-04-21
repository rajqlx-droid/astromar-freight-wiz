/**
 * Loader HUD — slim instruction + playback bar pinned to the bottom-center of
 * the 3D viewer. Empty state collapses to a one-liner so it never blocks the
 * container interior.
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
    <div className="pointer-events-auto absolute bottom-2 left-1/2 z-10 -translate-x-1/2 max-w-[min(620px,92%)]">
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
