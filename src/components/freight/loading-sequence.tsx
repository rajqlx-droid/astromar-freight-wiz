/**
 * Numbered loading sequence storyboard. Reads the per-item stats from
 * AdvancedPackResult and explains the recommended loading order.
 */
import { ChevronDown, ListOrdered } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";

interface Props {
  pack: AdvancedPackResult;
}

export function LoadingSequence({ pack }: Props) {
  const [open, setOpen] = useState(false);

  // Recommended sequence mirrors packing logic: non-stackable first (back wall, floor),
  // then heaviest, then largest volume, fragile last (top layer).
  const sequence = [...pack.perItem]
    .filter((p) => p.planned > 0 && p.placed > 0)
    .sort((a, b) => {
      if (a.fragile !== b.fragile) return a.fragile ? 1 : -1;
      if (a.stackable !== b.stackable) return a.stackable ? 1 : -1;
      return b.placed - a.placed;
    });

  if (sequence.length === 0) return null;

  return (
    <div
      className="rounded-lg border-2"
      style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 18%, transparent)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ListOrdered className="size-4 text-brand-navy" />
        <span className="text-sm font-semibold text-brand-navy">How to load this container</span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ol className="space-y-2 border-t px-3 py-3">
          {sequence.map((p, idx) => {
            const where = idx === 0 ? "back wall, floor" : p.fragile ? "top layer" : "next layer";
            const note = !p.stackable
              ? "do not stack anything on top"
              : p.fragile
                ? "load last, place gently"
                : "stack tightly";
            // Count rotated units of this item.
            const rotated = pack.placed.filter(
              (b) => b.itemIdx === p.itemIdx && (b.rotated === "sideways" || b.rotated === "axis"),
            );
            const tippedCount = rotated.filter((b) => b.rotated === "axis").length;
            const sidewaysCount = rotated.length - tippedCount;
            return (
              <li key={p.itemId} className="flex items-start gap-3">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow"
                  style={{ background: p.color }}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-semibold text-brand-navy">
                    Item {p.itemIdx + 1}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({p.packageType}, {p.placed} units)
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Place at <strong>{where}</strong> — {note}.
                  </div>
                  {rotated.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-yellow-700 dark:text-yellow-300">
                      ↻ {sidewaysCount > 0 && `${sidewaysCount} unit${sidewaysCount > 1 ? "s" : ""} rotated sideways`}
                      {sidewaysCount > 0 && tippedCount > 0 && ", "}
                      {tippedCount > 0 && `${tippedCount} tipped on side`}
                      {" — orient as shown in 3D view."}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
