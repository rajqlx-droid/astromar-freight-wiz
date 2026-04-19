import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
import { calcRisk, type RiskInput } from "@/lib/freight/calculators";

interface Props {
  state: RiskInput;
  setState: (v: RiskInput) => void;
}

const CARGOS = ["General", "Perishable", "Hazardous", "Machinery", "Textiles", "Electronics"];
const CONTAINERS = ["20ft", "40ft", "40ft HC", "Reefer 20ft", "Reefer 40ft"];

export function RiskCalculator({ state, setState }: Props) {
  const result = useMemo(() => calcRisk(state), [state]);
  const set = (patch: Partial<RiskInput>) => setState({ ...state, ...patch });

  const risk = result.items.find((i) => i.label === "Risk Level")?.value ?? "Low";
  const riskColor =
    risk === "High" ? "var(--destructive)" : risk === "Medium" ? "var(--brand-orange)" : "var(--brand-navy)";

  const inputsTable = [
    { label: "Container", value: state.containerType },
    { label: "Port", value: state.port },
    { label: "Cargo", value: state.cargoType },
    { label: "Days at Port", value: String(state.daysAtPort) },
    { label: "Free Days", value: String(state.freeDays) },
    { label: "Daily Rate", value: `₹${state.dailyRate}` },
    { label: "Goods Value", value: `₹${state.goodsValue}` },
    { label: "Insurance Coverage", value: `₹${state.insurance}` },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-3">
        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-brand-navy">Container Type</Label>
              <Select value={state.containerType} onValueChange={(v) => set({ containerType: v })}>
                <SelectTrigger className="h-10 border-2 border-brand-navy/30"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTAINERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-brand-navy">Port</Label>
              <Input
                value={state.port}
                onChange={(e) => set({ port: e.target.value })}
                placeholder="Enter port name (e.g. Chennai, Shanghai, Rotterdam)"
                className="h-10 border-2 border-brand-navy/30 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-brand-navy">Cargo Type</Label>
              <Select value={state.cargoType} onValueChange={(v) => set({ cargoType: v })}>
                <SelectTrigger className="h-10 border-2 border-brand-navy/30"><SelectValue /></SelectTrigger>
                <SelectContent>{CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <NumberField compact id="rd" label="Days at Port" required step={1} value={state.daysAtPort} onChange={(n) => set({ daysAtPort: Math.max(0, Math.round(n)) })} hint="Total days the container has been at the port." />
            <NumberField compact id="rfd" label="Free Days" step={1} value={state.freeDays} onChange={(n) => set({ freeDays: Math.max(0, Math.round(n)) })} hint="Grace period offered by the shipping line / port (typical: 5)." />
            <NumberField compact id="rrate" label="Daily Rate" suffix="₹/day" required value={state.dailyRate} onChange={(n) => set({ dailyRate: n })} hint="Demurrage rate per day per container." />
            <NumberField compact id="rgv" label="Goods Value" suffix="₹" required value={state.goodsValue} onChange={(n) => set({ goodsValue: n })} hint="Invoice value of cargo." />
            <NumberField compact id="rin" label="Insurance" suffix="₹" value={state.insurance} onChange={(n) => set({ insurance: n })} hint="Insured amount; gap is your exposure." />
          </div>
        </Card>

        <div
          className="rounded-xl border-2 p-4 text-white"
          style={{ background: riskColor, borderColor: riskColor }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Risk Level</div>
          <div className="mt-1 text-2xl font-bold">{risk}</div>
          <p className="mt-1 text-xs opacity-90">
            {risk === "High"
              ? "High exposure or long delays — escalate to operations and review insurance immediately."
              : risk === "Medium"
                ? "Moderate exposure. Monitor closely and clear within free-day windows."
                : "Within normal parameters."}
          </p>
        </div>
      </div>
      <div className="xl:sticky xl:top-[140px] xl:self-start">
        <ResultsCard result={result} inputsTable={inputsTable} />
      </div>
    </div>
  );
}
