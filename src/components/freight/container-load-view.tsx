import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Package, Boxes, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { LoaderHUD } from "./loader-hud";
import type { BestPlanMeta } from "@/lib/freight/scenario-runner";
import { buildPalletSequence, type PalletStep } from "@/lib/freight/loading-rows";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import {
  CONTAINERS,
  ITEM_COLORS,
  pickOptimalContainer,
  totalCbm,
  totalQty,
  totalWeight,
  type ContainerPreset,
} from "@/lib/freight/packing";
import { type AdvancedPackResult } from "@/lib/freight/packing-advanced";
import { type ContainerRecommendation } from "@/lib/freight/container-recommender";
import type { CbmItem } from "@/lib/freight/calculators";
import { LoadReportPanel } from "./load-report-panel";
import { LoadingSequence } from "./loading-sequence";
import { LoadingRowsPanel } from "./loading-rows-panel";
import { type ContainerId } from "@/lib/freight/container-ids";
import { usePackingWorker } from "@/hooks/use-packing-worker";

import type { Container3DHandle } from "./container-3d-view";
import { buildRows } from "@/lib/freight/loading-rows";
import { readHeavyThreshold } from "./loading-rows-panel";

// Lazy 3D view — keeps initial bundle light and avoids SSR.
const Container3DView = lazy(() =>
  import("./container-3d-view").then((m) => ({ default: m.Container3DView })),
);

interface Props {
  items: CbmItem[];
  /** Smart recommendation from the calculator. Kept for callers but no longer used to drive multi-container tabs. */
  recommendation?: ContainerRecommendation;
  /** Manually-applied choice that overrides "auto". */
  forcedChoice?: ContainerId | null;
  /** Notify parent when user picks a container pill. */
  onChoiceChange?: (id: ContainerId | null) => void;
  /** Expose snapshot capture + active pack so parent (PDF flow) can use them. */
  onReady?: (handle: {
    capture: () => Promise<{ iso: string; front: string; side: string } | null>;
    getActivePack: () => AdvancedPackResult | null;
  }) => void;
  /** When set, disables the 3D toggle and Loading Video button (CBM gate). */
  optimizationDisabledReason?: string | null;
}

type ContainerChoice = "auto" | ContainerId;

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

/**
 * Empty placeholder pack — used while the worker is computing the first real
 * result so downstream UI (3D viewer, panels) can render without crashing.
 */
function makeEmptyPack(container: ContainerPreset): AdvancedPackResult {
  return {
    container,
    placed: [],
    supportRatios: [],
    totalCartons: 0,
    placedCartons: 0,
    truncated: false,
    cargoCbm: 0,
    placedCargoCbm: 0,
    weightKg: 0,
    placedWeightKg: 0,
    utilizationPct: 0,
    weightUtilizationPct: 0,
    perItem: [],
    cogOffsetPct: 0,
    usedCbm: 0,
    densityPct: 0,
    cogLateralOffsetPct: 0,
    nearCeilingPlacedIdxs: [],
    floorCoveragePct: 0,
    stackingDiagnostics: {
      rejectedAttempts: 0,
      unplacedDueToStacking: 0,
      reasonCounts: { support: 0, sealed: 0, stackWeight: 0, nonStackable: 0 },
      dominantReason: null,
    },
  };
}

export function ContainerLoadView({
  items,
  forcedChoice,
  onChoiceChange,
  onReady,
  optimizationDisabledReason,
}: Props) {
  const [internalChoice, setInternalChoice] = useState<ContainerChoice>("auto");
  const choice: ContainerChoice = forcedChoice ?? internalChoice;
  const setChoice = (c: ContainerChoice) => {
    setInternalChoice(c);
    onChoiceChange?.(c === "auto" ? null : c);
  };

  const is3D = true;
  const [mounted, setMounted] = useState(false);
  const [viewerCollapsed, setViewerCollapsed] = useState(false);
  const view3DRef = useRef<Container3DHandle | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cargoCbm = useMemo(() => totalCbm(items), [items]);
  const cargoWeight = useMemo(() => totalWeight(items), [items]);
  const cargoQty = useMemo(() => totalQty(items), [items]);

  const hasCargo = cargoCbm > 0 && cargoQty > 0;

  // Geometry-aware auto-pick: smallest container the 3D packer can actually
  // place every piece in (not just one where CBM math fits). For 16 tall
  // pallets this correctly escalates from 20ft GP → 40ft HC.
  const autoContainer = useMemo(() => pickOptimalContainer(items), [items]);
  const activeContainer: ContainerPreset =
    choice === "auto"
      ? autoContainer
      : CONTAINERS.find((c) => c.id === choice) ?? autoContainer;

  // Defer heavy packing inputs so React can interrupt long calculations and
  // keep the event loop responsive (avoids "Page Unresponsive" dialog).
  const deferredItems = useDeferredValue(items);
  const deferredContainer = useDeferredValue(activeContainer);

  // ─── Off-main-thread packing via Web Worker ────────────────────────────
  // The packer can take 10–30 seconds for large loads with hundreds of cartons.
  // Running it inline froze the page and produced a 36s INP.
  // Now everything runs in a Worker; the UI keeps responding while jobs run.
  const worker = usePackingWorker();

  // Multi-strategy sweep: the worker tries every loader strategy at full
  // container geometry and returns the densest LEGAL plan (no overlap, no
  // hanging cargo, door + ceiling reserves honoured). Effective CBM is only
  // reduced when carton dimensions physically prevent a tighter fit — never
  // as a default safety margin.
  const [singlePack, setSinglePack] = useState<AdvancedPackResult>(() =>
    makeEmptyPack(deferredContainer),
  );
  // Optimiser metadata captured from the worker so the HUD shows the same
  // shut-out / hard-violation reasoning the optimiser used. Recomputing
  // compliance in the HUD off the pack alone caused drift between the
  // picker's verdict and the badge.
  const [planMeta, setPlanMeta] = useState<BestPlanMeta | null>(null);
  useEffect(() => {
    if (!hasCargo) {
      setSinglePack(makeEmptyPack(deferredContainer));
      setPlanMeta(null);
      return;
    }
    let cancelled = false;
    worker
      .optimise(deferredItems, deferredContainer)
      .then((res) => {
        if (cancelled) return;
        setSinglePack(res.best.pack);
        setPlanMeta(res.meta);
      })
      .catch(() => {
        /* worker gone */
      });
    return () => {
      cancelled = true;
    };
  }, [hasCargo, deferredItems, deferredContainer, worker.optimise]);

  const activePack: AdvancedPackResult = singlePack;

  // True when the worker hasn't returned a real pack yet for the current input.
  const isCalculating = worker.pending && activePack.placed.length === 0 && hasCargo;

  // Expose snapshot capability to parent (current visible pack).
  // CRITICAL: do NOT put `activePack` in deps. The parent's `onReady` calls
  // `setActivePack()` synchronously, which would re-trigger this effect on
  // the next render → infinite loop (React error #185 / "Maximum update
  // depth exceeded"). Instead, mirror the latest pack in a ref so the
  // exposed `getActivePack` always returns fresh data without re-firing
  // the effect.
  const activePackRef = useRef<AdvancedPackResult>(activePack);
  useEffect(() => {
    activePackRef.current = activePack;
  }, [activePack]);
  useEffect(() => {
    if (!onReady) return;
    onReady({
      capture: async () => {
        if (!is3D || !view3DRef.current) return null;
        try {
          return await view3DRef.current.captureAngles();
        } catch {
          return null;
        }
      },
      getActivePack: () => activePackRef.current,
    });
  }, [onReady, is3D]);

  return (
    <Card
      id="container-load-viewer"
      tabIndex={-1}
      className="border-2 p-4 outline-none focus-visible:ring-2 focus-visible:ring-brand-navy sm:p-5"
      style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 18%, transparent)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <Boxes className="size-5 text-brand-navy" />
        <h3 className="text-base font-semibold text-brand-navy">Container Load Optimizer</h3>
        {worker.pending && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-3 animate-spin" />
            Calculating…
          </span>
        )}
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Indicative
        </span>
      </div>

      {/* Container switcher pills + 2D/3D toggle */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <PillButton active={choice === "auto"} onClick={() => setChoice("auto")}>
          Auto · {autoContainer.name}
        </PillButton>
        {CONTAINERS.map((c) => (
          <PillButton key={c.id} active={choice === c.id} onClick={() => setChoice(c.id)}>
            {c.name}
          </PillButton>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewerCollapsed((v) => !v)}
            aria-label={viewerCollapsed ? "Expand viewer" : "Collapse viewer"}
            aria-expanded={!viewerCollapsed}
            className="flex h-7 items-center gap-1 rounded-full border border-brand-navy/30 px-2.5 text-[11px] font-semibold text-brand-navy hover:bg-brand-navy/10"
            title={viewerCollapsed ? "Show 3D viewer" : "Hide viewer (focus on row instructions)"}
          >
            {viewerCollapsed ? (
              <>
                <ChevronDown className="size-3" /> Show viewer
              </>
            ) : (
              <>
                <ChevronUp className="size-3" /> Hide viewer
              </>
            )}
          </button>
        </div>
      </div>

      {!hasCargo ? (
        <EmptyState />
      ) : (
        <SinglePlanBody
          pack={activePack}
          weight={cargoWeight}
          qty={cargoQty}
          items={items}
          is3D={is3D}
          mounted={mounted}
          view3DRef={view3DRef}
          isActive
          viewerCollapsed={viewerCollapsed}
          planMeta={planMeta}
        />
      )}
    </Card>
  );
}

/* ---------------- Single-plan body (shared by single + per-tab) ---------------- */

function SinglePlanBody({
  pack,
  weight,
  qty: _qty,
  items,
  is3D,
  mounted,
  view3DRef,
  isActive,
  viewerCollapsed = false,
  rollup,
  planMeta = null,
}: {
  pack: AdvancedPackResult;
  weight: number;
  qty: number;
  items: CbmItem[];
  is3D: boolean;
  mounted: boolean;
  view3DRef: React.MutableRefObject<Container3DHandle | null>;
  isActive: boolean;
  viewerCollapsed?: boolean;
  rollup?: React.ComponentProps<typeof LoadReportPanel>["rollup"];
  planMeta?: BestPlanMeta | null;
}) {
  // Per-row "Apply suggested re-shuffle" preview state. Maps placedIdx → metres
  // along scene-z (container width axis). Cleared when row toggles off.
  const [shufflePreview, setShufflePreview] = useState<Map<number, number> | null>(
    null,
  );

  // Pallet stepper. palletIdx = index into PalletStep[], -1 = empty container.
  const [palletIdx, setPalletIdx] = useState(-1);
  // Forklift visuals are disabled — kept as a no-op state so the HUD prop
  // contracts stay intact without rendering anything in the 3D scene.
  const [showForkliftToken, setShowForkliftToken] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);

  // Row groups (back wall → door). Re-derived only when the pack changes.
  const rows = useMemo(() => buildRows(pack, readHeavyThreshold()), [pack]);
  // Per-pallet sequence (loader hand-order). Re-derived per pack.
  const palletSequence = useMemo<PalletStep[]>(
    () => buildPalletSequence(pack, rows),
    [pack, rows],
  );
  // Clamp palletIdx if sequence shrinks.
  useEffect(() => {
    if (palletIdx > palletSequence.length - 1) {
      setPalletIdx(palletSequence.length - 1);
    }
  }, [palletSequence.length, palletIdx]);

  const stepMode = is3D && palletSequence.length > 0;

  // Visible-placed set: every pallet from index 0..palletIdx.
  const visiblePlacedSet = useMemo<Set<number> | null>(() => {
    if (!stepMode) return null;
    const s = new Set<number>();
    for (let k = 0; k <= palletIdx; k++) {
      const step = palletSequence[k];
      if (step) s.add(step.placedIdx);
    }
    return s;
  }, [stepMode, palletIdx, palletSequence]);

  // Current + next pallet.
  const currentStep = palletIdx >= 0 ? palletSequence[palletIdx] ?? null : null;
  const nextStep =
    palletIdx + 1 < palletSequence.length ? palletSequence[palletIdx + 1] ?? null : null;
  const activePalletIdx = currentStep?.placedIdx ?? null;
  const nextPalletIdx = !stepMode ? null : nextStep?.placedIdx ?? null;

  // Fly-in animation for the most-recently-placed pallet only.
  const [flyInPlacedSet, setFlyInPlacedSet] = useState<Set<number> | null>(null);
  const [flyInKey, setFlyInKey] = useState(0);
  const prevPalletIdxRef = useRef(-1);
  useEffect(() => {
    const prev = prevPalletIdxRef.current;
    prevPalletIdxRef.current = palletIdx;
    if (!stepMode || palletIdx < 0) {
      setFlyInPlacedSet(null);
      return;
    }
    if (palletIdx > prev) {
      const step = palletSequence[palletIdx];
      if (!step) return;
      setFlyInPlacedSet(new Set([step.placedIdx]));
      setFlyInKey((k) => k + 1);
      const t = setTimeout(() => setFlyInPlacedSet(null), 700);
      return () => clearTimeout(t);
    }
    setFlyInPlacedSet(null);
  }, [palletIdx, stepMode, palletSequence]);

  // Reset stepper when toggling 3D.
  useEffect(() => {
    setPalletIdx(-1);
  }, [is3D]);

  // Active row (right-panel highlight + gap heatmap) = current pallet's row.
  const activeRowIdx = currentStep?.rowIdx ?? null;
  const activeRow = activeRowIdx != null ? rows[activeRowIdx] ?? null : null;

  const [showGapHeatmap, setShowGapHeatmap] = useState(true);
  const gapHeatmapRow =
    stepMode && showGapHeatmap && activeRow && activeRow.gapWarning ? activeRow : null;

  // Auto-play: 1× = 600ms per pallet, 0.5× = 1200ms, 2× = 300ms.
  const stepDurationMs = Math.round(600 / speed);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPlay = () => {
    setIsPlaying(false);
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  };
  const togglePlay = () => {
    if (isPlaying) {
      stopPlay();
      return;
    }
    if (palletSequence.length === 0) return;
    if (palletIdx >= palletSequence.length - 1) setPalletIdx(-1);
    setIsPlaying(true);
  };
  useEffect(() => {
    if (!isPlaying) return;
    if (palletIdx >= palletSequence.length - 1) {
      const t = setTimeout(() => setIsPlaying(false), stepDurationMs);
      return () => clearTimeout(t);
    }
    playTimerRef.current = setTimeout(() => {
      setPalletIdx((i) => Math.min(palletSequence.length - 1, i + 1));
    }, stepDurationMs);
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, palletIdx, palletSequence.length, stepDurationMs]);
  useEffect(() => {
    if (!is3D) stopPlay();
  }, [is3D]);

  const goPrev = () => {
    stopPlay();
    setPalletIdx((i) => Math.max(-1, i - 1));
  };
  const goNext = () => {
    stopPlay();
    setPalletIdx((i) => Math.min(palletSequence.length - 1, i + 1));
  };
  const goReset = () => {
    stopPlay();
    setPalletIdx(-1);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      <div className="space-y-3">
        <StatsBar pack={pack} weight={weight} qty={pack.placedCartons} />
        {!viewerCollapsed && (
          <div className="overflow-hidden rounded-lg border bg-[oklch(0.98_0.005_240)] p-3 dark:bg-[oklch(0.18_0.01_240)]">
            {is3D && mounted ? (
              <Suspense
                fallback={
                  <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                    Loading 3D viewer…
                  </div>
                }
              >
                <div className="relative">
                  <Container3DView
                    ref={isActive ? view3DRef : undefined}
                    pack={pack}
                    shufflePreview={shufflePreview}
                    visiblePlacedSet={visiblePlacedSet}
                    hideDoors={stepMode || pack.placedCartons === 0}
                    gapHeatmapRow={gapHeatmapRow}
                    flyInPlacedSet={flyInPlacedSet}
                    flyInKey={flyInKey}
                    activePalletIdx={activePalletIdx}
                    nextPalletIdx={nextPalletIdx}
                    followCam={isPlaying}
                    showForkliftToken={showForkliftToken && currentStep != null}
                    nearCeilingPlacedIdxs={pack.nearCeilingPlacedIdxs ?? null}
                    overlay={
                      stepMode ? (
                        <LoaderHUD
                          step={currentStep}
                          totalSteps={palletSequence.length}
                          currentIdx={palletIdx}
                          isPlaying={isPlaying}
                          speed={speed}
                          onPlayPause={togglePlay}
                          onPrev={goPrev}
                          onNext={goNext}
                          onReset={goReset}
                          onSpeedChange={setSpeed}
                          showForklift={showForkliftToken}
                          onToggleForklift={() => setShowForkliftToken((v) => !v)}
                          pack={pack}
                          rows={rows}
                          planMeta={planMeta}
                          onJumpToRow={(rowIdx1Based) => {
                            // Jump the stepper to the first pallet of that row.
                            const target = palletSequence.findIndex(
                              (p) => p.rowIdx === rowIdx1Based - 1,
                            );
                            if (target >= 0) setPalletIdx(target);
                          }}
                        />
                      ) : null
                    }
                  />
                </div>
              </Suspense>
            ) : null}
            {is3D && palletSequence.length > 0 && (
              <PalletStatusBar
                currentIdx={palletIdx}
                total={palletSequence.length}
                rowIdx={currentStep?.rowIdx ?? null}
                totalRows={rows.length}
                showGapHeatmap={showGapHeatmap}
                onToggleGapHeatmap={() => setShowGapHeatmap((v) => !v)}
                activeRowHasGap={!!activeRow?.gapWarning}
              />
            )}
          </div>
        )}
        <Legend items={items} />
        <LoadingSequence pack={pack} />
        <LoadingRowsPanel
          pack={pack}
          onApplyShuffle={(map) => setShufflePreview(map)}
          shufflePreviewActive={shufflePreview !== null}
          previewRequires3D={!is3D}
          activeRowIdx={activeRowIdx}
          onRowSelect={(idx) => {
            // Clicking a row card jumps to the FIRST pallet of that row.
            if (!is3D) return;
            stopPlay();
            const firstStepInRow = palletSequence.findIndex((s) => s.rowIdx === idx);
            if (firstStepInRow >= 0) setPalletIdx(firstStepInRow);
          }}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Indicative loading pattern. Actual stow depends on weight distribution, carton orientation, and dunnage.
        </p>
      </div>
      <LoadReportPanel pack={pack} rollup={rollup} />
    </div>
  );
}

/* ---------------- Slim status bar (under the 3D viewer) ---------------- */

function PalletStatusBar({
  currentIdx,
  total,
  rowIdx,
  totalRows,
  showGapHeatmap,
  onToggleGapHeatmap,
  activeRowHasGap,
}: {
  currentIdx: number;
  total: number;
  rowIdx: number | null;
  totalRows: number;
  showGapHeatmap: boolean;
  onToggleGapHeatmap: () => void;
  activeRowHasGap: boolean;
}) {
  const empty = currentIdx < 0;
  const status = empty
    ? "Empty container — press ▶ in the HUD to start the loader walkthrough"
    : `Pallet ${currentIdx + 1} of ${total}${rowIdx != null ? ` · row ${rowIdx + 1} / ${totalRows}` : ""}`;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-brand-navy/20 bg-background/60 px-2.5 py-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{status}</span>
      <Button
        type="button"
        size="sm"
        variant={showGapHeatmap ? "default" : "outline"}
        onClick={onToggleGapHeatmap}
        className={cn(
          "ml-auto h-7 px-2 text-[11px]",
          showGapHeatmap && activeRowHasGap
            ? "bg-rose-600 text-white hover:bg-rose-700"
            : "",
        )}
        aria-pressed={showGapHeatmap}
        title={
          activeRowHasGap
            ? "Toggle red overlay highlighting floor & wall voids"
            : "Heatmap appears on rows flagged with gap warnings"
        }
      >
        ⚠ Gaps
      </Button>
    </div>
  );
}


/* ---------------- Sub-components ---------------- */

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className={cn(
        "h-7 rounded-full px-3 text-xs",
        active
          ? "bg-brand-navy text-white hover:bg-brand-navy/90"
          : "border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5",
      )}
    >
      {children}
    </Button>
  );
}

function StatsBar({
  pack,
  weight,
  qty,
}: {
  pack: AdvancedPackResult;
  weight: number;
  qty: number;
}) {
  const util = Math.min(100, pack.utilizationPct);
  const utilColor = util < 80 ? "bg-emerald-500" : util < 95 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-muted-foreground">Used volume</span>
          <span className="font-semibold text-brand-navy">
            {pack.cargoCbm.toFixed(2)} / {pack.container.capCbm} m³ · {util.toFixed(0)}%
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full transition-all", utilColor)} style={{ width: `${util}%` }} />
        </div>
      </div>
      <Stat
        label="Weight"
        value={`${weight.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg`}
      />
      <Stat label="Packages loaded" value={`${pack.placedCartons} / ${pack.totalCartons}`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold text-brand-navy">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/20 px-4 py-10 text-center">
      <Package className="size-8 text-muted-foreground/40" />
      <div className="text-sm font-medium text-muted-foreground">
        Add cartons to generate loading plan
      </div>
      <div className="text-xs text-muted-foreground/70">
        Enter dimensions and quantity above to see the container fill visualisation.
      </div>
    </div>
  );
}

function Legend({ items }: { items: CbmItem[] }) {
  const visible = items.filter(
    (it) => it.length > 0 && it.width > 0 && it.height > 0 && it.qty > 0,
  );
  if (visible.length === 0) return null;
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {visible.map((it, idx) => {
        const origIdx = items.indexOf(it);
        const color = ITEM_COLORS[origIdx % ITEM_COLORS.length];
        return (
          <div
            key={it.id}
            className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1 text-xs"
          >
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ background: color }}
              aria-hidden
            />
            <span className="font-medium text-brand-navy">Item {idx + 1}</span>
            <span className="text-muted-foreground">
              {it.length}×{it.width}×{it.height} cm × {it.qty} pcs
              {it.weight > 0 ? ` · ${it.weight} kg` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}


/* ---------------- Isometric SVG (2D fallback) ---------------- */

function IsoContainer({ pack }: { pack: AdvancedPackResult }) {
  const C = pack.container.inner;
  const project = (X: number, Y: number, Z: number) => ({
    x: X + Z * COS30,
    y: -Y + Z * SIN30,
  });

  const corners = [
    project(0, 0, 0),
    project(C.l, 0, 0),
    project(0, C.h, 0),
    project(C.l, C.h, 0),
    project(0, 0, C.w),
    project(C.l, 0, C.w),
    project(0, C.h, C.w),
    project(C.l, C.h, C.w),
  ];
  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxY = Math.max(...corners.map((p) => p.y));
  const pad = 200;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = maxX - minX + pad * 2;
  const vbH = maxY - minY + pad * 2;

  const cFloor = [
    project(0, 0, 0),
    project(C.l, 0, 0),
    project(C.l, 0, C.w),
    project(0, 0, C.w),
  ];
  const cBack = [
    project(0, 0, C.w),
    project(C.l, 0, C.w),
    project(C.l, C.h, C.w),
    project(0, C.h, C.w),
  ];
  const cLeft = [
    project(0, 0, 0),
    project(0, 0, C.w),
    project(0, C.h, C.w),
    project(0, C.h, 0),
  ];

  const polyToStr = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x},${p.y}`).join(" ");

  const sorted = [...pack.placed].sort((a, b) => {
    const da = a.z + a.x * 0.001 - a.y * 0.001;
    const db = b.z + b.x * 0.001 - b.y * 0.001;
    return db - da;
  });

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className="h-auto w-full"
      style={{ aspectRatio: `${vbW} / ${vbH}`, maxHeight: 360 }}
      role="img"
      aria-label={`Container loading visualisation: ${pack.container.name}`}
    >
      <polygon
        points={polyToStr(cFloor)}
        fill="oklch(0.95 0.01 240)"
        stroke="oklch(0.55 0.02 240)"
        strokeWidth={20}
      />
      <polygon
        points={polyToStr(cBack)}
        fill="oklch(0.92 0.01 240)"
        stroke="oklch(0.55 0.02 240)"
        strokeWidth={20}
      />
      <polygon
        points={polyToStr(cLeft)}
        fill="oklch(0.94 0.01 240)"
        stroke="oklch(0.55 0.02 240)"
        strokeWidth={20}
      />

      {sorted.map((b, i) => (
        <IsoBox key={i} box={b} project={project} />
      ))}

      <polyline
        points={polyToStr([
          project(C.l, 0, 0),
          project(C.l, C.h, 0),
          project(C.l, C.h, C.w),
        ])}
        fill="none"
        stroke="oklch(0.55 0.02 240)"
        strokeWidth={20}
        strokeDasharray="40 30"
        opacity={0.6}
      />
      <polyline
        points={polyToStr([project(0, C.h, 0), project(C.l, C.h, 0)])}
        fill="none"
        stroke="oklch(0.55 0.02 240)"
        strokeWidth={20}
        strokeDasharray="40 30"
        opacity={0.6}
      />
    </svg>
  );
}

function IsoBox({
  box,
  project,
}: {
  box: PlacedBox;
  project: (x: number, y: number, z: number) => { x: number; y: number };
}) {
  const { x, y, z, l, w, h, color } = box;
  const p000 = project(x, y, z);
  const pL00 = project(x + l, y, z);
  const p0H0 = project(x, y + h, z);
  const pLH0 = project(x + l, y + h, z);
  const p00W = project(x, y, z + w);
  const pL0W = project(x + l, y, z + w);
  const p0HW = project(x, y + h, z + w);
  const pLHW = project(x + l, y + h, z + w);

  const polyToStr = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x},${p.y}`).join(" ");

  const top = [p0HW, pLHW, pLH0, p0H0];
  const front = [p00W, pL0W, pLHW, p0HW];
  const right = [pL00, pL0W, pLHW, pLH0];

  return (
    <g>
      <polygon
        points={polyToStr(front)}
        fill={color}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={6}
      />
      <polygon
        points={polyToStr(right)}
        fill={shade(color, -0.18)}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={6}
      />
      <polygon
        points={polyToStr(top)}
        fill={shade(color, 0.18)}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={6}
      />
    </g>
  );
}

function shade(hex: string, amt: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const adj = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? 255 - c : c) * amt)));
  const to = (c: number) => adj(c).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

