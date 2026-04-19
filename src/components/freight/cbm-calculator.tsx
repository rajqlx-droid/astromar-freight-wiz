import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, Copy, Layers, ShieldAlert } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { calcCbm, emptyCbmItem, type CbmItem, type PackageType } from "@/lib/freight/calculators";
import { ITEM_COLORS, totalCbm as sumCbm, totalWeight as sumWeight } from "@/lib/freight/packing";
import { recommendContainers } from "@/lib/freight/container-recommender";
import { ContainerSuggestion } from "@/components/freight/container-suggestion";
import { nextId } from "@/lib/freight/ids";
import { cn } from "@/lib/utils";

interface Props {
  items: CbmItem[];
  setItems: (i: CbmItem[]) => void;
}

const PACKAGE_TYPES: { value: PackageType; label: string }[] = [
  { value: "carton", label: "Carton" },
  { value: "pallet", label: "Pallet" },
  { value: "crate", label: "Crate" },
  { value: "drum", label: "Drum" },
  { value: "bag", label: "Bag" },
];

export function CbmCalculator({ items, setItems }: Props) {
  const [lenUnit, setLenUnit] = usePersistentLengthUnit();
  const [wtUnit, setWtUnit] = usePersistentWeightUnit();
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [forcedChoice, setForcedChoice] = useState<"20gp" | "40gp" | "40hc" | null>(null);
  const captureRef = useRef<(() => Promise<{ iso: string; front: string; side: string } | null>) | null>(null);
  const result = useMemo(() => calcCbm(items), [items]);
  const recommendation = useMemo(
    () => recommendContainers(sumCbm(items), sumWeight(items)),
    [items],
  );

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
  const toggleAdvanced = (id: string) =>
    setAdvancedOpen((s) => ({ ...s, [id]: !s[id] }));

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
    {
      label: `Item ${idx + 1} Type`,
      value: `${it.packageType ?? "carton"}${it.stackable === false ? " · no-stack" : ""}${it.fragile ? " · fragile" : ""}`,
    },
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-3">
        {items.map((it, idx) => {
          const color = ITEM_COLORS[idx % ITEM_COLORS.length];
          const open = advancedOpen[it.id];
          return (
            <Card
              key={it.id}
              className="border-2 p-3"
              style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 rounded-sm border border-black/10"
                    style={{ background: color }}
                    aria-hidden
                  />
                  <h4 className="text-sm font-semibold text-brand-navy">Item {idx + 1}</h4>
                  {idx === 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <UnitSelector id="cbm-len-unit" value={lenUnit} onChange={setLenUnit} compact />
                      <WeightUnitSelector id="cbm-wt-unit" value={wtUnit} onChange={setWtUnit} compact />
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "h-7 px-2 text-[11px]",
                      open ? "bg-brand-navy/10 text-brand-navy" : "text-muted-foreground",
                    )}
                    onClick={() => toggleAdvanced(it.id)}
                    aria-expanded={open}
                  >
                    <Layers className="size-3.5" />
                    Packing
                  </Button>
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
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                <NumberField compact id={`l-${it.id}`} label="Length" suffix={lenUnit} required value={showLen(it.length)} onChange={setLen(it.id, "length")} hint={`Outer length of one carton in ${lenUnit}.`} />
                <NumberField compact id={`w-${it.id}`} label="Width" suffix={lenUnit} required value={showLen(it.width)} onChange={setLen(it.id, "width")} hint={`Outer width in ${lenUnit}.`} />
                <NumberField compact id={`h-${it.id}`} label="Height" suffix={lenUnit} required value={showLen(it.height)} onChange={setLen(it.id, "height")} hint={`Outer height in ${lenUnit}.`} />
                <NumberField compact id={`q-${it.id}`} label="Qty" required step={1} value={it.qty} onChange={(n) => update(it.id, { qty: Math.max(1, Math.round(n)) })} hint="Number of identical cartons." />
                <NumberField compact id={`wt-${it.id}`} label="Weight" suffix={wtUnit} required value={showWt(it.weight)} onChange={setWt(it.id)} hint={`Actual weight of ONE carton (gross) in ${wtUnit}.`} />
              </div>

              {/* Advanced packing constraints */}
              {open && (
                <div className="mt-3 grid gap-3 rounded-md border border-dashed border-brand-navy/20 bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-brand-navy">Package type</Label>
                    <Select
                      value={it.packageType ?? "carton"}
                      onValueChange={(v) => update(it.id, { packageType: v as PackageType })}
                    >
                      <SelectTrigger className="h-9 border-brand-navy/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PACKAGE_TYPES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-md border border-brand-navy/20 bg-background px-3 py-2">
                    <div>
                      <Label className="text-xs font-semibold text-brand-navy">Stackable</Label>
                      <p className="text-[10px] text-muted-foreground">Allow cargo on top</p>
                    </div>
                    <Switch
                      checked={it.stackable !== false}
                      onCheckedChange={(v) => update(it.id, { stackable: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-md border border-brand-navy/20 bg-background px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert className="size-3.5 text-amber-600" />
                      <div>
                        <Label className="text-xs font-semibold text-brand-navy">Fragile</Label>
                        <p className="text-[10px] text-muted-foreground">Load on top last</p>
                      </div>
                    </div>
                    <Switch
                      checked={it.fragile === true}
                      onCheckedChange={(v) => update(it.id, { fragile: v })}
                    />
                  </div>
                  <NumberField
                    compact
                    id={`msw-${it.id}`}
                    label="Max stack wt"
                    suffix="kg"
                    value={it.maxStackWeightKg ?? 0}
                    onChange={(n) =>
                      update(it.id, { maxStackWeightKg: Number.isFinite(n) ? Math.max(0, n) : 0 })
                    }
                    hint="Max weight of cargo allowed on top of one of these. 0 = unlimited."
                  />
                </div>
              )}
            </Card>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button onClick={add} size="sm" variant="outline" className="border-brand-navy text-brand-navy">
            <Plus className="size-4" /> Add Item
          </Button>
          <Button onClick={clear} size="sm" variant="ghost" className="text-muted-foreground">
            Clear all
          </Button>
        </div>
        {sumCbm(items) > 0 && (
          <ContainerSuggestion
            recommendation={recommendation}
            currentChoice={forcedChoice ?? "auto"}
            onApply={(id) => setForcedChoice(id)}
          />
        )}
        <ContainerLoadView
          items={items}
          recommendation={recommendation}
          forcedChoice={forcedChoice}
          onChoiceChange={setForcedChoice}
          onReady={(h) => {
            captureRef.current = h.capture;
          }}
        />
      </div>
      <ResultsCard
        result={result}
        inputsTable={inputsTable}
        resolveExtras={async () => {
          const snaps = captureRef.current ? await captureRef.current() : null;
          return snaps ? { snapshots: snaps } : undefined;
        }}
      />
    </div>
  );
}
