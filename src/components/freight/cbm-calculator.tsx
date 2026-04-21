import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { calcCbm, emptyCbmItem, type CbmItem, type PackageType } from "@/lib/freight/calculators";
import { ITEM_COLORS } from "@/lib/freight/packing";
import {
  recommendContainers,
  recommendContainersFast,
  type ContainerRecommendation,
} from "@/lib/freight/container-recommender";
import { usePackingWorker } from "@/hooks/use-packing-worker";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";

import { ContainerSuggestion } from "@/components/freight/container-suggestion";
import { nextId } from "@/lib/freight/ids";
import { cn } from "@/lib/utils";

type LengthUnit = "cm" | "mm" | "m" | "in" | "ft";
type WeightUnit = "kg" | "g" | "lb";

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
  { value: "bale", label: "Bale" },
];

/** Crates and pallets ship in fixed orientation — pallets allow only L↔W swap (4-way entry forklifts), crates fully fixed. */
const isRigidUnit = (t?: PackageType) => t === "crate" || t === "pallet";

export function CbmCalculator({ items, setItems }: Props) {
  const [lenUnit, setLenUnit] = usePersistentLengthUnit();
  const [wtUnit, setWtUnit] = usePersistentWeightUnit();
  const [draftItems, setDraftItems] = useState<CbmItem[]>(items);
  useEffect(() => {
    setDraftItems(items);
  }, [items]);
  useEffect(() => {
    // Adaptive debounce: tighter for small manifests (responsive feel),
    // looser for large ones (avoids re-running heavy downstream work mid-typing).
    // Lightweight per-row CBM and Total CBM tiles read from `draftItems`
    // directly, so this delay only affects the geometry-aware recommender.
    const delay = draftItems.length > 10 ? 600 : 250;
    const t = setTimeout(() => setItems(draftItems), delay);
    return () => clearTimeout(t);
  }, [draftItems, setItems]);
  const [forcedChoice, setForcedChoice] = useState<import("@/lib/freight/container-ids").ContainerId | null>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const loadHandleRef = useRef<{
    capture: () => Promise<{ iso: string; front: string; side: string } | null>;
    getActivePack: () => import("@/lib/freight/packing-advanced").AdvancedPackResult | null;
  } | null>(null);
  const [optimizationRequested, setOptimizationRequested] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [activePack, setActivePack] = useState<
    import("@/lib/freight/packing-advanced").AdvancedPackResult | null
  >(null);
  // Headline result reads from `draftItems` so per-row CBM tiles and "Total CBM"
  // always agree mid-typing — no more 400-800ms lag between the two.
  const baseResult = useMemo(() => calcCbm(draftItems), [draftItems]);
  // Append KPIs when an optimisation pack is available.
  // Utilization (volume) = cargo CBM ÷ container CBM (how full the container is).
  // Weight Utilization   = used weight ÷ container max payload (catches dense cargo
  //                        that hits the weight limit before the volume limit).
  // Density              = placed-cargo CBM ÷ bounding-box CBM of placed boxes
  //                        (how tightly the cargo is squeezed inside the volume it occupies).
  // All three use the same traffic-light: green ≥85, amber 70–84, red <70.
  const result = useMemo(() => {
    if (!activePack || activePack.placed.length === 0) return baseResult;
    const toneFor = (n: number): "good" | "warn" | "bad" =>
      n >= 85 ? "good" : n >= 70 ? "warn" : "bad";
    const u = activePack.utilizationPct;
    const wu = activePack.weightUtilizationPct;
    const d = activePack.densityPct;
    const weightLimited = wu - u > 15;
    return {
      ...baseResult,
      notice: weightLimited
        ? {
            tone: "warn" as const,
            title: "Weight-limited cargo",
            body: "Adding more boxes won't help — this load hits the container's weight cap before it fills the volume. Consider a higher-payload container (e.g. 40HC heavy-duty) or split across two shipments.",
          }
        : undefined,
      items: [
        ...baseResult.items,
        {
          label: "Container Utilization",
          value: `${u.toFixed(1)}%`,
          tone: toneFor(u),
          gauge: u,
          hint:
            "Cargo CBM ÷ container CBM — how full the container is overall.\n" +
            "Green ≥85% · Amber 70–84% · Red <70%.",
        },
        {
          label: "Weight Utilization",
          value: `${wu.toFixed(1)}%`,
          tone: toneFor(wu),
          gauge: wu,
          hint:
            "Used weight ÷ container max payload — catches dense cargo that hits the weight limit before the volume limit.\n" +
            "Green ≥85% · Amber 70–84% · Red <70%.",
        },
        {
          label: "Packing Density",
          value: `${d.toFixed(1)}%`,
          tone: toneFor(d),
          gauge: d,
          hint:
            "Placed cargo CBM ÷ bounding-box CBM of placed boxes — how tightly the cargo is squeezed inside the volume it actually occupies.\n" +
            "Green ≥85% · Amber 70–84% · Red <70%.",
        },
      ],
    };
  }, [baseResult, activePack]);
  // Recommendation strategy:
  //   - Pre-optimize (or while typing): run the cheap CBM-only recommender
  //     against `draftItems` so the banner updates instantly with no main-
  //     thread packing per keystroke.
  //   - Post-optimize (showOptimization === true): run the geometry-aware
  //     recommender inside the Web Worker so the heavy 3D packs don't block
  //     input. Falls back to the fast version until the worker resolves.
  const worker = usePackingWorker();
  const fastRecommendation = useMemo<ContainerRecommendation>(() => {
    let cbm = 0;
    let wt = 0;
    for (const it of draftItems) {
      cbm += ((it.length * it.width * it.height) / 1_000_000) * (it.qty || 0);
      wt += (it.weight || 0) * (it.qty || 0);
    }
    return recommendContainersFast(cbm, wt);
  }, [draftItems]);
  const [workerRecommendation, setWorkerRecommendation] = useState<ContainerRecommendation | null>(null);
  const [workerBucketPacks, setWorkerBucketPacks] = useState<AdvancedPackResult[]>([]);

  const recommendation: ContainerRecommendation = workerRecommendation ?? fastRecommendation;

  // Per-unit placed/total counts — drives the "12/16 placed" badges.
  // When we have real bucket packs from the worker, use exact placedCartons.
  // Otherwise fall back to the cheap CBM × 0.85 estimate.
  const unitStats = useMemo(() => {
    if (!recommendation.isMulti) return undefined;
    if (workerBucketPacks.length === recommendation.units.length) {
      return recommendation.units.map((_, i) => {
        const pack = workerBucketPacks[i];
        const total = pack.perItem.reduce((s, p) => s + p.requested, 0);
        const placed = pack.placedCartons;
        return { placed, total };
      });
    }
    // Fallback: rough CBM-based estimate (only used briefly while worker is busy).
    return recommendation.units.map((u) => {
      const containerCbm = (u.container.inner.l * u.container.inner.w * u.container.inner.h) / 1_000_000_000;
      const usable = containerCbm * 0.85;
      const total = Math.max(0, Math.round((u.fillCbm / Math.max(0.0001, u.fillCbm)) * 0));
      // We don't have real bucket totals in the fast path — show approximate fullness instead.
      const placedFraction = u.fillCbm > 0 ? Math.min(1, usable / u.fillCbm) : 1;
      return { placed: Math.round(total * placedFraction), total };
    });
  }, [recommendation, workerBucketPacks]);


  // Clamp persisted idx if it's now out of range (e.g. switched single↔multi
  // or unit count shrank). Otherwise leave the user's last-viewed bucket alone
  // so refreshing on a multi-container result keeps state.
  useEffect(() => {
    const max = recommendation.isMulti ? recommendation.units.length - 1 : 0;
    if (activeUnitIdx > max || activeUnitIdx < 0) {
      setActiveUnitIdx(0);
    }
  }, [recommendation.isMulti, recommendation.units.length, activeUnitIdx]);

  // Persist on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(ACTIVE_UNIT_KEY, String(activeUnitIdx));
    } catch {
      /* quota — ignore */
    }
  }, [activeUnitIdx]);

  // ARIA live announcements for active bucket changes (multi-container only).
  // Skip the first mount so SR users aren't bombarded on page load. Clear the
  // message ~2s after each change so re-selecting the same card re-announces.
  const [liveMessage, setLiveMessage] = useState("");
  const firstMountRef = useRef(true);
  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      return;
    }
    if (!recommendation.isMulti) return;
    const total = recommendation.units.length;
    const unit = recommendation.units[activeUnitIdx];
    if (!unit) return;
    const stats = unitStats?.[activeUnitIdx];
    const placedTxt = stats ? `, ${stats.placed} of ${stats.total} placed` : "";
    setLiveMessage(
      `Now viewing container ${activeUnitIdx + 1} of ${total}: ${unit.container.name}${placedTxt}.`,
    );
    const t = setTimeout(() => setLiveMessage(""), 2000);
    return () => clearTimeout(t);
  }, [activeUnitIdx, recommendation.isMulti, recommendation.units, unitStats]);

  const handleUnitSelect = (idx: number) => {
    setActiveUnitIdx(idx);
    // Smooth-scroll the 3D viewer into view so the user immediately sees the
    // bucket they just picked rendered below.
    requestAnimationFrame(() => {
      document
        .getElementById("container-load-viewer")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Items that have real dimensions but haven't had packing options confirmed yet.
  // Read from draftItems so the optimize CTA reflects what the user just typed,
  // not the debounced parent state (which lags 400-800ms behind).
  const unconfirmed = useMemo(
    () =>
      draftItems.filter(
        (it) => it.length > 0 && it.width > 0 && it.height > 0 && it.qty > 0 && !it.packingConfirmed,
      ),
    [draftItems],
  );
  const allConfirmed = unconfirmed.length === 0 && draftItems.some((it) => it.length > 0);
  const hasAnyDims = draftItems.some((it) => it.length > 0 && it.width > 0 && it.height > 0 && it.qty > 0);
  const showOptimization = optimizationRequested && allConfirmed;

  const update = (id: string, patch: Partial<CbmItem>) => {
    setDraftItems(draftItems.map((it) => (it.id === id ? { ...it, ...patch } : it)));
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


  /** Resolve a row's effective length unit (per-row override → global default). */
  const lenUnitFor = (it: CbmItem) => it.lenUnit ?? lenUnit;
  const wtUnitFor = (it: CbmItem) => it.wtUnit ?? wtUnit;

  const showLen = (cm: number, unit: typeof lenUnit) => {
    const v = cmTo(cm, unit);
    return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
  };
  /** Draft-only update: writes to local state, debounced flush sends to parent. */
  const updateDraft = (id: string, patch: Partial<CbmItem>) => {
    setDraftItems(draftItems.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const setLen =
    (id: string, key: "length" | "width" | "height", unit: typeof lenUnit) => (n: number) =>
      updateDraft(id, { [key]: Number.isFinite(n) ? toCm(n, unit) : 0 } as Partial<CbmItem>);

  const showWt = (kg: number, unit: typeof wtUnit) => {
    const v = kgTo(kg, unit);
    return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
  };
  const setWt = (id: string, unit: typeof wtUnit) => (n: number) =>
    updateDraft(id, { weight: Number.isFinite(n) ? toKg(n, unit) : 0 });

  /** Update Item 1's per-row unit AND the global default (so new rows inherit). */
  const setRowLenUnit = (it: CbmItem, idx: number) => (u: typeof lenUnit) => {
    update(it.id, { lenUnit: u });
    if (idx === 0) setLenUnit(u);
  };
  const setRowWtUnit = (it: CbmItem, idx: number) => (u: typeof wtUnit) => {
    update(it.id, { wtUnit: u });
    if (idx === 0) setWtUnit(u);
  };

  const inputsTable = draftItems.flatMap((it, idx) => {
    const itemCbm = (it.length * it.width * it.height * it.qty) / 1_000_000;
    const itemWt = it.qty * it.weight;
    const rows = [
      { label: `Item ${idx + 1} L×W×H (cm)`, value: `${it.length} × ${it.width} × ${it.height}` },
      { label: `Item ${idx + 1} Qty / Unit Wt`, value: `${it.qty} pcs / ${it.weight} kg` },
      { label: `Item ${idx + 1} Subtotal CBM`, value: `${itemCbm.toFixed(4)} m³` },
      { label: `Item ${idx + 1} Subtotal Weight`, value: `${itemWt.toFixed(2)} kg` },
    ];
    if (it.packingConfirmed) {
      rows.push({ label: `Item ${idx + 1} Packing`, value: buildSummary(it) });
    }
    return rows;
  });

  // On-screen KPI tiles (also folded into the PDF via resolveExtras).
  // Synchronous so users see headline metrics in the Results card immediately
  // after clicking Optimize, without waiting for snapshot capture.
  const staticExtras = useMemo<import("@/lib/freight/pdf").PdfExtras | undefined>(() => {
    if (!activePack || activePack.placed.length === 0) return undefined;
    const totalCbm = items.reduce(
      (a, it) => a + (it.length * it.width * it.height * it.qty) / 1_000_000,
      0,
    );
    const totalWt = items.reduce((a, it) => a + it.qty * it.weight, 0);
    const toneFor = (n: number): "good" | "warn" | "bad" =>
      n >= 85 ? "good" : n >= 70 ? "warn" : "bad";
    return {
      analytics: {
        kpis: [
          { label: "Total CBM", value: `${totalCbm.toFixed(2)} m³` },
          { label: "Total Weight", value: `${totalWt.toFixed(0)} kg` },
          {
            label: "Container Util.",
            value: `${activePack.utilizationPct.toFixed(1)}%`,
            tone: toneFor(activePack.utilizationPct),
          },
          {
            label: "Packing Density",
            value: `${activePack.densityPct.toFixed(1)}%`,
            tone: toneFor(activePack.densityPct),
          },
        ],
      },
    };
  }, [items, activePack]);

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-5">
        {draftItems.map((it, idx) => {
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
              {(() => {
                const rowLen = lenUnitFor(it);
                const rowWt = wtUnitFor(it);
                const rowCbm = (it.length * it.width * it.height * it.qty) / 1_000_000;
                return (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="size-3 rounded-sm border border-black/10"
                          style={{ background: color }}
                          aria-hidden
                        />
                        <h4 className="text-sm font-semibold text-brand-navy">Item {idx + 1}</h4>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <UnitSelector
                            id={`cbm-len-unit-${it.id}`}
                            value={rowLen}
                            onChange={setRowLenUnit(it, idx)}
                            compact
                          />
                          <WeightUnitSelector
                            id={`cbm-wt-unit-${it.id}`}
                            value={rowWt}
                            onChange={setRowWtUnit(it, idx)}
                            compact
                          />
                          {/* Inline Package type selector — chosen per item, syncs with packing options popover */}
                          <Select
                            value={it.packageType ?? "carton"}
                            onValueChange={(v) =>
                              updatePacking(it.id, { packageType: v as PackageType })
                            }
                          >
                            <SelectTrigger
                              className="h-7 w-auto gap-1 rounded-full border-brand-navy/25 bg-muted/40 px-2.5 py-0 text-[11px] font-medium text-brand-navy shadow-none focus:ring-1"
                              aria-label={`Item ${idx + 1} package type`}
                            >
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Pkg
                              </span>
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
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <NumberField compact id={`l-${it.id}`} label="Length" suffix={rowLen} required value={showLen(it.length, rowLen)} onChange={setLen(it.id, "length", rowLen)} hint={`Outer length of one carton in ${rowLen}.`} />
                      <NumberField compact id={`w-${it.id}`} label="Width" suffix={rowLen} required value={showLen(it.width, rowLen)} onChange={setLen(it.id, "width", rowLen)} hint={`Outer width in ${rowLen}.`} />
                      <NumberField compact id={`h-${it.id}`} label="Height" suffix={rowLen} required value={showLen(it.height, rowLen)} onChange={setLen(it.id, "height", rowLen)} hint={`Outer height in ${rowLen}.`} />
                      <NumberField compact id={`q-${it.id}`} label="Qty" required step={1} value={it.qty} onChange={(n) => updateDraft(it.id, { qty: Math.max(1, Math.round(n)) })} hint="Number of identical cartons." />
                      <NumberField compact id={`wt-${it.id}`} label="Weight" suffix={rowWt} required value={showWt(it.weight, rowWt)} onChange={setWt(it.id, rowWt)} hint={`Actual weight of ONE carton (gross) in ${rowWt}.`} />
                      <div
                        className="flex flex-col justify-center rounded-lg border-2 border-brand-navy/20 bg-brand-navy-soft/40 px-3 py-1.5"
                        aria-label={`Item ${idx + 1} CBM`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">CBM</span>
                        <span className="text-lg font-bold leading-tight" style={{ color: "var(--brand-orange)" }}>
                          {Number.isFinite(rowCbm) ? rowCbm.toFixed(4) : "—"}
                          <span className="ml-0.5 text-[10px] font-semibold text-muted-foreground">m³</span>
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
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
        {!showOptimization && (
          <Card
            id="cbm-optimize-cta"
            className="border-2 border-brand-navy/30 bg-gradient-to-br from-brand-navy-soft to-background p-4 sm:p-5 scroll-mt-24"
          >
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
              {hasAnyDims ? (
                <Button
                  size="sm"
                  className="text-white shadow-sm hover:opacity-90"
                  style={{ background: "var(--brand-orange)" }}
                  onClick={() => {
                    // Flush any pending debounced edits so the optimizer sees
                    // the latest typed values immediately (not 400-800ms later).
                    setItems(draftItems);
                    if (allConfirmed) {
                      setOptimizationRequested(true);
                    } else {
                      setConfirmModalOpen(true);
                    }
                  }}
                >
                  <Sparkles className="size-3.5" /> Optimize loading
                </Button>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button
                          size="sm"
                          disabled
                          className="text-white shadow-sm opacity-60"
                          style={{ background: "var(--brand-orange)" }}
                        >
                          <Sparkles className="size-3.5" /> Optimize loading
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">Enter cargo dimensions first</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </Card>
        )}
      </div>
      <div className="space-y-6 lg:col-span-7">
      <div className="lg:sticky lg:top-[140px] lg:self-start">
      {/* sticky wrapper preserved for results card on desktop */}
      <ResultsCard
        result={result}
        inputsTable={inputsTable}
        extras={staticExtras}
        pdfDisabledReason={
          showOptimization
            ? null
            : "Click 'Optimize loading' and confirm packing options to enable PDF export with the 3D loading plan."
        }
        resolveExtras={async () => {
          const h = loadHandleRef.current;
          if (!h) return undefined;
          const snaps = await h.capture();
          const pack = h.getActivePack();
          const extras: import("@/lib/freight/pdf").PdfExtras = {};
          if (snaps) extras.snapshots = snaps;
          if (pack && pack.placed.length > 0) {
            const { buildRows, computeWallEfficiency, instructionFor, itemCountsForRow, buildRowSideViewSvg, buildRowFrontViewSvg, buildRowTopViewSvg } =
              await import("@/lib/freight/loading-rows");
            const { readHeavyThreshold } = await import("@/components/freight/loading-rows-panel");
            const rows = buildRows(pack, readHeavyThreshold());
            extras.wallEfficiency = computeWallEfficiency(rows);
            // Rasterise each side-view SVG to a PNG dataURL for jsPDF.
            const svgToPng = (svg: string): Promise<string | undefined> =>
              new Promise((resolve) => {
                const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                  const scale = 2; // crisp on print
                  const canvas = document.createElement("canvas");
                  canvas.width = img.width * scale;
                  canvas.height = img.height * scale;
                  const ctx = canvas.getContext("2d");
                  if (!ctx) {
                    URL.revokeObjectURL(url);
                    resolve(undefined);
                    return;
                  }
                  ctx.fillStyle = "#ffffff";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  URL.revokeObjectURL(url);
                  try {
                    resolve(canvas.toDataURL("image/png"));
                  } catch {
                    resolve(undefined);
                  }
                };
                img.onerror = () => {
                  URL.revokeObjectURL(url);
                  resolve(undefined);
                };
                img.src = url;
              });

            extras.loadingRows = await Promise.all(
              rows.map(async (r) => {
                const doorSvg = buildRowSideViewSvg(r, pack, { width: 260, height: 104 });
                const sideSvg = buildRowFrontViewSvg(r, pack, { width: 260, height: 104 });
                const topSvg = buildRowTopViewSvg(r, pack, { width: 260, height: 104 });
                const [sideViewPng, frontViewPng, topViewPng] = await Promise.all([
                  svgToPng(doorSvg),
                  svgToPng(sideSvg),
                  svgToPng(topSvg),
                ]);
                return {
                  rowIdx: r.rowIdx,
                  xStartM: r.xStart / 1000,
                  xEndM: r.xEnd / 1000,
                  pkgCount: r.boxes.length,
                  layers: r.layers,
                  cbm: r.totalCbm,
                  weightKg: r.totalWeightKg,
                  hasFragile: r.hasFragile,
                  hasNonStack: r.hasNonStack,
                  rotatedCount: r.rotatedCount,
                  needsSeparator: r.needsSeparator,
                  wallUtilizationPct: r.wallUtilizationPct,
                  gapWarning: r.gapWarning,
                  items: itemCountsForRow(r, pack),
                  instruction: instructionFor(r),
                  sideViewPng,
                  frontViewPng,
                  topViewPng,
                };
              }),
            );
          }
          // KPI tiles for PDF cover.
          if (pack && pack.placed.length > 0) {
            const totalCbm = items.reduce(
              (a, it) => a + (it.length * it.width * it.height * it.qty) / 1_000_000,
              0,
            );
            const totalWt = items.reduce((a, it) => a + it.qty * it.weight, 0);
            const toneFor = (n: number): "good" | "warn" | "bad" =>
              n >= 85 ? "good" : n >= 70 ? "warn" : "bad";
            extras.analytics = {
              kpis: [
                { label: "Total CBM", value: `${totalCbm.toFixed(2)} m³` },
                { label: "Total Weight", value: `${totalWt.toFixed(0)} kg` },
                {
                  label: "Container Util.",
                  value: `${pack.utilizationPct.toFixed(1)}%`,
                  tone: toneFor(pack.utilizationPct),
                },
                {
                  label: "Packing Density",
                  value: `${pack.densityPct.toFixed(1)}%`,
                  tone: toneFor(pack.densityPct),
                },
              ],
            };
          }
          return Object.keys(extras).length ? extras : undefined;
        }}
      />
      </div>

      {/* Optimization plan — now part of the right column so the 3D viewer sits
          beside the inputs on lg+ screens, stacked below on mobile. */}
      {showOptimization && (
        <div className="space-y-3">
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
            activeUnitIdx={activeUnitIdx}
            onUnitSelect={handleUnitSelect}
            unitStats={unitStats}
          />
          <ContainerLoadView
            items={items}
            recommendation={recommendation}
            forcedChoice={forcedChoice}
            onChoiceChange={setForcedChoice}
            activeUnitIdx={activeUnitIdx}
            onActiveUnitChange={setActiveUnitIdx}
            onReady={(h) => {
              loadHandleRef.current = h;
              setActivePack(h.getActivePack());
            }}
          />
        </div>
      )}
      </div>
    </div>

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
    {/* ARIA live region — announces multi-container bucket changes to screen readers.
        suppressHydrationWarning: the region is empty at SSR time and is populated
        only after mount via useEffect, so any text mismatch is benign. */}
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      suppressHydrationWarning
    >
      {liveMessage}
    </div>
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
        {isRigidUnit(it.packageType) ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <strong className="font-semibold">{it.packageType === "pallet" ? "Pallets" : "Crates"} ship in fixed orientation.</strong>{" "}
            {it.packageType === "pallet"
              ? "4-way entry pallets may rotate L↔W on the floor, but never tip."
              : "Crates may rotate L↔W on the floor, but never tip onto a side."}
          </div>
        ) : (
          <>
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
          </>
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
