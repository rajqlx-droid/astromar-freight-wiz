import { useMemo } from "react";
import { Plus, Trash2, Copy as CopyIcon, ArrowRightLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
import {
  calcLanded,
  emptyLandedLine,
  fmt,
  type LandedInput,
} from "@/lib/freight/calculators";
import type { CargoLine } from "@/lib/freight/types";
import { nextId } from "@/lib/freight/ids";
import { CsvImportDialog } from "@/components/freight/csv-import-dialog";
import { CurrencyQuickPick } from "@/components/freight/currency-quick-pick";

interface Props {
  state: LandedInput;
  setState: (v: LandedInput) => void;
  /** Optional callback to copy line items into the Export Price calculator. */
  onDuplicateToExport?: () => void;
}

export function LandedCalculator({ state, setState, onDuplicateToExport }: Props) {
  const result = useMemo(() => calcLanded(state), [state]);
  const set = (patch: Partial<LandedInput>) => setState({ ...state, ...patch });

  const updateLine = (id: string, patch: Partial<CargoLine>) =>
    set({ lines: state.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  const addLine = () => set({ lines: [...state.lines, emptyLandedLine()] });
  const removeLine = (id: string) =>
    set({ lines: state.lines.length > 1 ? state.lines.filter((l) => l.id !== id) : state.lines });
  const dupLine = (id: string) => {
    const src = state.lines.find((l) => l.id === id);
    if (!src) return;
    set({ lines: [...state.lines, { ...src, id: nextId("ll") }] });
  };

  const inputsTable = [
    { label: "Currency", value: `${state.currency}${state.fxRate && state.fxRate > 0 ? ` (1 ${state.currency} ~ ${state.baseCurrency || "INR"} ${fmt(state.fxRate, 4)})` : ""}` },
    { label: "Line Items", value: String(state.lines.length) },
    { label: "Freight", value: `${state.currency}${state.freight}` },
    { label: "Insurance", value: `${state.currency}${state.insurance}` },
    { label: "Other Charges", value: `${state.currency}${state.additional}` },
    { label: "GST / VAT Rate", value: `${state.gstRate}%` },
  ];

  // Analytics — KPI tiles + landed cost composition stacked bar.
  const pdfExtras = useMemo<import("@/lib/freight/pdf").PdfExtras>(() => {
    const goodsValue = state.lines.reduce((a, l) => a + l.qty * l.unitValue, 0);
    const totalDuty = state.lines.reduce(
      (a, l) => a + l.qty * l.unitValue * ((l.dutyRate ?? 0) / 100),
      0,
    );
    const fAndI = state.freight + state.insurance + state.additional;
    const cif = goodsValue + fAndI;
    const gst = (cif + totalDuty) * (state.gstRate / 100);
    const total = cif + totalDuty + gst;
    const cur = state.currency;
    const fmtMoney = (n: number) =>
      `${cur}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    return {
      analytics: {
        kpis: [
          { label: "Goods Value", value: fmtMoney(goodsValue) },
          { label: "Total Duty", value: fmtMoney(totalDuty) },
          { label: `${state.gstRate}% GST/VAT`, value: fmtMoney(gst) },
          { label: "Total Landed", value: fmtMoney(total), tone: "warn" },
        ],
        breakdown: {
          title: `Landed cost composition (${cur}) — share of ${fmtMoney(total)}`,
          segments: [
            { label: "Goods", value: goodsValue, color: [27, 58, 107] },
            { label: "Freight + Ins + Other", value: fAndI, color: [56, 142, 200] },
            { label: "Duty", value: totalDuty, color: [249, 115, 22] },
            { label: "GST / VAT", value: gst, color: [217, 70, 70] },
          ],
        },
      },
    };
  }, [state]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-3">
        {/* Currency + FX */}
        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="col-span-2 space-y-1 md:col-span-2">
              <Label className="text-xs font-semibold text-brand-navy">Currency Code</Label>
              <Input
                value={state.currency}
                onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 5) })}
                placeholder="USD, EUR, INR…"
                className="h-9 border-2 border-brand-navy/30 text-sm uppercase"
              />
              <CurrencyQuickPick value={state.currency} onChange={(c) => set({ currency: c })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-brand-navy">Base Currency</Label>
              <Input
                value={state.baseCurrency ?? "INR"}
                onChange={(e) => set({ baseCurrency: e.target.value.toUpperCase().slice(0, 5) })}
                placeholder="INR"
                className="h-9 border-2 border-brand-navy/30 text-sm uppercase"
              />
            </div>
            <NumberField
              compact
              id="lfx"
              label={`FX Rate (1 ${state.currency || "—"} → ${state.baseCurrency || "INR"})`}
              value={state.fxRate ?? 0}
              onChange={(n) => set({ fxRate: n })}
              hint="Manual exchange rate. Leave 0 to skip the conversion hint."
            />
          </div>
        </Card>

        {/* Line items */}
        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-brand-navy">Cargo Line Items</h4>
            <div className="flex flex-wrap gap-2">
              <CsvImportDialog mode="landed" onImport={(lines) => set({ lines })} />
              {onDuplicateToExport && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDuplicateToExport}
                  className="border-brand-navy text-brand-navy"
                  title="Copy these line items into the Export Price calculator with default 20% margin"
                >
                  <ArrowRightLeft className="size-3.5" /> Duplicate as Export quote
                </Button>
              )}
              <Button size="sm" onClick={addLine} className="text-white" style={{ background: "var(--brand-orange)" }}>
                <Plus className="size-3.5" /> Add line
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {state.lines.map((ln, idx) => (
              <div
                key={ln.id}
                className="rounded-lg border p-2"
                style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 15%, transparent)" }}
              >
                <div className="mb-1 flex min-h-7 items-center justify-between">
                  <span className="text-[11px] font-semibold text-brand-navy">Line {idx + 1}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => dupLine(ln.id)} title="Duplicate">
                      <CopyIcon className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive"
                      onClick={() => removeLine(ln.id)}
                      disabled={state.lines.length === 1}
                      title="Remove"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                  <div className="col-span-2 space-y-1 md:col-span-2">
                    <Label className="text-[11px] text-muted-foreground">Description</Label>
                    <Input
                      value={ln.description}
                      onChange={(e) => updateLine(ln.id, { description: e.target.value })}
                      placeholder="e.g. Cotton T-shirts"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">HS Code</Label>
                    <Input
                      value={ln.hsCode}
                      onChange={(e) => updateLine(ln.id, { hsCode: e.target.value })}
                      placeholder="6109.10"
                      className="h-9 text-xs"
                    />
                  </div>
                  <NumberField compact steppers={false} id={`lq-${ln.id}`} label="Qty" step={1} value={ln.qty} onChange={(n) => updateLine(ln.id, { qty: Math.max(0, Math.round(n)) })} />
                  <div className="col-span-2 md:col-span-2">
                    <NumberField compact steppers={false} id={`luv-${ln.id}`} label={`Unit Value (${state.currency})`} value={ln.unitValue} onChange={(n) => updateLine(ln.id, { unitValue: n })} />
                  </div>
                  <div className="col-span-2 md:col-span-2 lg:col-span-1">
                    <NumberField compact steppers={false} id={`ldr-${ln.id}`} label="Duty %" suffix="%" value={ln.dutyRate ?? 0} onChange={(n) => updateLine(ln.id, { dutyRate: n })} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                  <span className="rounded bg-brand-navy-soft/40 px-2 py-0.5">
                    Subtotal: <span className="font-semibold text-brand-navy">{state.currency}{fmt(ln.qty * ln.unitValue)}</span>
                  </span>
                  <span className="rounded bg-brand-navy-soft/40 px-2 py-0.5">
                    Duty: <span className="font-semibold text-brand-orange">{state.currency}{fmt(ln.qty * ln.unitValue * ((ln.dutyRate ?? 0) / 100))}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Shared charges */}
        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <h4 className="mb-2 text-sm font-semibold text-brand-navy">Shared Charges</h4>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <NumberField compact id="lf" label={`Freight (${state.currency})`} required value={state.freight} onChange={(n) => set({ freight: n })} hint="Total inward freight." />
            <NumberField compact id="li" label={`Insurance (${state.currency})`} value={state.insurance} onChange={(n) => set({ insurance: n })} hint="Marine / cargo insurance premium." />
            <NumberField compact id="la" label={`Other (${state.currency})`} value={state.additional} onChange={(n) => set({ additional: n })} hint="Port handling, documentation, CFS etc." />
            <NumberField compact id="lg" label="GST / VAT %" suffix="%" value={state.gstRate} onChange={(n) => set({ gstRate: n })} hint="Destination tax on (CIF + Duty)." />
          </div>
        </Card>
      </div>
      <div className="xl:sticky xl:top-[140px] xl:self-start">
        <ResultsCard result={result} inputsTable={inputsTable} extras={pdfExtras} />
      </div>
    </div>
  );
}
