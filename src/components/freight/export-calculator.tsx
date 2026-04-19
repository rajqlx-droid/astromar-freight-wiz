import { useMemo } from "react";
import { Plus, Trash2, Copy as CopyIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
import {
  calcExport,
  emptyExportLine,
  fmt,
  type ExportInput,
} from "@/lib/freight/calculators";
import type { CargoLine } from "@/lib/freight/types";
import { nextId } from "@/lib/freight/ids";
import { CsvImportDialog } from "@/components/freight/csv-import-dialog";
import { CurrencyQuickPick } from "@/components/freight/currency-quick-pick";

interface Props {
  state: ExportInput;
  setState: (v: ExportInput) => void;
}

export function ExportCalculator({ state, setState }: Props) {
  const result = useMemo(() => calcExport(state), [state]);
  const set = (patch: Partial<ExportInput>) => setState({ ...state, ...patch });

  const updateLine = (id: string, patch: Partial<CargoLine>) =>
    set({ lines: state.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  const addLine = () => set({ lines: [...state.lines, emptyExportLine()] });
  const removeLine = (id: string) =>
    set({ lines: state.lines.length > 1 ? state.lines.filter((l) => l.id !== id) : state.lines });
  const dupLine = (id: string) => {
    const src = state.lines.find((l) => l.id === id);
    if (!src) return;
    set({ lines: [...state.lines, { ...src, id: nextId("el") }] });
  };

  const inputsTable = [
    { label: "Currency", value: `${state.currency}${state.fxRate && state.fxRate > 0 ? ` (1 ${state.currency} ≈ ${state.baseCurrency || "INR"} ${fmt(state.fxRate, 4)})` : ""}` },
    { label: "Line Items", value: String(state.lines.length) },
    { label: "Freight", value: `${state.currency}${state.freight}` },
    { label: "Insurance", value: `${state.currency}${state.insurance}` },
    { label: "Other Charges", value: `${state.currency}${state.additional}` },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
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
              id="efx"
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
              <CsvImportDialog mode="export" onImport={(lines) => set({ lines })} />
              <Button size="sm" onClick={addLine} className="text-white" style={{ background: "var(--brand-orange)" }}>
                <Plus className="size-3.5" /> Add line
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {state.lines.map((ln, idx) => {
              const lineCost = ln.qty * ln.unitValue;
              const selling = lineCost * (1 + (ln.margin ?? 0) / 100);
              return (
                <div
                  key={ln.id}
                  className="rounded-lg border p-2"
                  style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 15%, transparent)" }}
                >
                  <div className="mb-1 flex items-center justify-between">
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
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                    <div className="col-span-2 space-y-1 md:col-span-2">
                      <Label className="text-[11px] text-muted-foreground">Description</Label>
                      <Input
                        value={ln.description}
                        onChange={(e) => updateLine(ln.id, { description: e.target.value })}
                        placeholder="e.g. Brass valves"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">HS Code</Label>
                      <Input
                        value={ln.hsCode}
                        onChange={(e) => updateLine(ln.id, { hsCode: e.target.value })}
                        placeholder="7419.99"
                        className="h-9 text-xs"
                      />
                    </div>
                    <NumberField compact id={`eq-${ln.id}`} label="Qty" step={1} value={ln.qty} onChange={(n) => updateLine(ln.id, { qty: Math.max(0, Math.round(n)) })} />
                    <NumberField compact id={`euc-${ln.id}`} label={`Unit Cost (${state.currency})`} value={ln.unitValue} onChange={(n) => updateLine(ln.id, { unitValue: n })} />
                    <NumberField compact id={`em-${ln.id}`} label="Margin %" suffix="%" value={ln.margin ?? 0} onChange={(n) => updateLine(ln.id, { margin: n })} />
                  </div>
                  <div className="mt-1 text-right text-[11px] text-muted-foreground">
                    Cost: <span className="font-semibold text-brand-navy">{state.currency}{fmt(lineCost)}</span>
                    {" • "}Selling (excl. F&I share): <span className="font-semibold text-brand-orange">{state.currency}{fmt(selling)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Shared charges */}
        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <h4 className="mb-2 text-sm font-semibold text-brand-navy">Shared Outbound Charges</h4>
          <p className="mb-2 text-[11px] text-muted-foreground">Allocated across lines by value share.</p>
          <div className="grid grid-cols-3 gap-2">
            <NumberField compact id="ef" label={`Freight (${state.currency})`} required value={state.freight} onChange={(n) => set({ freight: n })} hint="Outbound freight to destination." />
            <NumberField compact id="ei" label={`Insurance (${state.currency})`} value={state.insurance} onChange={(n) => set({ insurance: n })} hint="Premium added to FOB to derive CIF." />
            <NumberField compact id="ea" label={`Other (${state.currency})`} value={state.additional} onChange={(n) => set({ additional: n })} hint="Packaging, handling, documentation." />
          </div>
        </Card>
      </div>
      <ResultsCard result={result} inputsTable={inputsTable} />
    </div>
  );
}
