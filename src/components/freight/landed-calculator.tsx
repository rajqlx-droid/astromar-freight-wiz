import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
import { calcLanded, type LandedInput } from "@/lib/freight/calculators";

interface Props {
  state: LandedInput;
  setState: (v: LandedInput) => void;
}

export function LandedCalculator({ state, setState }: Props) {
  const result = useMemo(() => calcLanded(state), [state]);
  const set = (patch: Partial<LandedInput>) => setState({ ...state, ...patch });

  const subtotal = state.product + state.freight + state.insurance + state.additional;
  const duty = subtotal * (state.dutyRate / 100);
  const gst = (subtotal + duty) * (state.gstRate / 100);
  const total = subtotal + duty + gst || 1;
  const bars = [
    { label: "Product + Freight", val: state.product + state.freight, color: "var(--brand-navy)" },
    { label: "Insurance + Add'l", val: state.insurance + state.additional, color: "var(--brand-navy-strong)" },
    { label: "Duty", val: duty, color: "var(--brand-orange)" },
    { label: "GST", val: gst, color: "var(--brand-orange-strong)" },
  ];

  const inputsTable = [
    { label: "Product Cost", value: `${state.currency}${state.product}` },
    { label: "Freight", value: `${state.currency}${state.freight}` },
    { label: "Insurance", value: `${state.currency}${state.insurance}` },
    { label: "Additional", value: `${state.currency}${state.additional}` },
    { label: "Duty Rate", value: `${state.dutyRate}%` },
    { label: "GST Rate", value: `${state.gstRate}%` },
    { label: "Quantity", value: String(state.qty || "—") },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-3">
        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <div className="mb-2 flex items-center gap-2">
            <Label className="text-xs font-semibold text-brand-navy">Currency</Label>
            <Select value={state.currency} onValueChange={(v) => set({ currency: v })}>
              <SelectTrigger className="h-8 w-auto min-w-[120px] border-2 border-brand-navy/30 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="₹">₹ Indian Rupee</SelectItem>
                <SelectItem value="$">$ US Dollar</SelectItem>
                <SelectItem value="€">€ Euro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
            <NumberField compact id="lp" label="Product Cost" required value={state.product} onChange={(n) => set({ product: n })} hint="Invoice value of goods." />
            <NumberField compact id="lf" label="Freight" required value={state.freight} onChange={(n) => set({ freight: n })} hint="Total inward freight charges." />
            <NumberField compact id="li" label="Insurance" value={state.insurance} onChange={(n) => set({ insurance: n })} hint="Marine / cargo insurance premium." />
            <NumberField compact id="ld" label="Duty Rate" suffix="%" value={state.dutyRate} onChange={(n) => set({ dutyRate: n })} hint="BCD rate from your HSN code (default 10%)." />
            <NumberField compact id="lg" label="GST Rate" suffix="%" value={state.gstRate} onChange={(n) => set({ gstRate: n })} hint="IGST rate, typically 5/12/18/28%." />
            <NumberField compact id="la" label="Additional" value={state.additional} onChange={(n) => set({ additional: n })} hint="Port handling, documentation, CFS etc." />
            <NumberField compact id="lq" label="Quantity" step={1} value={state.qty} onChange={(n) => set({ qty: Math.max(0, Math.round(n)) })} hint="Optional — gives per-unit cost." />
          </div>
        </Card>

        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <h4 className="mb-2 text-sm font-semibold text-brand-navy">Cost Breakdown</h4>
          <div className="space-y-2">
            {bars.map((b) => {
              const pct = total > 0 ? (b.val / total) * 100 : 0;
              return (
                <div key={b.label}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className="font-semibold text-brand-navy">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: b.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <ResultsCard result={result} inputsTable={inputsTable} />
    </div>
  );
}
