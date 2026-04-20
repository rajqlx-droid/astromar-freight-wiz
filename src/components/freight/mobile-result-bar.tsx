/**
 * Floating PDF download button — compact circular FAB shown on all viewports.
 * Bottom-right corner, easy access on both mobile and desktop without
 * occupying layout space.
 */
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadResultPdf, type PdfExtras } from "@/lib/freight/pdf";
import type { CalcResult } from "@/lib/freight/types";

interface Props {
  result: CalcResult | null;
  inputsTable?: { label: string; value: string }[];
  /** Optional inline extras (e.g. tool-specific KPI grid + analytics chart). */
  extras?: PdfExtras;
}

export function MobileResultBar({ result, inputsTable, extras }: Props) {
  if (!result) return null;

  const handlePdf = () => {
    downloadResultPdf(result, inputsTable, extras);
    toast.success("PDF downloaded");
  };

  return (
    <button
      type="button"
      onClick={handlePdf}
      aria-label="Download PDF report"
      title="Download PDF report"
      className="no-print fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      style={{
        background: "var(--brand-orange)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <Download className="size-5" />
    </button>
  );
}
