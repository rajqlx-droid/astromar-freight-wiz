/**
 * Compact strip showing the last 3 SAVED calculations for the active calculator
 * type. Click a chip to load it back into the calculator.
 *
 * Lives above the input panel so users can recall recent work without opening
 * the History sheet.
 */
import { useEffect, useState } from "react";
import { History as HistoryIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { savedStore } from "@/lib/freight/storage";
import type { CalcKey, SavedCalculation } from "@/lib/freight/types";

interface Props {
  /** Active calculator key — strip filters saves to this type. */
  type: CalcKey;
  /** Called when the user clicks a chip; receives the full saved record. */
  onLoad: (entry: SavedCalculation) => void;
  /** Optional: opens the full History sheet. */
  onOpenFullHistory?: () => void;
}

export function MiniHistoryStrip({ type, onLoad, onOpenFullHistory }: Props) {
  const [items, setItems] = useState<SavedCalculation[]>([]);

  useEffect(() => {
    const refresh = () =>
      setItems(savedStore.list().filter((s) => s.type === type).slice(0, 3));
    refresh();
    window.addEventListener("freight:storage", refresh);
    return () => window.removeEventListener("freight:storage", refresh);
  }, [type]);

  if (items.length === 0) return null;

  const formatTime = (ts: number) => {
    const diffMs = Date.now() - ts;
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString("en-IN");
  };

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border-2 border-dashed bg-card/50 px-3 py-2"
      style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 18%, transparent)" }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <HistoryIcon className="size-3.5 text-brand-orange" />
        <span>Recent saves</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((entry) => {
          const headline =
            entry.result.items.find((i) => i.highlight) ?? entry.result.items[0];
          const label = entry.name.length > 22 ? entry.name.slice(0, 20) + "…" : entry.name;
          return (
            <Tooltip key={entry.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onLoad(entry)}
                  className="group inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-brand-navy/25 bg-background px-2.5 py-1 text-[11px] font-medium text-brand-navy transition-colors hover:border-brand-orange hover:bg-brand-orange-soft"
                >
                  <span className="truncate">{label}</span>
                  {headline && (
                    <span className="shrink-0 text-[10px] font-semibold text-brand-orange">
                      {headline.value}
                    </span>
                  )}
                  <span className="shrink-0 text-[10px] text-muted-foreground group-hover:text-brand-navy">
                    · {formatTime(entry.savedAt)}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <div className="font-semibold">{entry.name}</div>
                <div className="text-muted-foreground">
                  Click to load back into the calculator.
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {onOpenFullHistory && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onOpenFullHistory}
          className="ml-auto h-7 px-2 text-[11px] text-muted-foreground hover:text-brand-navy"
        >
          See all
        </Button>
      )}
    </div>
  );
}
