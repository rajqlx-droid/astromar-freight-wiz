import { useMemo } from "react";
import { Plus, Trash2, Copy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
import { calcAir, emptyAirItem, type AirItem } from "@/lib/freight/calculators";

interface Props {
  items: AirItem[];
  setItems: (i: AirItem[]) => void;
  divisor: number;
  setDivisor: (n: number) => void;
}

export function AirCalculator({ items, setItems, divisor, setDivisor }: Props) {
  const result = useMemo(() => calcAir(items, divisor), [items, divisor]);

  const update = (id: string, patch: Partial<AirItem>) =>
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => setItems(items.filter((it) => it.id !== id));
  const duplicate = (id: string) => {
    const src = items.find((i) => i.id === id);
    if (src) setItems([...items, { ...src, id: crypto.randomUUID() }]);
  };

  const warn = result.items.find((i) => i.label === "Cost Impact" && i.value.startsWith("+"));

  const inputsTable = items.flatMap((it, idx) => [
    { label: `Item ${idx + 1} L×W×H (cm)`, value: `${it.length} × ${it.width} × ${it.height}` },
    { label: `Item ${idx + 1} Qty / Actual Weight`, value: `${it.qty} pcs / ${it.weight} kg` },
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-4">
        <Card className="border-2 p-4" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="divisor" label="Volumetric Divisor" required step={1} value={divisor} onChange={(n) => setDivisor(n || 6000)} hint="IATA standard is 6000 for air freight. Some couriers use 5000." />
          </div>
        </Card>

        {items.map((it, idx) => (
          <Card key={it.id} className="border-2 p-4" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-brand-navy">Item {idx + 1}</h4>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="size-7" onClick={() => duplicate(it.id)} aria-label="Duplicate">
                  <Copy className="size-3.5" />
                </Button>
                {items.length > 1 && (
                  <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => remove(it.id)} aria-label="Remove">
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <NumberField id={`al-${it.id}`} label="Length" suffix="cm" required value={it.length} onChange={(n) => update(it.id, { length: n })} />
              <NumberField id={`aw-${it.id}`} label="Width" suffix="cm" required value={it.width} onChange={(n) => update(it.id, { width: n })} />
              <NumberField id={`ah-${it.id}`} label="Height" suffix="cm" required value={it.height} onChange={(n) => update(it.id, { height: n })} />
              <NumberField id={`aq-${it.id}`} label="Qty" required step={1} value={it.qty} onChange={(n) => update(it.id, { qty: Math.max(1, Math.round(n)) })} />
              <NumberField id={`awt-${it.id}`} label="Actual Wt" suffix="kg" required value={it.weight} onChange={(n) => update(it.id, { weight: n })} />
            </div>
          </Card>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setItems([...items, emptyAirItem()])} size="sm" variant="outline" className="border-brand-navy text-brand-navy">
            <Plus className="size-4" /> Add Item
          </Button>
        </div>

        {warn && (
          <div
            className="flex items-start gap-2 rounded-lg border-l-4 p-3 text-sm"
            style={{ borderColor: "var(--brand-orange)", background: "var(--brand-orange-soft)" }}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-orange" />
            <div>
              <strong className="text-brand-navy">Volumetric weight exceeds actual.</strong>{" "}
              <span className="text-muted-foreground">
                Airlines will bill on the higher figure — consider denser packing or sea freight.
              </span>
            </div>
          </div>
        )}
      </div>

      <ResultsCard result={result} inputsTable={inputsTable} />
    </div>
  );
}
