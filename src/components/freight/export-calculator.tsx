import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
import { calcExport, type ExportInput } from "@/lib/freight/calculators";

interface Props {
  state: ExportInput;
  setState: (v: ExportInput) => void;
}

export function ExportCalculator({ state, setState }: Props) {
  const result = useMemo(() => calcExport(state), [state]);
  const set = (patch: Partial<ExportInput>) => setState({ ...state, ...patch });

  const marginPct = Math.min(100, Math.max(0, state.margin));

  const inputsTable = [
    { label: "Cost Price", value: `${state.currency}${state.cost}` },
    { label: "Freight", value: `${state.currency}${state.freight}` },
    { label: "Insurance", value: `${state.currency}${state.insurance}` },
    { label: "Additional", value: `${state.currency}${state.additional}` },
    { label: "Margin", value: `${state.margin}%` },
    { label: "Quantity", value: String(state.qty || "—") },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-4">
        <Card className="border-2 p-4" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <div className="mb-3">
            <Label className="text-xs font-semibold text-brand-navy">Currency</Label>
            <Select value={state.currency} onValueChange={(v) => set({ currency: v })}>
              <SelectTrigger className="mt-1.5 h-10 border-2 border-brand-navy/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="₹">₹ Indian Rupee</SelectItem>
                <SelectItem value="$">$ US Dollar</SelectItem>
                <SelectItem value="€">€ Euro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberField id="ec" label="Cost Price" required value={state.cost} onChange={(n) => set({ cost: n })} hint="Your COGS for the export shipment." />
            <NumberField id="ef" label="Freight" required value={state.freight} onChange={(n) => set({ freight: n })} hint="Outbound freight to destination." />
            <NumberField id="ei" label="Insurance" value={state.insurance} onChange={(n) => set({ insurance: n })} hint="Premium added to FOB to derive CIF." />
            <NumberField id="em" label="Margin" suffix="%" required value={state.margin} onChange={(n) => set({ margin: n })} hint="Markup over CIF you want to charge." />
            <NumberField id="ea" label="Additional" value={state.additional} onChange={(n) => set({ additional: n })} hint="Packaging, handling, documentation." />
            <NumberField id="eq" label="Quantity" step={1} value={state.qty} onChange={(n) => set({ qty: Math.max(0, Math.round(n)) })} hint="Optional — derives per-unit selling price." />
          </div>
        </Card>

        <Card className="border-2 p-4" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-brand-navy">Margin</span>
            <span className="font-semibold text-brand-orange">{marginPct.toFixed(1)}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${marginPct}%`,
                background: "linear-gradient(90deg, var(--brand-orange), var(--brand-orange-strong))",
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Healthy export margins typically sit between 15–35% depending on category and incoterm.
          </p>
        </Card>
      </div>
      <ResultsCard result={result} inputsTable={inputsTable} />
    </div>
  );
}
