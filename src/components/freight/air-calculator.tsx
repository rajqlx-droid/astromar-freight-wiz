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
  type LengthUnit,
  type WeightUnit,
} from "@/components/freight/unit-selector";
import { calcAir, emptyAirItem, type AirItem } from "@/lib/freight/calculators";
import { nextId } from "@/lib/freight/ids";

interface Props {
  items: AirItem[];
  setItems: (i: AirItem[]) => void;
  divisor: number;
  setDivisor: (n: number) => void;
}

export function AirCalculator({ items, setItems, divisor: _divisor, setDivisor: _setDivisor }: Props) {
  // Note: legacy global divisor props kept for parent compatibility but unused.
  // Each item now owns its own divisor + units.
  const result = useMemo(() => calcAir(items, 6000), [items]);

  const update = (id: string, patch: Partial<AirItem>) =>
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => setItems(items.filter((it) => it.id !== id));
  const duplicate = (id: string) => {
    const src = items.find((i) => i.id === id);
    if (src) setItems([...items, { ...src, id: nextId("air") }]);
  };

  const warn = result.items.find((i) => i.label === "Cost Impact" && i.value.startsWith("+"));

  const inputsTable = items.map((it, idx) => {
    const div = it.divisor && it.divisor > 0 ? it.divisor : 6000;
    const volPerPc = (it.length * it.width * it.height) / div;
    return {
      label: `Item ${idx + 1}`,
      value: `${it.length}×${it.width}×${it.height} cm · ${it.qty} pcs · ${it.weight.toFixed(2)} kg actual · ÷${div} · ${volPerPc.toFixed(2)} kg vol/pc`,
    };
  });

  // Tool analytics — KPI tiles + actual vs volumetric stacked bar.
  const pdfExtras = useMemo<import("@/lib/freight/pdf").PdfExtras>(() => {
    let actual = 0;
    let volumetric = 0;
    let totalQty = 0;
    for (const it of items) {
      const div = it.divisor && it.divisor > 0 ? it.divisor : 6000;
      const v = (it.length * it.width * it.height) / div;
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
          title: `Weight comparison · chargeable bills the higher of actual vs volumetric (per-item divisor)`,
          segments: [
            { label: "Actual", value: actual, color: [27, 58, 107] },
            { label: "Volumetric", value: volumetric, color: [249, 115, 22] },
          ],
        },
      },
    };
  }, [items]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-3">
        {items.map((it, idx) => {
          const lenUnit: LengthUnit = it.lenUnit ?? "cm";
          const wtUnit: WeightUnit = it.wtUnit ?? "kg";
          const div = it.divisor && it.divisor > 0 ? it.divisor : 6000;

          const showLen = (cm: number) => {
            const v = cmTo(cm, lenUnit);
            return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
          };
          const setLen = (key: "length" | "width" | "height") => (n: number) =>
            update(it.id, { [key]: Number.isFinite(n) ? toCm(n, lenUnit) : 0 } as Partial<AirItem>);
          const showWt = (kg: number) => {
            const v = kgTo(kg, wtUnit);
            return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
          };
          const setWt = (n: number) =>
            update(it.id, { weight: Number.isFinite(n) ? toKg(n, wtUnit) : 0 });

          const rowVolKg = (it.length * it.width * it.height) / div;
          const rowTotalVol = rowVolKg * it.qty;
          const rowTotalActual = it.weight * it.qty;
          const rowChargeable = Math.max(rowTotalActual, rowTotalVol);

          return (
            <Card
              key={it.id}
              className="border-2 p-3"
              style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}
            >
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

              {/* Per-item settings: divisor + units */}
              <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md bg-brand-navy-soft/30 p-2">
                <div className="min-w-[140px] flex-1">
                  <NumberField
                    compact
                    steppers={false}
                    id={`adiv-${it.id}`}
                    label="Volumetric Divisor"
                    required
                    step={1}
                    value={div}
                    onChange={(n) => update(it.id, { divisor: n > 0 ? n : 6000 })}
                    hint="IATA std 6000 (air). Couriers often use 5000."
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pb-1">
                  <UnitSelector
                    id={`alen-${it.id}`}
                    value={lenUnit}
                    onChange={(u) => update(it.id, { lenUnit: u })}
                    compact
                  />
                  <WeightUnitSelector
                    id={`awt-u-${it.id}`}
                    value={wtUnit}
                    onChange={(u) => update(it.id, { wtUnit: u })}
                    compact
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <NumberField compact steppers={false} id={`al-${it.id}`} label="Length" suffix={lenUnit} required value={showLen(it.length)} onChange={setLen("length")} />
                <NumberField compact steppers={false} id={`aw-${it.id}`} label="Width" suffix={lenUnit} required value={showLen(it.width)} onChange={setLen("width")} />
                <NumberField compact steppers={false} id={`ah-${it.id}`} label="Height" suffix={lenUnit} required value={showLen(it.height)} onChange={setLen("height")} />
                <NumberField compact steppers={false} id={`aq-${it.id}`} label="Qty" required step={1} value={it.qty} onChange={(n) => update(it.id, { qty: Math.max(1, Math.round(n)) })} />
                <NumberField compact steppers={false} id={`awt-${it.id}`} label="Actual Wt" suffix={wtUnit} required value={showWt(it.weight)} onChange={setWt} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-brand-navy">
                    Chargeable <span className="font-normal text-muted-foreground">({wtUnit})</span>
                  </label>
                  <div
                    className="flex h-9 items-center rounded-md border border-brand-navy/20 bg-brand-navy-soft/40 px-3 text-sm font-bold tabular-nums"
                    style={{ color: rowTotalVol > rowTotalActual ? "var(--brand-orange)" : "var(--brand-navy)" }}
                    aria-label={`Item ${idx + 1} chargeable weight`}
                    title={rowTotalVol > rowTotalActual ? `Volumetric (${rowTotalVol.toFixed(2)} kg) exceeds actual` : "Billed on actual weight"}
                  >
                    {Number(kgTo(rowChargeable, wtUnit)).toFixed(2)}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

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
