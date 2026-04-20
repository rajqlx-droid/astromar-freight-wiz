/**
 * Results card with a single primary action: PDF download.
 */
import { Download, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { downloadResultPdf, type PdfExtras } from "@/lib/freight/pdf";
import type { CalcResult } from "@/lib/freight/types";

interface Props {
  result: CalcResult | null;
  inputsTable?: { label: string; value: string }[];
  onLoadSaved?: () => void;
  /** Optional async resolver for extras (e.g. 3D snapshots). Called at PDF time. */
  resolveExtras?: () => Promise<PdfExtras | undefined> | PdfExtras | undefined;
  /** Optional inline extras (e.g. tool-specific KPI grid + analytics chart). Merged with resolveExtras output. */
  extras?: PdfExtras;
  /** When set, disables PDF export and shows the reason on hover. CBM calc uses this when packing options aren't confirmed. */
  pdfDisabledReason?: string | null;
}

export function ResultsCard({ result, inputsTable, resolveExtras, extras, pdfDisabledReason }: Props) {
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
    const resolved = resolveExtras ? await resolveExtras() : undefined;
    const merged: PdfExtras | undefined =
      resolved || extras ? { ...(resolved ?? {}), ...(extras ?? {}) } : undefined;
    downloadResultPdf(result, inputsTable, merged);
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

      {result.notice && (
        <div
          className={
            "print-area flex items-start gap-2.5 border-b px-5 py-2.5 text-xs " +
            (result.notice.tone === "bad"
              ? "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100"
              : result.notice.tone === "info"
                ? "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100")
          }
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold leading-snug">{result.notice.title}</div>
            <div className="leading-snug opacity-90">{result.notice.body}</div>
          </div>
        </div>
      )}

      {extras?.analytics?.kpis && extras.analytics.kpis.length > 0 && (
        <div
          className="print-area grid grid-cols-2 gap-2 border-b px-5 py-3 sm:grid-cols-4"
          aria-label="Key metrics"
        >
          {extras.analytics.kpis.map((kpi) => {
            const toneStyle =
              kpi.tone === "good"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                : kpi.tone === "warn"
                  ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                  : kpi.tone === "bad"
                    ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                    : "border-brand-navy/20 bg-background text-foreground";
            return (
              <div
                key={kpi.label}
                className={
                  "flex flex-col justify-between rounded-lg border px-2.5 py-2 " + toneStyle
                }
              >
                <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                  {kpi.label}
                </div>
                <div className="mt-1 text-sm font-bold leading-tight sm:text-base">
                  {kpi.value}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TooltipProvider delayDuration={150}>
        <div className="divide-y">
          {result.items.map((it) => {
            const toneClass =
              it.tone === "good"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : it.tone === "warn"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  : it.tone === "bad"
                    ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                    : it.highlight
                      ? "bg-brand-orange-soft text-brand-orange"
                      : "text-foreground";
            return (
              <div
                key={it.label}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {it.label}
                  {it.hint && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`About ${it.label}`}
                          className="no-print inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-brand-navy"
                        >
                          <Info className="size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs">
                        {it.hint}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {typeof it.gauge === "number" && <GaugeBar value={it.gauge} />}
                  <span
                    key={it.value}
                    className={"animate-fade-in rounded-md px-3 py-1 font-semibold " + toneClass}
                  >
                    {it.value}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </Card>
  );
}

/**
 * Compact 0–100 gauge: red 0–69, amber 70–84, green 85–100, with a marker
 * dot at the current value. Sits beside the value chip in the results card.
 */
function GaugeBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span
      className="relative inline-block h-1.5 w-16 overflow-hidden rounded-full"
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${clamped.toFixed(0)} percent of capacity`}
    >
      {/* Zone backgrounds */}
      <span className="absolute inset-y-0 left-0 w-[70%] bg-red-200/70 dark:bg-red-900/40" />
      <span className="absolute inset-y-0 left-[70%] w-[15%] bg-amber-200/70 dark:bg-amber-900/40" />
      <span className="absolute inset-y-0 left-[85%] w-[15%] bg-emerald-200/70 dark:bg-emerald-900/40" />
      {/* Marker */}
      <span
        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-foreground shadow"
        style={{ left: `${clamped}%` }}
      />
    </span>
  );
}
