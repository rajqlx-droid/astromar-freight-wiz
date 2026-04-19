/**
 * Sticky bottom bar shown on mobile only:
 * - Headline result at-a-glance
 * - Tap to expand into the full ResultsCard via a Sheet
 * - Single PDF action button
 */
import { useState } from "react";
import { ChevronUp, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { downloadResultPdf } from "@/lib/freight/pdf";
import type { CalcResult } from "@/lib/freight/types";

interface Props {
  result: CalcResult | null;
  inputsTable?: { label: string; value: string }[];
}

export function MobileResultBar({ result, inputsTable }: Props) {
  const [open, setOpen] = useState(false);

  if (!result) return null;
  const headline = result.items.find((i) => i.highlight) ?? result.items[0];

  const handlePdf = () => {
    downloadResultPdf(result, inputsTable);
    toast.success("PDF downloaded");
  };

  return (
    <>
      <div
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t-2 bg-background/95 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden"
        style={{ borderTopColor: "var(--brand-orange)", paddingBottom: "env(safe-area-inset-bottom)" }}
        role="region"
        aria-label="Calculation result actions"
      >
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left active:bg-brand-navy-soft"
              aria-label="Show full results"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {headline.label}
                </div>
                <div
                  key={headline.value}
                  className="animate-fade-in truncate text-base font-bold text-brand-navy"
                  aria-live="polite"
                >
                  {headline.value}
                </div>
              </div>
              <ChevronUp className="size-5 shrink-0 text-brand-orange" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle className="text-brand-navy">{result.title}</SheetTitle>
            </SheetHeader>
            <div className="divide-y">
              {result.items.map((it) => (
                <div key={it.label} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="text-muted-foreground">{it.label}</span>
                  <span
                    className={
                      "rounded-md px-3 py-1 font-semibold " +
                      (it.highlight ? "bg-brand-orange-soft text-brand-orange" : "text-foreground")
                    }
                  >
                    {it.value}
                  </span>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        <div className="border-t px-3 py-2">
          <Button
            size="sm"
            onClick={handlePdf}
            className="h-10 w-full text-white shadow-sm"
            style={{ background: "var(--brand-orange)" }}
          >
            <Download className="size-4" />
            <span className="text-sm font-semibold">Download PDF</span>
          </Button>
        </div>
      </div>

      {/* spacer to prevent the mobile action bar from covering page bottom */}
      <div aria-hidden className="h-28 lg:hidden" />
    </>
  );
}
