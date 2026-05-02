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
  AlertTriangle,
  Container as ContainerIcon,
  Box,
  Video,
  RotateCcw,
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
import { calcCbm, defaultsForPackageType, emptyCbmItem, getRotationPolicy, type CbmItem, type PackageType } from "@/lib/freight/calculators";
import { CONTAINERS, ITEM_COLORS } from "@/lib/freight/packing";
import {
  analyseGeometricCeiling,
  recommendContainers,
  recommendContainersFast,
  type ContainerRecommendation,
  type GeometricCeilingReport,
} from "@/lib/freight/container-recommender";
import { usePackingWorker } from "@/hooks/use-packing-worker";


import { ContainerSuggestion } from "@/components/freight/container-suggestion";
import { CbmDebugPanel } from "@/components/freight/cbm-debug-panel";
import { nextId } from "@/lib/freight/ids";
import { cn } from "@/lib/utils";
import {
  createCbmSyncRecorder,
  NOOP_RECORDER,
  type CbmSyncRecorder,
} from "@/lib/freight/cbm-sync-metrics";

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

/**
 * Helper: when packageType changes, snap rotation flags to the new type's
 * defaults (and drop any that the new type forbids).
 */
const withPackageTypeReset = (
  patch: Partial<CbmItem>,
): Partial<CbmItem> => {
  if (patch.packageType) {
    return { ...patch, ...defaultsForPackageType(patch.packageType) };
  }
  return patch;
};

export function CbmCalculator({ items, setItems }: Props) {
  const [lenUnit, setLenUnit] = usePersistentLengthUnit();
  const [wtUnit, setWtUnit] = usePersistentWeightUnit();
  const [draftItems, setDraftItems] = useState<CbmItem[]>(items);
  // Track the last array we pushed up to the parent so we can ignore the
  // echo back through props (which would otherwise cause an infinite
  // setDraftItems → setItems → setDraftItems loop — React error #185).
  const lastPushedRef = useRef<CbmItem[]>(items);
  // Always-fresh ref to the parent setter so `pushItems` can stay stable
  // across renders (callers like buttons / modals don't re-bind every render).
  const setItemsRef = useRef(setItems);
  useEffect(() => {
    setItemsRef.current = setItems;
  }, [setItems]);
  // Dev-only metrics recorder — counts parent pushes & sync-effect cycles
  // and warns to the console if a loop fingerprint appears (#185 early
  // detection). NOOP_RECORDER is used during SSR and in production builds so
  // there is zero runtime overhead and no chance of an SSR ReferenceError.
  // Exposed on `window.__cbmSyncMetrics` in dev for quick inspection.
  const recorderRef = useRef<CbmSyncRecorder>(NOOP_RECORDER);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (typeof window === "undefined") return;
    // Swap to the real recorder on the client only — never during SSR render.
    recorderRef.current = createCbmSyncRecorder();
    (window as unknown as { __cbmSyncMetrics?: CbmSyncRecorder }).__cbmSyncMetrics =
      recorderRef.current;
  }, []);
  /**
   * Single funnel for pushing items to the parent. ALWAYS use this (never call
   * `setItems` directly) so `lastPushedRef` stays in sync and the
   * items↔draftItems sync effects below don't ping-pong forever (#185).
   */
  const pushItems = useCallback((next: CbmItem[]) => {
    lastPushedRef.current = next;
    setDraftItems(next);
    setItemsRef.current(next);
    recorderRef.current.recordParentPush("push-items");
  }, []);
  useEffect(() => {
    if (items === lastPushedRef.current) return;
    recorderRef.current.recordEffectCycle("items->draft");
    lastPushedRef.current = items;
    setDraftItems(items);
  }, [items]);
  useEffect(() => {
    if (draftItems === lastPushedRef.current) return;
    recorderRef.current.recordEffectCycle("draft->items");
    // Adaptive debounce: tighter for small manifests (responsive feel),
    // looser for large ones (avoids re-running heavy downstream work mid-typing).
    // Lightweight per-row CBM and Total CBM tiles read from `draftItems`
    // directly, so this delay only affects the geometry-aware recommender.
    const delay = draftItems.length > 10 ? 600 : 250;
    const t = setTimeout(() => {
      lastPushedRef.current = draftItems;
      setItemsRef.current(draftItems);
      recorderRef.current.recordParentPush("draft-flush");
    }, delay);
    return () => clearTimeout(t);
  }, [draftItems]);
  const [forcedChoice, setForcedChoice] = useState<import("@/lib/freight/container-ids").ContainerId | null>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const loadHandleRef = useRef<{
    capture: () => Promise<{ iso: string; front: string; side: string } | null>;
    getActivePack: () => import("@/lib/freight/packing-advanced").AdvancedPackResult | null;
  } | null>(null);
  const [optimizationRequested, setOptimizationRequested] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const openConfirmModal = useCallback(() => setConfirmModalOpen(true), []);
  const [activePack, setActivePack] = useState<
    import("@/lib/freight/packing-advanced").AdvancedPackResult | null
  >(null);
  // Stable handler for ContainerLoadView's onReady callback. CRITICAL: this
  // MUST be referentially stable across renders — if it changes identity,
  // ContainerLoadView's effect (which depends on `onReady`) re-fires and
  // calls back here → setActivePack → re-render → new handler → loop forever
  // (React error #185). useCallback with empty deps is correct because the
  // setters and ref are stable.
  const handleViewerReady = useCallback(
    (h: {
      capture: () => Promise<{ iso: string; front: string; side: string } | null>;
      getActivePack: () => import("@/lib/freight/packing-advanced").AdvancedPackResult | null;
    }) => {
      loadHandleRef.current = h;
      setActivePack(h.getActivePack());
    },
    [],
  );
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

    // Stacking-rule warning: surfaced when at least one carton went unplaced
    // because a stacking rule fired during its placement scan. The dominant
    // rule (most-frequent rejection) drives the explanation copy so the user
    // knows exactly what to relax (e.g. weight cap) or accept (e.g. fragility).
    const sd = activePack.stackingDiagnostics;
    const stackingNotice =
      sd && sd.unplacedDueToStacking > 0 && sd.dominantReason
        ? (() => {
            const ruleCopy: Record<
              NonNullable<typeof sd.dominantReason>,
              { title: string; body: string }
            > = {
              support: {
                title: "Stacking reduced — insufficient support below",
                body: `${sd.unplacedDueToStacking} carton(s) didn't fit because the box(es) they would sit on don't cover at least 85% of their footprint. Try grouping identical SKUs together or use a more uniform package size.`,
              },
              sealed: {
                title: "Stacking reduced — fragile cargo on top",
                body: `${sd.unplacedDueToStacking} carton(s) couldn't stack: a fragile item is already on top of the column below. Mark items as non-fragile if they actually are stackable, or load fragile cargo last.`,
              },
              stackWeight: {
                title: "Stacking reduced — max stack-weight reached",
                body: `${sd.unplacedDueToStacking} carton(s) would exceed the "max stack weight" of an item below. Raise the limit on those items if their packaging supports it, or split the load.`,
              },
              nonStackable: {
                title: "Stacking reduced — non-stackable items",
                body: `${sd.unplacedDueToStacking} carton(s) didn't fit because the items below are flagged "non-stackable" and floor space ran out. Allow stacking on those items, or use a larger container.`,
              },
            };
            const c = ruleCopy[sd.dominantReason];
            return { tone: "warn" as const, title: c.title, body: c.body };
          })()
        : undefined;

    return {
      ...baseResult,
      // Stacking warning takes precedence — it tells the user *why* cartons
      // were lost, which is more actionable than the weight-limited tip.
      notice:
        stackingNotice ??
        (weightLimited
          ? {
              tone: "warn" as const,
              title: "Weight-limited cargo",
              body: "Adding more boxes won't help — this load hits the container's weight cap before it fills the volume. Consider a higher-payload container (e.g. 40HC heavy-duty) or split across two shipments.",
            }
          : undefined),
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
  //   - Post-optimize (showOptimization === true, set further below): run the
  //     geometry-aware recommender inside the Web Worker so the heavy 3D packs
  //     don't block input. Falls back to the fast version until the worker
  //     resolves.
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

  const recommendation: ContainerRecommendation = workerRecommendation ?? fastRecommendation;

  // Geometric ceiling analysis — pure geometry, runs on every keystroke. Detects
  // items whose dimensions cap utilisation regardless of packer effort
  // (e.g. a 1.22m cube can't pair-side or stack 2-high in a 40' GP).
  const ceilingReport = useMemo<GeometricCeilingReport>(() => {
    const containerId = forcedChoice ?? recommendation.units[0]?.container.id ?? "40gp";
    const target = CONTAINERS.find((c) => c.id === containerId) ?? CONTAINERS[1];
    return analyseGeometricCeiling(draftItems, target);
  }, [draftItems, forcedChoice, recommendation]);

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

  // Once the user has clicked "Optimize loading", run the geometry-aware
  // recommender inside the Web Worker. Re-runs on every committed `items`
  // change. While in flight, the UI keeps showing the previous worker result
  // (or the cheap fast recommendation if none yet) so badges don't flicker.
  useEffect(() => {
    if (!showOptimization) return;
    if (items.length === 0) return;
    let cancelled = false;
    worker
      .recommend(items)
      .then((res) => {
        if (cancelled) return;
        setWorkerRecommendation(res.recommendation);
      })
      .catch(() => {
        // Swallow — if the worker fails we keep the fast CBM recommendation
        // visible rather than blanking the panel.
      });
    return () => {
      cancelled = true;
    };
  }, [showOptimization, items, worker.recommend]);

  // When the user un-confirms or wipes the manifest, drop stale worker results
  // so the banner reverts to the cheap fast recommendation immediately.
  useEffect(() => {
    if (!showOptimization) {
      setWorkerRecommendation(null);
    }
  }, [showOptimization]);

  // Stable callbacks: keep identity across renders so memoised <CbmRow> only
  // re-renders when its own item changes, not when *any* item changes.
  const update = useCallback(
    (id: string, patch: Partial<CbmItem>) => {
      setDraftItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    },
    [],
  );
  const updateDraft = useCallback(
    (id: string, patch: Partial<CbmItem>) => {
      setDraftItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    },
    [],
  );
  /** Toggle a packing flag and auto-confirm the row in one shot. */
  const updatePacking = useCallback(
    (id: string, patch: Partial<CbmItem>) => {
      pushItems(
        items.map((it) => (it.id === id ? { ...it, ...patch, packingConfirmed: true } : it)),
      );
    },
    [items, pushItems],
  );
  const remove = useCallback(
    (id: string) => pushItems(items.filter((it) => it.id !== id)),
    [items, pushItems],
  );
  const duplicate = useCallback(
    (id: string) => {
      const src = items.find((it) => it.id === id);
      if (!src) return;
      pushItems([...items, { ...src, id: nextId("cbm") }]);
    },
    [items, pushItems],
  );
  const add = useCallback(() => pushItems([...items, emptyCbmItem()]), [items, pushItems]);
  const clear = useCallback(() => pushItems([emptyCbmItem(0)]), [pushItems]);
  const resetAll = useCallback(() => {
    pushItems([{ ...emptyCbmItem(0), qty: 0, lenUnit: undefined, wtUnit: undefined, packageType: "carton" }]);
    setLenUnit("cm");
    setWtUnit("kg");
    setForcedChoice(null);
    setOptimizationRequested(false);
    setActivePack(null);
    setOpenPopoverId(null);
    setConfirmModalOpen(false);
  }, [pushItems, setLenUnit, setWtUnit]);

  /** Copy one row's packing options to every other row & mark them all confirmed. */
  const applyToAll = useCallback(
    (sourceId: string) => {
      const src = items.find((it) => it.id === sourceId);
      if (!src) return;
      pushItems(
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
    },
    [items, pushItems],
  );

  /** Update the row's per-row unit AND, for Item 1, also the global default. */
  const setRowLenUnit = useCallback(
    (id: string, isFirst: boolean) => (u: LengthUnit) => {
      update(id, { lenUnit: u });
      if (isFirst) setLenUnit(u);
    },
    [update, setLenUnit],
  );
  const setRowWtUnit = useCallback(
    (id: string, isFirst: boolean) => (u: WeightUnit) => {
      update(id, { wtUnit: u });
      if (isFirst) setWtUnit(u);
    },
    [update, setWtUnit],
  );

  // Per-id callback caches. CRITICAL for avoiding React error #185:
  //   - `registerRef` is forwarded into Radix Slot/Card composition. Passing
  //     a NEW arrow function on every render makes Radix's `useComposedRefs`
  //     call setRef(null)+setRef(el) each render. setRef internally calls a
  //     useState setter, and during layout-effect cleanup that turns into
  //     "Maximum update depth exceeded".
  //   - `onPopoverOpenChange` and `renderPopover` would similarly thrash
  //     Radix Popover's ref machinery.
  // Keying by `it.id` ensures each row gets a stable function across renders.
  const refCallbacksRef = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  const getRegisterRef = useCallback((id: string) => {
    let cb = refCallbacksRef.current.get(id);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        rowRefs.current[id] = el;
      };
      refCallbacksRef.current.set(id, cb);
    }
    return cb;
  }, []);
  const popoverOpenChangeRef = useRef<Map<string, (open: boolean) => void>>(new Map());
  const getPopoverOpenChange = useCallback((id: string) => {
    let cb = popoverOpenChangeRef.current.get(id);
    if (!cb) {
      cb = (open: boolean) => setOpenPopoverId(open ? id : null);
      popoverOpenChangeRef.current.set(id, cb);
    }
    return cb;
  }, []);

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
    // Derive totals from draftItems so the KPI tile values match the live
    // per-row CBM tiles even mid-typing (parent `items` lags behind by debounce).
    const totalCbm = draftItems.reduce(
      (a, it) => a + (it.length * it.width * it.height * it.qty) / 1_000_000,
      0,
    );
    const totalWt = draftItems.reduce((a, it) => a + it.qty * it.weight, 0);
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
  }, [draftItems, activePack]);

  return (
    <div className="space-y-8">
    <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-7">
        {draftItems.map((it, idx) => (
          <CbmRow
            key={it.id}
            item={it}
            idx={idx}
            color={ITEM_COLORS[idx % ITEM_COLORS.length]}
            globalLenUnit={lenUnit}
            globalWtUnit={wtUnit}
            popoverOpen={openPopoverId === it.id}
            onPopoverOpenChange={getPopoverOpenChange(it.id)}
            registerRef={getRegisterRef(it.id)}
            allowRemove={items.length > 1}
            onUpdateDraft={updateDraft}
            onUpdatePacking={updatePacking}
            onDuplicate={duplicate}
            onRemove={remove}
            onSetLenUnit={setRowLenUnit(it.id, idx === 0)}
            onSetWtUnit={setRowWtUnit(it.id, idx === 0)}
            renderPopover={() =>
              renderPackingPopoverContent({
                it,
                idx,
                items,
                updatePacking,
                applyToAll,
                closePopover: () => setOpenPopoverId(null),
              })
            }
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <Button onClick={add} size="sm" variant="outline" className="border-brand-navy text-brand-navy">
            <Plus className="size-4" /> Add Item
          </Button>
          <Button onClick={clear} size="sm" variant="ghost" className="text-muted-foreground">
            Clear all
          </Button>
          <Button
            onClick={resetAll}
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Reset all values and start a new optimization"
          >
            <RotateCcw className="size-4" /> Reset
          </Button>
        </div>
      </div>
      <div className="lg:col-span-5">
      {/* Results card sits beside inputs on lg+; stacks below on mobile.
          NOTE: sticky positioning was removed — the WebGL canvas in the
          optimization block could break out of the sticky stacking context
          and visually overlap the Results card on certain viewports. */}
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
          const extras: import("@/lib/freight/pdf").PdfExtras = {};
          if (h) {
            const snaps = await h.capture();
            if (snaps) extras.snapshots = snaps;
          }
          const pack = loadHandleRef.current?.getActivePack() ?? null;
          if (pack && pack.placed.length > 0) {
            const { buildRows, itemCountsForRow, instructionFor } = await import(
              "@/lib/freight/loading-rows"
            );
            const { computeWallEfficiency } = await import("@/lib/freight/loading-rows");
            const {
              buildRowSideViewSvg,
              buildRowFrontViewSvg,
              buildRowTopViewSvg,
              buildRowIsoViewSvg,
            } = await import("@/lib/freight/loading-rows");
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
                  const scale = 2;
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
                const isoSvg = buildRowIsoViewSvg(r, pack, rows, { width: 260, height: 170 });
                const [sideViewPng, frontViewPng, topViewPng, isoViewPng] = await Promise.all([
                  svgToPng(doorSvg),
                  svgToPng(sideSvg),
                  svgToPng(topSvg),
                  svgToPng(isoSvg),
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
                  isoViewPng,
                };
              }),
            );
          }
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
    </div>

    {/* Optimize-container CTA — full width below the inputs/results grid so
        Results doesn't have empty trailing space when items column grows. */}
    {!showOptimization && (
      <Card
        id="cbm-optimize-cta"
        className="mx-auto w-[calc(100%-1rem)] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-5rem)] rounded-xl border border-brand-navy/20 bg-card p-3.5 pr-16 sm:p-4 sm:pr-20 scroll-mt-24 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="rounded-full bg-brand-orange/10 p-2.5 text-brand-orange">
              <Sparkles className="size-6" />
            </div>
            <div className="max-w-2xl">
              <h3 className="text-xl font-bold text-brand-navy">
                Get container optimization plan
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Find the best-fit container for your cargo and get an interactive 3D loading
                plan with row-by-row instructions — ready for your forwarder.
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-brand-navy/85">
                <li className="flex items-center gap-1.5">
                  <ContainerIcon className="size-4 text-brand-orange" /> Best-fit container
                </li>
                <li className="flex items-center gap-1.5">
                  <Box className="size-4 text-brand-orange" /> 3D loading plan
                </li>
                <li className="flex items-center gap-1.5">
                  <Video className="size-4 text-brand-orange" /> Loading video
                </li>
              </ul>
            </div>
          </div>
          {hasAnyDims ? (
            <Button
              size="sm"
              className="text-white shadow-sm hover:opacity-90"
              style={{ background: "var(--brand-orange)" }}
              onClick={() => {
                pushItems(draftItems);
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
                <TooltipTrigger
                  type="button"
                  aria-disabled="true"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white opacity-60 shadow-sm"
                  style={{ background: "var(--brand-orange)" }}
                  onClick={(e) => e.preventDefault()}
                >
                  <Sparkles className="size-3.5" /> Optimize loading
                </TooltipTrigger>
                <TooltipContent side="top">Enter cargo dimensions first</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </Card>
    )}

    {/* Optimization plan — full-width below the inputs/results grid so the
        3D viewer has room to breathe on desktop and stacks cleanly on mobile,
        with no chance of overlapping the Results card. */}
    {showOptimization && (
      <div className="space-y-3">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={openConfirmModal}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-navy/70 hover:text-brand-navy hover:underline"
          >
            <Pencil className="size-3" /> Edit packing options
          </button>
        </div>
        <ContainerSuggestion
          recommendation={recommendation}
          currentChoice={forcedChoice ?? "auto"}
          onApply={setForcedChoice}
        />
        {ceilingReport.headline && (
          <div className="rounded-lg border-2 border-amber-400/60 bg-amber-50 p-3 text-sm dark:bg-amber-950/20 sm:p-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="size-4" />
              <span>{ceilingReport.headline}</span>
              {ceilingReport.suggestHc && forcedChoice !== "40hc" && (
                <Button
                  size="sm"
                  variant="default"
                  className="ml-auto h-7 bg-brand-navy px-2.5 text-[11px] text-white hover:bg-brand-navy/90"
                  onClick={() => setForcedChoice("40hc")}
                >
                  Switch to 40ft HC
                </Button>
              )}
            </div>
            <ul className="ml-6 list-disc space-y-1 text-[12px] text-amber-900/90 dark:text-amber-200/90">
              {ceilingReport.items.map((g) => (
                <li key={g.itemId}>{g.reason}</li>
              ))}
            </ul>
          </div>
        )}
        <ContainerLoadView
          items={items}
          recommendation={recommendation}
          forcedChoice={forcedChoice}
          onChoiceChange={setForcedChoice}
          onReady={handleViewerReady}
        />
      </div>
    )}

    {/* Confirm packing options modal */}
    <ConfirmPackingModal
      open={confirmModalOpen}
      onOpenChange={setConfirmModalOpen}
      items={items}
      onUpdate={updatePacking}
      onApplyToAll={applyToAll}
      onConfirm={() => {
        // Mark every dimensioned row as confirmed and unlock optimization.
        pushItems(
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
    <CbmDebugPanel
      info={{
        draftItems,
        committedItems: items,
        debounceMs: draftItems.length > 10 ? 600 : 250,
        workerPending: worker.pending,
        showOptimization,
        headlineTotalCbm: draftItems.reduce(
          (a, it) => a + (it.length * it.width * it.height * it.qty) / 1_000_000,
          0,
        ),
        recommendationSource: workerRecommendation ? "worker" : "fast",
        setDraftItems,
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
  disabled = false,
  disabledReason,
}: {
  title: string;
  desc: string;
  icon?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border border-brand-navy/20 bg-background px-3 py-2",
        disabled && "opacity-70",
      )}
      title={disabled && disabledReason ? disabledReason : undefined}
    >
      <div className="flex items-start gap-1.5">
        {icon}
        <div>
          <Label className="text-xs font-semibold text-brand-navy">{title}</Label>
          <p className="text-[10px] text-muted-foreground">
            {disabled && disabledReason ? disabledReason : desc}
          </p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function buildSummary(it: CbmItem): string {
  const bits: string[] = [];
  bits.push(it.packageType ?? "carton");
  if (it.stackable === false) bits.push("no-stack");
  if (it.fragile) bits.push("fragile");
  // Note: sideways state is rendered as its own dedicated toggle chip next
  // to the packing-options pill, so we intentionally omit it from this
  // joined-text summary to avoid duplication.
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
        {(() => {
          const policy = getRotationPolicy(it.packageType);
          const sidewaysDisabled = !policy.canSideways;
          const axisDisabled = !policy.canAxis || it.fragile === true;
          const axisReason = !policy.canAxis
            ? policy.axisReason
            : it.fragile
              ? "Fragile cargo cannot tip onto a side."
              : undefined;
          return (
            <>
              <ToggleRow
                title="Can lay sideways (90° L↔W)"
                desc="Packer may rotate 90° on the floor (swap length and width)."
                checked={!sidewaysDisabled && it.allowSidewaysRotation === true}
                onChange={(v) => updatePacking(it.id, { allowSidewaysRotation: v })}
                disabled={sidewaysDisabled}
                disabledReason={policy.sidewaysReason}
              />
              <ToggleRow
                title="Can stand on side (tip H↔L/W)"
                desc="Packer may tip it onto its side to fill upper headroom."
                checked={!axisDisabled && it.allowAxisRotation === true}
                onChange={(v) => updatePacking(it.id, { allowAxisRotation: v })}
                disabled={axisDisabled}
                disabledReason={axisReason}
              />
            </>
          );
        })()}
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
                        onValueChange={(v) => onUpdate(it.id, withPackageTypeReset({ packageType: v as PackageType }))}
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
                  {(() => {
                    const policy = getRotationPolicy(it.packageType);
                    const sidewaysDisabled = !policy.canSideways;
                    const axisDisabled = !policy.canAxis || it.fragile === true;
                    const axisReason = !policy.canAxis
                      ? policy.axisReason
                      : it.fragile
                        ? "Fragile cargo cannot tip onto a side."
                        : undefined;
                    return (
                      <>
                        <ToggleRow
                          title="Can lay sideways (90° L↔W)"
                          desc="Packer may rotate 90° on the floor (swap length and width)."
                          checked={!sidewaysDisabled && it.allowSidewaysRotation === true}
                          onChange={(v) => onUpdate(it.id, { allowSidewaysRotation: v })}
                          disabled={sidewaysDisabled}
                          disabledReason={policy.sidewaysReason}
                        />
                        <ToggleRow
                          title="Can stand on side (tip H↔L/W)"
                          desc="Packer may tip it onto its side to fill upper headroom."
                          checked={!axisDisabled && it.allowAxisRotation === true}
                          onChange={(v) => onUpdate(it.id, { allowAxisRotation: v })}
                          disabled={axisDisabled}
                          disabledReason={axisReason}
                        />
                      </>
                    );
                  })()}
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

/* ---------------- CbmRow (memoised) ---------------- */

interface CbmRowProps {
  item: CbmItem;
  idx: number;
  color: string;
  globalLenUnit: LengthUnit;
  globalWtUnit: WeightUnit;
  popoverOpen: boolean;
  onPopoverOpenChange: (open: boolean) => void;
  registerRef: (el: HTMLDivElement | null) => void;
  allowRemove: boolean;
  onUpdateDraft: (id: string, patch: Partial<CbmItem>) => void;
  onUpdatePacking: (id: string, patch: Partial<CbmItem>) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onSetLenUnit: (u: LengthUnit) => void;
  onSetWtUnit: (u: WeightUnit) => void;
  renderPopover: () => React.ReactNode;
}

/**
 * Single row of the CBM calculator manifest.
 *
 * Memoised so that with 20+ items, typing into row N only re-renders row N
 * instead of the entire list. Identity-stable callbacks from the parent are
 * mandatory — wrap any handler passed in with `useCallback`.
 */
const CbmRow = memo(function CbmRow({
  item: it,
  idx,
  color,
  globalLenUnit,
  globalWtUnit,
  popoverOpen,
  onPopoverOpenChange,
  registerRef,
  allowRemove,
  onUpdateDraft,
  onUpdatePacking,
  onDuplicate,
  onRemove,
  onSetLenUnit,
  onSetWtUnit,
  renderPopover,
}: CbmRowProps) {
  const rowLen = it.lenUnit ?? globalLenUnit;
  const rowWt = it.wtUnit ?? globalWtUnit;
  const rowCbm = (it.length * it.width * it.height * it.qty) / 1_000_000;
  const confirmed = it.packingConfirmed === true;

  const showLen = (cm: number) => {
    const v = cmTo(cm, rowLen);
    return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
  };
  const showWt = (kg: number) => {
    const v = kgTo(kg, rowWt);
    return Number.isFinite(v) ? Number(v.toFixed(4)) : NaN;
  };
  const setLen = (key: "length" | "width" | "height") => (n: number) =>
    onUpdateDraft(it.id, { [key]: Number.isFinite(n) ? toCm(n, rowLen) : 0 } as Partial<CbmItem>);
  const setWt = (n: number) =>
    onUpdateDraft(it.id, { weight: Number.isFinite(n) ? toKg(n, rowWt) : 0 });

  return (
    <Card
      ref={registerRef}
      className="border-2 p-3 transition-shadow"
      style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 20%, transparent)" }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="size-3 rounded-sm border border-black/10"
            style={{ background: color }}
            aria-hidden
          />
          <h4 className="text-sm font-semibold text-brand-navy">Item {idx + 1}</h4>
          <div className="flex flex-wrap items-center gap-1.5">
            <UnitSelector id={`cbm-len-unit-${it.id}`} value={rowLen} onChange={onSetLenUnit} compact />
            <WeightUnitSelector id={`cbm-wt-unit-${it.id}`} value={rowWt} onChange={onSetWtUnit} compact />
            <Select
              value={it.packageType ?? "carton"}
              onValueChange={(v) => onUpdatePacking(it.id, withPackageTypeReset({ packageType: v as PackageType }))}
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
          <Popover open={popoverOpen} onOpenChange={onPopoverOpenChange}>
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
              {renderPopover()}
            </PopoverContent>
          </Popover>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onDuplicate(it.id)}
            aria-label="Duplicate"
          >
            <Copy className="size-3.5" />
          </Button>
          {allowRemove && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-destructive"
              onClick={() => onRemove(it.id)}
              aria-label="Remove"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <NumberField
          compact
          id={`l-${it.id}`}
          label="Length"
          suffix={rowLen}
          required
          value={showLen(it.length)}
          onChange={setLen("length")}
          hint={`Outer length of one carton in ${rowLen}.`}
        />
        <NumberField
          compact
          id={`w-${it.id}`}
          label="Width"
          suffix={rowLen}
          required
          value={showLen(it.width)}
          onChange={setLen("width")}
          hint={`Outer width in ${rowLen}.`}
        />
        <NumberField
          compact
          id={`h-${it.id}`}
          label="Height"
          suffix={rowLen}
          required
          value={showLen(it.height)}
          onChange={setLen("height")}
          hint={`Outer height in ${rowLen}.`}
        />
        <NumberField
          compact
          id={`q-${it.id}`}
          label="Qty"
          required
          step={1}
          value={it.qty}
          onChange={(n) => onUpdateDraft(it.id, { qty: Math.max(1, Math.round(n)) })}
          hint="Number of identical cartons."
        />
        <NumberField
          compact
          id={`wt-${it.id}`}
          label="Weight"
          suffix={rowWt}
          required
          value={showWt(it.weight)}
          onChange={setWt}
          hint={`Actual weight of ONE carton (gross) in ${rowWt}.`}
        />
        <div
          className="flex flex-col justify-center rounded-lg border-2 border-brand-navy/20 bg-brand-navy-soft/40 px-3 py-1.5"
          aria-label={`Item ${idx + 1} CBM`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            CBM
          </span>
          <span className="text-lg font-bold leading-tight" style={{ color: "var(--brand-orange)" }}>
            {Number.isFinite(rowCbm) ? rowCbm.toFixed(4) : "—"}
            <span className="ml-0.5 text-[10px] font-semibold text-muted-foreground">m³</span>
          </span>
        </div>
      </div>
    </Card>
  );
});
