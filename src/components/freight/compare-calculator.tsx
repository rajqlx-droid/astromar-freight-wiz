import { useMemo } from "react";
import { Ship, Plane } from "lucide-react";
import { Card } from "@/components/ui/card";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
import { calcCompare, type CompareInput } from "@/lib/freight/calculators";

interface Props {
  state: CompareInput;
  setState: (v: CompareInput) => void;
}

export function CompareCalculator({ state, setState }: Props) {
  const result = useMemo(() => calcCompare(state), [state]);
  const set = (patch: Partial<CompareInput>) => setState({ ...state, ...patch });

  const seaInterest = state.productValue * (state.dailyRate / 100) * state.seaDays;
  const airInterest = state.productValue * (state.dailyRate / 100) * state.airDays;
  const seaTotal = state.seaFreight + seaInterest + state.handling;
  const airTotal = state.airFreight + airInterest + state.handling;
  const max = Math.max(seaTotal, airTotal, 1);

  const inputsTable = [
    { label: "Sea Freight / Days", value: `₹${state.seaFreight} / ${state.seaDays}` },
    { label: "Air Freight / Days", value: `₹${state.airFreight} / ${state.airDays}` },
    { label: "Daily Interest Rate", value: `${state.dailyRate}%` },
    { label: "Product Value", value: `₹${state.productValue}` },
    { label: "Handling", value: `₹${state.handling}` },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="border-2 p-3" style={{ borderColor: "var(--brand-navy)" }}>
            <div className="mb-2 flex items-center gap-2">
              <Ship className="size-4 text-brand-orange" />
              <h4 className="text-sm font-semibold text-brand-navy">Sea Freight</h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField compact id="sf" label="Cost" suffix="₹" required value={state.seaFreight} onChange={(n) => set({ seaFreight: n })} />
              <NumberField compact id="sd" label="Transit" suffix="days" required step={1} value={state.seaDays} onChange={(n) => set({ seaDays: Math.max(0, Math.round(n)) })} />
            </div>
            <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Working capital cost</span><span className="font-semibold">₹{seaInterest.toFixed(0)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold text-brand-navy">₹{seaTotal.toFixed(0)}</span></div>
            </div>
          </Card>

          <Card className="border-2 p-3" style={{ borderColor: "var(--brand-orange)" }}>
            <div className="mb-2 flex items-center gap-2">
              <Plane className="size-4 text-brand-orange" />
              <h4 className="text-sm font-semibold text-brand-navy">Air Freight</h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField compact id="af" label="Cost" suffix="₹" required value={state.airFreight} onChange={(n) => set({ airFreight: n })} />
              <NumberField compact id="ad" label="Transit" suffix="days" required step={1} value={state.airDays} onChange={(n) => set({ airDays: Math.max(0, Math.round(n)) })} />
            </div>
            <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Working capital cost</span><span className="font-semibold">₹{airInterest.toFixed(0)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold text-brand-navy">₹{airTotal.toFixed(0)}</span></div>
            </div>
          </Card>
        </div>

        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <h4 className="mb-2 text-sm font-semibold text-brand-navy">Financing & Cargo</h4>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <NumberField compact id="dr" label="Daily Interest" suffix="%" value={state.dailyRate} onChange={(n) => set({ dailyRate: n })} hint="Daily working-capital cost as % of product value (e.g. 0.05% = ~18% pa)." />
            <NumberField compact id="pv" label="Product Value" suffix="₹" required value={state.productValue} onChange={(n) => set({ productValue: n })} hint="Invoice value of the cargo." />
            <NumberField compact id="hd" label="Handling" suffix="₹" value={state.handling} onChange={(n) => set({ handling: n })} hint="Common port/CFS charges in both modes." />
          </div>
        </Card>

        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <h4 className="mb-2 text-sm font-semibold text-brand-navy">Visual comparison</h4>
          {[
            { label: "Sea total", v: seaTotal, color: "var(--brand-navy)" },
            { label: "Air total", v: airTotal, color: "var(--brand-orange)" },
          ].map((b) => (
            <div key={b.label} className="mb-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="font-semibold">₹{b.v.toFixed(0)}</span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-all" style={{ width: `${(b.v / max) * 100}%`, background: b.color }} />
              </div>
            </div>
          ))}
        </Card>
      </div>
      <ResultsCard result={result} inputsTable={inputsTable} />
    </div>
  );
}
