import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Copy,
  ShieldAlert,
  CheckCircle2,
  Settings2,
  Info,
  Sparkles,
  Pencil,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
  const [optimizationRequested, setOptimizationRequested] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const result = useMemo(() => calcCbm(items), [items]);
  const recommendation = useMemo(
    () => recommendContainers(sumCbm(items), sumWeight(items)),
    [items],
  );

  // Items that have real dimensions but haven't had packing options confirmed yet.
  const unconfirmed = useMemo(
    () =>
      items.filter(
        (it) => it.length > 0 && it.width > 0 && it.height > 0 && it.qty > 0 && !it.packingConfirmed,
      ),
    [items],
  );
  const allConfirmed = unconfirmed.length === 0 && items.some((it) => it.length > 0);
  const hasAnyDims = items.some((it) => it.length > 0 && it.width > 0 && it.height > 0 && it.qty > 0);
  const showOptimization = optimizationRequested && allConfirmed;

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

  const inputsTable = items.flatMap((it, idx) => {
    const rows = [
      { label: `Item ${idx + 1} L×W×H (cm)`, value: `${it.length} × ${it.width} × ${it.height}` },
      { label: `Item ${idx + 1} Qty / Weight`, value: `${it.qty} pcs / ${it.weight} kg` },
    ];
    if (it.packingConfirmed) {
      rows.push({ label: `Item ${idx + 1} Packing`, value: buildSummary(it) });
    }
    return rows;
  });

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
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {/* Packing options chip — sits next to row actions to save vertical space */}
                  <Popover
                    open={openPopoverId === it.id}
                    onOpenChange={(o) => setOpenPopoverId(o ? it.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          confirmed
                            ? "border-emerald-400/60 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200"
                            : "border-brand-navy/25 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-brand-navy",
                        )}
                      >
                        {confirmed ? (
                          <CheckCircle2 className="size-3.5 shrink-0" />
                        ) : (
                          <Settings2 className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate">
                          {confirmed ? buildSummary(it) : "Packing options"}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))] p-4">
                      {renderPackingPopoverContent({
                        it,
                        idx,
                        items,
                        updatePacking,
                        applyToAll,
                        closePopover: () => setOpenPopoverId(null),
                      })}
                    </PopoverContent>
                  </Popover>
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

        {/* Optimize-container CTA — CBM math is never gated, only this section is */}
        {hasAnyDims && !showOptimization && (
          <Card className="border-2 border-brand-navy/30 bg-gradient-to-br from-brand-navy-soft to-background p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="rounded-full bg-brand-orange/10 p-2 text-brand-orange">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-navy">
                    Get container optimization plan
                  </h3>
                  <p className="mt-0.5 max-w-md text-[11px] text-muted-foreground">
                    Recommend the best container, render a 3D loading plan, generate a loading
                    video and unlock PDF export. We'll ask a few packing questions first.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="text-white shadow-sm hover:opacity-90"
                style={{ background: "var(--brand-orange)" }}
                onClick={() => {
                  if (allConfirmed) {
                    setOptimizationRequested(true);
                  } else {
                    setConfirmModalOpen(true);
                  }
                }}
              >
                <Sparkles className="size-3.5" /> Optimize loading
              </Button>
            </div>
          </Card>
        )}

        {showOptimization && (
          <>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-navy/70 hover:text-brand-navy hover:underline"
              >
                <Pencil className="size-3" /> Edit packing options
              </button>
            </div>
            <ContainerSuggestion
              recommendation={recommendation}
              currentChoice={forcedChoice ?? "auto"}
              onApply={(id) => setForcedChoice(id)}
            />
            <ContainerLoadView
              items={items}
              recommendation={recommendation}
              forcedChoice={forcedChoice}
              onChoiceChange={setForcedChoice}
              onReady={(h) => {
                captureRef.current = h.capture;
              }}
            />
          </>
        )}
      </div>
      <ResultsCard
        result={result}
        inputsTable={inputsTable}
        pdfDisabledReason={
          showOptimization
            ? null
            : "Click 'Optimize loading' and confirm packing options to enable PDF export with the 3D loading plan."
        }
        resolveExtras={async () => {
          const snaps = captureRef.current ? await captureRef.current() : null;
          return snaps ? { snapshots: snaps } : undefined;
        }}
      />

      {/* Confirm packing options modal */}
      <ConfirmPackingModal
        open={confirmModalOpen}
        onOpenChange={setConfirmModalOpen}
        items={items}
        onUpdate={updatePacking}
        onApplyToAll={applyToAll}
        onConfirm={() => {
          // Mark every dimensioned row as confirmed and unlock optimization.
          setItems(
            items.map((it) =>
              it.length > 0 && it.width > 0 && it.height > 0 && it.qty > 0
                ? { ...it, packingConfirmed: true }
                : it,
            ),
          );
          setConfirmModalOpen(false);
          setOptimizationRequested(true);
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

/* ---------------- Packing popover content (shared) ---------------- */

function renderPackingPopoverContent({
  it,
  idx,
  items,
  updatePacking,
  applyToAll,
  closePopover,
}: {
  it: CbmItem;
  idx: number;
  items: CbmItem[];
  updatePacking: (id: string, patch: Partial<CbmItem>) => void;
  applyToAll: (sourceId: string) => void;
  closePopover: () => void;
}) {
  return (
    <>
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
          <Label className="text-xs font-semibold text-brand-navy">Package type</Label>
          <Select
            value={it.packageType ?? "carton"}
            onValueChange={(v) => updatePacking(it.id, { packageType: v as PackageType })}
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
          hint="Max weight allowed on top of one of these. 0 = unlimited."
        />

        <ToggleRow
          title="Stackable"
          desc="Allow other cartons on top."
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
          desc="Packer may rotate 90° on the floor (swap L↔W)."
          checked={it.allowSidewaysRotation !== false}
          onChange={(v) => updatePacking(it.id, { allowSidewaysRotation: v })}
        />
        {!it.fragile && (
          <ToggleRow
            title="Can stand on side"
            desc="Packer may tip it onto its side. Non-fragile only."
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
            closePopover();
          }}
        >
          <CheckCircle2 className="size-3.5" /> Confirm
        </Button>
      </div>
    </>
  );
}

/* ---------------- ConfirmPackingModal ---------------- */

function ConfirmPackingModal({
  open,
  onOpenChange,
  items,
  onUpdate,
  onApplyToAll,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: CbmItem[];
  onUpdate: (id: string, patch: Partial<CbmItem>) => void;
  onApplyToAll: (sourceId: string) => void;
  onConfirm: () => void;
}) {
  const dimensioned = items.filter(
    (it) => it.length > 0 && it.width > 0 && it.height > 0 && it.qty > 0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Confirm packing options</DialogTitle>
          <DialogDescription>
            Set packing rules for each item so we can recommend the right container and render an
            accurate 3D loading plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {dimensioned.map((it, idx) => {
            const color = ITEM_COLORS[items.findIndex((i) => i.id === it.id) % ITEM_COLORS.length];
            return (
              <div
                key={it.id}
                className="rounded-lg border-2 border-brand-navy/15 bg-card p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-sm border border-black/10"
                      style={{ background: color }}
                      aria-hidden
                    />
                    <h4 className="text-sm font-semibold text-brand-navy">
                      Item {items.findIndex((i) => i.id === it.id) + 1}
                    </h4>
                    <span className="text-[11px] text-muted-foreground">
                      {it.length}×{it.width}×{it.height} cm · {it.qty} pcs
                    </span>
                  </div>
                  {dimensioned.length > 1 && idx === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-brand-navy/40 text-[11px] text-brand-navy"
                      onClick={() => onApplyToAll(it.id)}
                    >
                      Apply to all items
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-brand-navy">
                        Package type
                      </Label>
                      <Select
                        value={it.packageType ?? "carton"}
                        onValueChange={(v) => onUpdate(it.id, { packageType: v as PackageType })}
                      >
                        <SelectTrigger className="h-8 border-brand-navy/30 text-xs">
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
                      id={`m-msw-${it.id}`}
                      label="Max stack weight"
                      suffix="kg"
                      value={it.maxStackWeightKg ?? 0}
                      onChange={(n) =>
                        onUpdate(it.id, { maxStackWeightKg: Number.isFinite(n) ? Math.max(0, n) : 0 })
                      }
                      hint="Max weight allowed on top of one of these. 0 = unlimited."
                    />
                  </div>

                  <ToggleRow
                    title="Stackable"
                    desc="Allow other cartons on top."
                    checked={it.stackable !== false}
                    onChange={(v) => onUpdate(it.id, { stackable: v })}
                  />
                  <ToggleRow
                    title="Fragile"
                    desc="Loaded last, on top. Nothing stacks on it."
                    icon={<ShieldAlert className="size-3.5 text-amber-600" />}
                    checked={it.fragile === true}
                    onChange={(v) => onUpdate(it.id, { fragile: v })}
                  />
                  <ToggleRow
                    title="Can lay sideways"
                    desc="Packer may rotate 90° on the floor (swap L↔W)."
                    checked={it.allowSidewaysRotation !== false}
                    onChange={(v) => onUpdate(it.id, { allowSidewaysRotation: v })}
                  />
                  {!it.fragile && (
                    <ToggleRow
                      title="Can stand on side"
                      desc="Packer may tip it onto its side. Non-fragile only."
                      checked={it.allowAxisRotation === true}
                      onChange={(v) => onUpdate(it.id, { allowAxisRotation: v })}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="text-white"
            style={{ background: "var(--brand-navy)" }}
          >
            <CheckCircle2 className="size-3.5" /> Confirm & optimize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
