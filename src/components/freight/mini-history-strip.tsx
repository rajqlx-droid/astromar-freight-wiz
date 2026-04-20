/**
 * Compact strip showing the last 3 SAVED calculations for the active calculator
 * type. Hovering / clicking a chip reveals the headline + a few key fields,
 * plus a button to open the full History sheet.
 *
 * Lives above the input panel so users get one-glance recall without opening
 * the History drawer.
 */
import { useEffect, useState } from "react";
import { History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { savedStore } from "@/lib/freight/storage";
import type { CalcKey, SavedCalculation } from "@/lib/freight/types";

interface Props {
  /** Active calculator key — strip filters saves to this type. */
  type: CalcKey;
  /** Optional: open the full History sheet. */
  onOpenFullHistory?: () => void;
  /** Visual variant. "block" = standalone dashed banner, "inline" = compact, borderless inline group. */
  variant?: "block" | "inline";
}

function formatTime(ts: number) {
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-IN");
}

export function MiniHistoryStrip({ type, onOpenFullHistory, variant = "block" }: Props) {
  const [items, setItems] = useState<SavedCalculation[]>([]);

  useEffect(() => {
    const refresh = () =>
      setItems(savedStore.list().filter((s) => s.type === type).slice(0, 3));
    refresh();
    window.addEventListener("freight:storage", refresh);
    return () => window.removeEventListener("freight:storage", refresh);
  }, [type]);

  if (items.length === 0) return null;

  const isInline = variant === "inline";

  const wrapperClass = isInline
    ? "flex flex-wrap items-center justify-end gap-1.5"
    : "mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border-2 border-dashed bg-card/50 px-3 py-2";

  const wrapperStyle = isInline
    ? undefined
    : { borderColor: "color-mix(in oklab, var(--brand-navy) 18%, transparent)" };

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <HistoryIcon className="size-3.5 text-brand-orange" />
        {!isInline && <span>Recent saves</span>}
        {isInline && <span className="normal-case tracking-normal">Recent:</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((entry) => {
          const headline =
            entry.result.items.find((i) => i.highlight) ?? entry.result.items[0];
          const label =
            entry.name.length > 22 ? entry.name.slice(0, 20) + "…" : entry.name;
          return (
            <Popover key={entry.id}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={
                    "group inline-flex items-center gap-1.5 rounded-full border border-brand-navy/25 bg-background font-medium text-brand-navy transition-colors hover:border-brand-orange hover:bg-brand-orange-soft " +
                    (isInline
                      ? "max-w-[180px] px-2 py-0.5 text-[10px]"
                      : "max-w-[260px] px-2.5 py-1 text-[11px]")
                  }
                >
                  <span className="truncate">{label}</span>
                  {headline && (
                    <span className="shrink-0 text-[10px] font-semibold text-brand-orange">
                      {headline.value}
                    </span>
                  )}
                  {!isInline && (
                    <span className="shrink-0 text-[10px] text-muted-foreground group-hover:text-brand-navy">
                      · {formatTime(entry.savedAt)}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[min(320px,calc(100vw-2rem))] p-3"
              >
                <div className="mb-2">
                  <div className="text-xs font-bold text-brand-navy">{entry.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {entry.result.title} · saved{" "}
                    {new Date(entry.savedAt).toLocaleString("en-IN")}
                  </div>
                </div>
                <ul className="divide-y rounded-md border bg-background">
                  {entry.result.items.slice(0, 5).map((it) => (
                    <li
                      key={it.label}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]"
                    >
                      <span className="truncate text-muted-foreground">{it.label}</span>
                      <span
                        className={
                          "shrink-0 font-semibold " +
                          (it.highlight ? "text-brand-orange" : "text-foreground")
                        }
                      >
                        {it.value}
                      </span>
                    </li>
                  ))}
                  {entry.result.items.length > 5 && (
                    <li className="px-2.5 py-1.5 text-center text-[10px] text-muted-foreground">
                      + {entry.result.items.length - 5} more in full History
                    </li>
                  )}
                </ul>
                {onOpenFullHistory && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onOpenFullHistory}
                    className="mt-2 h-7 w-full border-brand-navy text-[11px] text-brand-navy"
                  >
                    Open full History
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {onOpenFullHistory && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onOpenFullHistory}
          className={
            isInline
              ? "h-6 px-1.5 text-[10px] text-muted-foreground hover:text-brand-navy"
              : "ml-auto h-7 px-2 text-[11px] text-muted-foreground hover:text-brand-navy"
          }
        >
          See all
        </Button>
      )}
    </div>
  );
}
