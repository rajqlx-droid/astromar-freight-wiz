/**
 * Results card with a single primary action: PDF download.
 */
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { downloadResultPdf, type PdfExtras } from "@/lib/freight/pdf";
import type { CalcResult } from "@/lib/freight/types";

interface Props {
  result: CalcResult | null;
  inputsTable?: { label: string; value: string }[];
  onLoadSaved?: () => void;
  /** Optional async resolver for extras (e.g. 3D snapshots). Called at PDF time. */
  resolveExtras?: () => Promise<PdfExtras | undefined> | PdfExtras | undefined;
  /** When set, disables PDF export and shows the reason on hover. CBM calc uses this when packing options aren't confirmed. */
  pdfDisabledReason?: string | null;
}

export function ResultsCard({ result, inputsTable, resolveExtras, pdfDisabledReason }: Props) {
  if (!result) {
    return (
      <Card
        className="flex min-h-[260px] items-center justify-center border-2 border-dashed text-sm text-muted-foreground"
        style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 25%, transparent)" }}
      >
        Enter values on the left to see results.
      </Card>
    );
  }

  const handlePdf = async () => {
    const extras = resolveExtras ? await resolveExtras() : undefined;
    downloadResultPdf(result, inputsTable, extras);
    toast.success("PDF downloaded");
  };

  return (
    <Card
      className="print-area overflow-hidden border-2 shadow-sm"
      style={{
        borderColor: "var(--brand-navy)",
        background:
          "linear-gradient(180deg, var(--brand-navy-soft) 0%, var(--background) 70%)",
      }}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 border-b px-5 py-2.5">
        <h3 className="text-base font-bold text-brand-navy">Results</h3>
        <button
          type="button"
          onClick={handlePdf}
          disabled={!!pdfDisabledReason}
          title={pdfDisabledReason ?? "Download PDF report"}
          aria-label="Download PDF report"
          className="no-print inline-flex h-8 w-8 items-center justify-center rounded-md text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--brand-orange)" }}
        >
          <Download className="size-4" />
        </button>
      </div>

      <div className="divide-y">
        {result.items.map((it) => (
          <div
            key={it.label}
            className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
          >
            <span className="text-muted-foreground">{it.label}</span>
            <span
              key={it.value}
              className={
                "animate-fade-in rounded-md px-3 py-1 font-semibold " +
                (it.highlight
                  ? "bg-brand-orange-soft text-brand-orange"
                  : "text-foreground")
              }
            >
              {it.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
