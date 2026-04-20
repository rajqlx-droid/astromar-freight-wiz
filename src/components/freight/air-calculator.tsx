import { useMemo } from "react";
import { Plus, Trash2, Copy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NumberField } from "@/components/freight/number-field";
import { ResultsCard } from "@/components/freight/results-card";
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
import { calcAir, emptyAirItem, type AirItem } from "@/lib/freight/calculators";
import { nextId } from "@/lib/freight/ids";

interface Props {
  items: AirItem[];
  setItems: (i: AirItem[]) => void;
  divisor: number;
  setDivisor: (n: number) => void;
}

export function AirCalculator({ items, setItems, divisor, setDivisor }: Props) {
  const [lenUnit, setLenUnit] = usePersistentLengthUnit();
  const [wtUnit, setWtUnit] = usePersistentWeightUnit();
  const result = useMemo(() => calcAir(items, divisor), [items, divisor]);

  const update = (id: string, patch: Partial<AirItem>) =>
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => setItems(items.filter((it) => it.id !== id));
  const duplicate = (id: string) => {
    const src = items.find((i) => i.id === id);
    if (src) setItems([...items, { ...src, id: nextId("air") }]);
  };

  const showLen = (cm: number) => {
    const v = cmTo(cm, lenUnit);
    return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
  };
  const setLen =
    (id: string, key: "length" | "width" | "height") => (n: number) =>
      update(id, { [key]: Number.isFinite(n) ? toCm(n, lenUnit) : 0 } as Partial<AirItem>);

  const showWt = (kg: number) => {
    const v = kgTo(kg, wtUnit);
    return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
  };
  const setWt = (id: string) => (n: number) =>
    update(id, { weight: Number.isFinite(n) ? toKg(n, wtUnit) : 0 });

  const warn = result.items.find((i) => i.label === "Cost Impact" && i.value.startsWith("+"));

  const inputsTable = items.flatMap((it, idx) => [
    { label: `Item ${idx + 1} L×W×H (cm)`, value: `${it.length} × ${it.width} × ${it.height}` },
    { label: `Item ${idx + 1} Qty / Actual Weight`, value: `${it.qty} pcs / ${it.weight} kg` },
  ]);

  // Tool analytics — KPI tiles + actual vs volumetric stacked bar.
  const pdfExtras = useMemo<import("@/lib/freight/pdf").PdfExtras>(() => {
    let actual = 0;
    let volumetric = 0;
    let totalQty = 0;
    for (const it of items) {
      const v = (it.length * it.width * it.height) / divisor;
      volumetric += v * it.qty;
      actual += it.weight * it.qty;
      totalQty += it.qty;
    }
    const chargeable = Math.max(actual, volumetric);
    const premiumPct = actual > 0 ? ((chargeable - actual) / actual) * 100 : 0;
    return {
      analytics: {
        kpis: [
          { label: "Total Pieces", value: totalQty.toLocaleString("en-IN") },
          { label: "Actual Weight", value: `${actual.toFixed(1)} kg` },
          { label: "Volumetric Weight", value: `${volumetric.toFixed(1)} kg` },
          {
            label: "Chargeable Weight",
            value: `${chargeable.toFixed(1)} kg`,
            tone: premiumPct > 20 ? "bad" : premiumPct > 5 ? "warn" : "good",
          },
        ],
        breakdown: {
          title: `Weight comparison · chargeable bills the higher of actual vs volumetric (÷${divisor})`,
          segments: [
            { label: "Actual", value: actual, color: [27, 58, 107] },
            { label: "Volumetric", value: volumetric, color: [249, 115, 22] },
          ],
        },
      },
    };
  }, [items, divisor]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-3">
        <Card
          className="border-2 p-3"
          style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <NumberField
                compact
                id="divisor"
                label="Volumetric Divisor"
                required
                step={1}
                value={divisor}
                onChange={(n) => setDivisor(n || 6000)}
                hint="IATA standard is 6000 for air freight. Some couriers use 5000."
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              <UnitSelector id="air-len-unit" value={lenUnit} onChange={setLenUnit} compact />
              <WeightUnitSelector id="air-wt-unit" value={wtUnit} onChange={setWtUnit} compact />
            </div>
          </div>
        </Card>

        {items.map((it, idx) => (
          <Card key={it.id} className="border-2 p-3" style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}>
            <div className="mb-2 flex items-center justify-between">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <NumberField compact id={`al-${it.id}`} label="Length" suffix={lenUnit} required value={showLen(it.length)} onChange={setLen(it.id, "length")} />
              <NumberField compact id={`aw-${it.id}`} label="Width" suffix={lenUnit} required value={showLen(it.width)} onChange={setLen(it.id, "width")} />
              <NumberField compact id={`ah-${it.id}`} label="Height" suffix={lenUnit} required value={showLen(it.height)} onChange={setLen(it.id, "height")} />
              <NumberField compact id={`aq-${it.id}`} label="Qty" required step={1} value={it.qty} onChange={(n) => update(it.id, { qty: Math.max(1, Math.round(n)) })} />
              <NumberField compact id={`awt-${it.id}`} label="Actual Wt" suffix={wtUnit} required value={showWt(it.weight)} onChange={setWt(it.id)} />
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

      <div className="xl:sticky xl:top-[140px] xl:self-start">
        <ResultsCard result={result} inputsTable={inputsTable} extras={pdfExtras} />
      </div>
    </div>
  );
}
