import { useMemo } from "react";
import { Plus, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
import { ContainerLoadView } from "@/components/freight/container-load-view";
import {
  UnitSelector,
  WeightUnitSelector,
  cmTo,
  toCm,
  kgTo,
  toKg,
  usePersistentLengthUnit,
  usePersistentWeightUnit,
} from "@/components/freight/unit-selector";
import { calcCbm, emptyCbmItem, type CbmItem } from "@/lib/freight/calculators";
import { nextId } from "@/lib/freight/ids";

interface Props {
  items: CbmItem[];
  setItems: (i: CbmItem[]) => void;
}

export function CbmCalculator({ items, setItems }: Props) {
  const [lenUnit, setLenUnit] = usePersistentLengthUnit();
  const [wtUnit, setWtUnit] = usePersistentWeightUnit();
  const result = useMemo(() => calcCbm(items), [items]);

  const update = (id: string, patch: Partial<CbmItem>) => {
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const remove = (id: string) => setItems(items.filter((it) => it.id !== id));
  const duplicate = (id: string) => {
    const src = items.find((it) => it.id === id);
    if (!src) return;
    setItems([...items, { ...src, id: nextId("cbm") }]);
  };
  const add = () => setItems([...items, emptyCbmItem()]);
  const clear = () => setItems([emptyCbmItem(0)]);

  const showLen = (cm: number) => {
    const v = cmTo(cm, lenUnit);
    return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
  };
  const setLen =
    (id: string, key: "length" | "width" | "height") => (n: number) =>
      update(id, { [key]: Number.isFinite(n) ? toCm(n, lenUnit) : 0 } as Partial<CbmItem>);

  const showWt = (kg: number) => {
    const v = kgTo(kg, wtUnit);
    return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
  };
  const setWt = (id: string) => (n: number) =>
    update(id, { weight: Number.isFinite(n) ? toKg(n, wtUnit) : 0 });

  const inputsTable = items.flatMap((it, idx) => [
    { label: `Item ${idx + 1} L×W×H (cm)`, value: `${it.length} × ${it.width} × ${it.height}` },
    { label: `Item ${idx + 1} Qty / Weight`, value: `${it.qty} pcs / ${it.weight} kg` },
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-4">
        <Card
          className="border-2 p-3"
          style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}
        >
          <div className="flex flex-wrap gap-4">
            <UnitSelector id="cbm-len-unit" value={lenUnit} onChange={setLenUnit} />
            <WeightUnitSelector id="cbm-wt-unit" value={wtUnit} onChange={setWtUnit} />
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
              <NumberField id={`l-${it.id}`} label="Length" suffix={lenUnit} required value={showLen(it.length)} onChange={setLen(it.id, "length")} hint={`Outer length of one carton in ${lenUnit}.`} />
              <NumberField id={`w-${it.id}`} label="Width" suffix={lenUnit} required value={showLen(it.width)} onChange={setLen(it.id, "width")} hint={`Outer width in ${lenUnit}.`} />
              <NumberField id={`h-${it.id}`} label="Height" suffix={lenUnit} required value={showLen(it.height)} onChange={setLen(it.id, "height")} hint={`Outer height in ${lenUnit}.`} />
              <NumberField id={`q-${it.id}`} label="Qty" required step={1} value={it.qty} onChange={(n) => update(it.id, { qty: Math.max(1, Math.round(n)) })} hint="Number of identical cartons." />
              <NumberField id={`wt-${it.id}`} label="Weight" suffix={wtUnit} required value={showWt(it.weight)} onChange={setWt(it.id)} hint={`Actual weight of ONE carton (gross) in ${wtUnit}.`} />
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
        <ContainerLoadView items={items} />
      </div>
      <ResultsCard result={result} inputsTable={inputsTable} />
    </div>
  );
}
