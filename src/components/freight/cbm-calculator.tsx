import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Copy,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Settings2,
  Info,
} from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [forcedChoice, setForcedChoice] = useState<"20gp" | "40gp" | "40hc" | null>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const captureRef = useRef<(() => Promise<{ iso: string; front: string; side: string } | null>) | null>(null);
  const result = useMemo(() => calcCbm(items), [items]);
  const recommendation = useMemo(
    () => recommendContainers(sumCbm(items), sumWeight(items)),
    [items],
  );

  // Gate: every cargo row with real dimensions must have packingConfirmed === true.
  const unconfirmed = useMemo(
    () =>
      items.filter(
        (it) => it.length > 0 && it.width > 0 && it.height > 0 && it.qty > 0 && !it.packingConfirmed,
      ),
    [items],
  );
  const allConfirmed = unconfirmed.length === 0 && items.some((it) => it.length > 0);
  const gateReason = !allConfirmed
    ? "Confirm packing options for every cargo item to enable container optimization, 3D loading and PDF export."
    : null;

  const update = (id: string, patch: Partial<CbmItem>) => {
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  /** Toggle a packing flag and auto-confirm the row in one shot. */
  const updatePacking = (id: string, patch: Partial<CbmItem>) => {
    setItems(
      items.map((it) => (it.id === id ? { ...it, ...patch, packingConfirmed: true } : it)),
    );
  };
  const remove = (id: string) => setItems(items.filter((it) => it.id !== id));
  const duplicate = (id: string) => {
    const src = items.find((it) => it.id === id);
    if (!src) return;
    setItems([...items, { ...src, id: nextId("cbm") }]);
  };
  const add = () => setItems([...items, emptyCbmItem()]);
  const clear = () => setItems([emptyCbmItem(0)]);

  /** Copy one row's packing options to every other row & mark them all confirmed. */
  const applyToAll = (sourceId: string) => {
    const src = items.find((it) => it.id === sourceId);
    if (!src) return;
    setItems(
      items.map((it) => ({
        ...it,
        packageType: src.packageType,
        stackable: src.stackable,
        fragile: src.fragile,
        maxStackWeightKg: src.maxStackWeightKg,
        allowSidewaysRotation: src.allowSidewaysRotation,
        allowAxisRotation: src.allowAxisRotation,
        packingConfirmed: true,
      })),
    );
  };

  /** Scroll to and focus the first cargo row missing packing confirmation. */
  const reviewFirstUnconfirmed = () => {
    const first = unconfirmed[0];
    if (!first) return;
    const el = rowRefs.current[first.id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-500");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-amber-500"), 1800);
    }
    setOpenPopoverId(first.id);
  };

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
      label: `Item ${idx + 1} Packing`,
      value: it.packingConfirmed
        ? buildSummary(it)
        : "⚠ Packing options not confirmed",
    },
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-3">
        {items.map((it, idx) => {
          const color = ITEM_COLORS[idx % ITEM_COLORS.length];
          const confirmed = it.packingConfirmed === true;
          return (
            <Card
              key={it.id}
              ref={(el) => {
                rowRefs.current[it.id] = el;
              }}
              className="border-2 p-3 transition-shadow"
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

              {/* Packing options: status chip + popover */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Popover
                  open={openPopoverId === it.id}
                  onOpenChange={(o) => setOpenPopoverId(o ? it.id : null)}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex max-w-full items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[11px] font-semibold transition-colors",
                        confirmed
                          ? "border-emerald-400/60 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200"
                          : "animate-pulse border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200",
                      )}
                    >
                      {confirmed ? (
                        <CheckCircle2 className="size-3.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">
                        {confirmed ? buildSummary(it) : "Packing options required"}
                      </span>
                      <Settings2 className="size-3 shrink-0 opacity-70" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(420px,calc(100vw-2rem))] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-brand-navy">
                          Packing options · Item {idx + 1}
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                          Required for accurate container plan & 3D loading.
                        </p>
                      </div>
                      <Info className="size-4 shrink-0 text-brand-navy/60" />
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-brand-navy">
                          Package type
                        </Label>
                        <Select
                          value={it.packageType ?? "carton"}
                          onValueChange={(v) =>
                            updatePacking(it.id, { packageType: v as PackageType })
                          }
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

                      <NumberField
                        compact
                        id={`msw-${it.id}`}
                        label="Max stack weight"
                        suffix="kg"
                        value={it.maxStackWeightKg ?? 0}
                        onChange={(n) =>
                          updatePacking(it.id, {
                            maxStackWeightKg: Number.isFinite(n) ? Math.max(0, n) : 0,
                          })
                        }
                        hint="Max weight of cargo allowed on top of one of these. 0 = unlimited."
                      />

                      <ToggleRow
                        title="Stackable"
                        desc="Allow other cartons to be loaded on top of this one."
                        checked={it.stackable !== false}
                        onChange={(v) => updatePacking(it.id, { stackable: v })}
                      />
                      <ToggleRow
                        title="Fragile"
                        desc="Loaded last, on top. Nothing stacks on it."
                        icon={<ShieldAlert className="size-3.5 text-amber-600" />}
                        checked={it.fragile === true}
                        onChange={(v) => updatePacking(it.id, { fragile: v })}
                      />
                      <ToggleRow
                        title="Can lay sideways"
                        desc="Packer may rotate 90° on the floor (swap length & width)."
                        checked={it.allowSidewaysRotation !== false}
                        onChange={(v) => updatePacking(it.id, { allowSidewaysRotation: v })}
                      />
                      {!it.fragile && (
                        <ToggleRow
                          title="Can stand on side"
                          desc="Packer may tip it onto its side for tighter fit. Only for non-fragile cargo."
                          checked={it.allowAxisRotation === true}
                          onChange={(v) => updatePacking(it.id, { allowAxisRotation: v })}
                        />
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      {items.length > 1 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-brand-navy/40 text-[11px] text-brand-navy"
                          onClick={() => applyToAll(it.id)}
                        >
                          Apply to all items
                        </Button>
                      ) : (
                        <span />
                      )}
                      <Button
                        size="sm"
                        className="h-8 bg-brand-navy text-[11px] text-white hover:bg-brand-navy/90"
                        onClick={() => {
                          updatePacking(it.id, {});
                          setOpenPopoverId(null);
                        }}
                      >
                        <CheckCircle2 className="size-3.5" /> Confirm
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
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

        {/* Gate banner — replaces ContainerSuggestion when any row is unconfirmed */}
        {sumCbm(items) > 0 && !allConfirmed && (
          <div className="rounded-lg border-2 border-amber-400/60 bg-amber-50 p-3 sm:p-4 dark:bg-amber-950/20">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="size-4" />
              <span>Confirm packing options to unlock container optimization</span>
              <Button
                size="sm"
                variant="default"
                className="ml-auto h-7 bg-amber-600 px-2.5 text-[11px] text-white hover:bg-amber-700"
                onClick={reviewFirstUnconfirmed}
              >
                Review packing options
              </Button>
            </div>
            <p className="mb-2 text-[11px] text-amber-900/90 dark:text-amber-200/90">
              We need to know which cartons are stackable, fragile, and rotatable before we can
              recommend the right container or render an accurate 3D loading plan.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {unconfirmed.map((u) => {
                const idx = items.findIndex((it) => it.id === u.id);
                return (
                  <li
                    key={u.id}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-black/30 dark:text-amber-200"
                  >
                    <AlertTriangle className="size-2.5" />
                    Item {idx + 1}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {sumCbm(items) > 0 && allConfirmed && (
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
          optimizationDisabledReason={gateReason}
          onReady={(h) => {
            captureRef.current = h.capture;
          }}
        />
      </div>
      <ResultsCard
        result={result}
        inputsTable={inputsTable}
        pdfDisabledReason={gateReason}
        resolveExtras={async () => {
          const snaps = captureRef.current ? await captureRef.current() : null;
          return snaps ? { snapshots: snaps } : undefined;
        }}
      />
    </div>
  );
}

/* ---------------- helpers ---------------- */

function ToggleRow({
  title,
  desc,
  icon,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  icon?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-brand-navy/20 bg-background px-3 py-2">
      <div className="flex items-start gap-1.5">
        {icon}
        <div>
          <Label className="text-xs font-semibold text-brand-navy">{title}</Label>
          <p className="text-[10px] text-muted-foreground">{desc}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function buildSummary(it: CbmItem): string {
  const bits: string[] = [];
  bits.push(it.packageType ?? "carton");
  if (it.stackable === false) bits.push("no-stack");
  if (it.fragile) bits.push("fragile");
  if (it.allowSidewaysRotation !== false) bits.push("sideways OK");
  if (it.allowAxisRotation) bits.push("tip OK");
  if ((it.maxStackWeightKg ?? 0) > 0) bits.push(`max ${it.maxStackWeightKg}kg`);
  return bits.join(" · ");
}
