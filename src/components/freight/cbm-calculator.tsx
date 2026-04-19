import { useMemo } from "react";
import { Plus, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
import { calcCbm, emptyCbmItem, type CbmItem } from "@/lib/freight/calculators";

interface Props {
  items: CbmItem[];
  setItems: (i: CbmItem[]) => void;
}

export function CbmCalculator({ items, setItems }: Props) {
  const result = useMemo(() => calcCbm(items), [items]);

  const update = (id: string, patch: Partial<CbmItem>) => {
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const remove = (id: string) => setItems(items.filter((it) => it.id !== id));
  const duplicate = (id: string) => {
    const src = items.find((it) => it.id === id);
    if (!src) return;
    setItems([...items, { ...src, id: crypto.randomUUID() }]);
  };
  const add = () => setItems([...items, emptyCbmItem()]);
  const clear = () => setItems([emptyCbmItem()]);

  const inputsTable = items.flatMap((it, idx) => [
    { label: `Item ${idx + 1} L×W×H (cm)`, value: `${it.length} × ${it.width} × ${it.height}` },
    { label: `Item ${idx + 1} Qty / Weight`, value: `${it.qty} pcs / ${it.weight} kg` },
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-4">
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
              <NumberField id={`l-${it.id}`} label="Length" suffix="cm" required value={it.length} onChange={(n) => update(it.id, { length: n })} hint="Outer length of one carton in centimetres." />
              <NumberField id={`w-${it.id}`} label="Width" suffix="cm" required value={it.width} onChange={(n) => update(it.id, { width: n })} hint="Outer width in centimetres." />
              <NumberField id={`h-${it.id}`} label="Height" suffix="cm" required value={it.height} onChange={(n) => update(it.id, { height: n })} hint="Outer height in centimetres." />
              <NumberField id={`q-${it.id}`} label="Qty" required step={1} value={it.qty} onChange={(n) => update(it.id, { qty: Math.max(1, Math.round(n)) })} hint="Number of identical cartons." />
              <NumberField id={`wt-${it.id}`} label="Weight" suffix="kg" required value={it.weight} onChange={(n) => update(it.id, { weight: n })} hint="Actual weight of ONE carton (gross)." />
            </div>
          </Card>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button onClick={add} size="sm" variant="outline" className="border-brand-navy text-brand-navy">
            <Plus className="size-4" /> Add Item
          </Button>
          <Button onClick={clear} size="sm" variant="ghost" className="text-muted-foreground">
            Clear all
          </Button>
        </div>
      </div>
      <ResultsCard result={result} inputsTable={inputsTable} />
    </div>
  );
}
