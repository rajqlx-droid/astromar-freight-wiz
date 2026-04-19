import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Package, Boxes, Box as BoxIcon, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  CONTAINERS,
  ITEM_COLORS,
  pickOptimalContainer,
  totalCbm,
  totalQty,
  totalWeight,
  type ContainerPreset,
  type PlacedBox,
} from "@/lib/freight/packing";
import { packContainerAdvanced, type AdvancedPackResult } from "@/lib/freight/packing-advanced";
import {
  splitItemsAcrossContainers,
  type ContainerRecommendation,
} from "@/lib/freight/container-recommender";
import type { CbmItem } from "@/lib/freight/calculators";
import { LoadReportPanel } from "./load-report-panel";
import { LoadingSequence } from "./loading-sequence";
import { LoadingRowsPanel } from "./loading-rows-panel";
import { LoadingVideoButton } from "./loading-video-button";
import type { Container3DHandle } from "./container-3d-view";
import { buildRows } from "@/lib/freight/loading-rows";
import { readHeavyThreshold } from "./loading-rows-panel";

// Lazy 3D view — keeps initial bundle light and avoids SSR.
const Container3DView = lazy(() =>
  import("./container-3d-view").then((m) => ({ default: m.Container3DView })),
);

interface Props {
  items: CbmItem[];
  /** Smart recommendation from the calculator. Drives multi-container tabbed view. */
  recommendation?: ContainerRecommendation;
  /** Manually-applied choice that overrides "auto". */
  forcedChoice?: "20gp" | "40gp" | "40hc" | null;
  /** Notify parent when user picks a container pill. */
  onChoiceChange?: (id: "20gp" | "40gp" | "40hc" | null) => void;
  /** Expose snapshot capture + active pack so parent (PDF flow) can use them. */
  onReady?: (handle: {
    capture: () => Promise<{ iso: string; front: string; side: string } | null>;
    getActivePack: () => AdvancedPackResult | null;
  }) => void;
  /** When set, disables the 3D toggle and Loading Video button (CBM gate). */
  optimizationDisabledReason?: string | null;
}

type ContainerChoice = "auto" | "20gp" | "40gp" | "40hc";

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

export function ContainerLoadView({
  items,
  recommendation,
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

  const [is3D, setIs3D] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("0");
  const [viewerCollapsed, setViewerCollapsed] = useState(false);
  const view3DRef = useRef<Container3DHandle | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cargoCbm = useMemo(() => totalCbm(items), [items]);
  const cargoWeight = useMemo(() => totalWeight(items), [items]);
  const cargoQty = useMemo(() => totalQty(items), [items]);

  const hasCargo = cargoCbm > 0 && cargoQty > 0;
  const isMulti = recommendation?.isMulti === true;

  const autoContainer = useMemo(() => pickOptimalContainer(cargoCbm), [cargoCbm]);
  const activeContainer: ContainerPreset =
    choice === "auto"
      ? autoContainer
      : CONTAINERS.find((c) => c.id === choice) ?? autoContainer;

  // Single-container pack (used when not multi).
  const singlePack = useMemo(
    () => packContainerAdvanced(items, activeContainer),
    [items, activeContainer],
  );

  // Multi-container packs (one per recommended unit).
  const multiPacks = useMemo<AdvancedPackResult[]>(() => {
    if (!isMulti || !recommendation) return [];
    const buckets = splitItemsAcrossContainers(items, recommendation);
    return recommendation.units.map((u, i) =>
      packContainerAdvanced(buckets[i] ?? [], u.container),
    );
  }, [items, isMulti, recommendation]);

  const activePack: AdvancedPackResult = isMulti
    ? multiPacks[Number(activeTab)] ?? multiPacks[0] ?? singlePack
    : singlePack;

  // Expose snapshot capability to parent (current visible pack).
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
      getActivePack: () => activePack,
    });
  }, [onReady, is3D, activeTab, activePack]);

  return (
    <Card
      className="border-2 p-4 sm:p-5"
      style={{ borderColor: "color-mix(in oklab, var(--brand-navy) 18%, transparent)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <Boxes className="size-5 text-brand-navy" />
        <h3 className="text-base font-semibold text-brand-navy">Container Load Optimizer</h3>
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
          <div title={optimizationDisabledReason ?? undefined} className={cn(optimizationDisabledReason && "pointer-events-none opacity-50")}> 
            <LoadingVideoButton
              pack={activePack}
              containerLabel={activePack.container.name}
              getHandle={() => view3DRef.current}
              ensure3DReady={async () => {
                if (!is3D) setIs3D(true);
              }}
            />
          </div>
          <div
            className={cn(
              "flex rounded-full border border-brand-navy/30 p-0.5",
              optimizationDisabledReason && "opacity-50",
            )}
            title={optimizationDisabledReason ?? undefined}
          >
            <button
              type="button"
              onClick={() => setIs3D(false)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                !is3D ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-navy/10",
              )}
            >
              2D
            </button>
            <button
              type="button"
              onClick={() => !optimizationDisabledReason && setIs3D(true)}
              disabled={!!optimizationDisabledReason}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed",
                is3D ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-navy/10",
              )}
            >
              <BoxIcon className="size-3" /> 3D
            </button>
          </div>
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
      ) : isMulti && multiPacks.length > 0 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-3 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
            {multiPacks.map((p, i) => (
              <TabsTrigger
                key={i}
                value={String(i)}
                className="flex-1 gap-1.5 text-[11px] sm:text-xs"
              >
                <span className="font-semibold">#{i + 1}</span>
                {p.container.name}
                <span className="hidden text-muted-foreground sm:inline">
                  · {p.cargoCbm.toFixed(1)} m³
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {multiPacks.map((p, i) => (
            <TabsContent key={i} value={String(i)} className="m-0">
              <SinglePlanBody
                pack={p}
                weight={p.weightKg}
                qty={p.placedCartons}
                items={items}
                is3D={is3D}
                mounted={mounted}
                view3DRef={view3DRef}
                isActive={activeTab === String(i)}
                viewerCollapsed={viewerCollapsed}
                rollup={{
                  totalCbm: multiPacks.reduce((s, x) => s + x.cargoCbm, 0),
                  totalWeightKg: multiPacks.reduce((s, x) => s + x.weightKg, 0),
                  totalContainers: multiPacks.length,
                  totalPlaced: multiPacks.reduce((s, x) => s + x.placedCartons, 0),
                  totalPlanned: multiPacks.reduce((s, x) => s + x.totalCartons, 0),
                }}
              />
            </TabsContent>
          ))}
        </Tabs>
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
}) {
  // Per-row "Apply suggested re-shuffle" preview state. Maps placedIdx → metres
  // along scene-z (container width axis). Cleared when row toggles off.
  const [shufflePreview, setShufflePreview] = useState<Map<number, number> | null>(
    null,
  );

  // Manual row-stepper. When `stepMode` is on, only rows 0..stepIdx are shown
  // in the 3D viewer. The user clicks "Next row" to reveal rows back→door.
  const [stepMode, setStepMode] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  // Row groups (back wall → door). Re-derived only when the pack changes.
  const rows = useMemo(() => buildRows(pack, readHeavyThreshold()), [pack]);

  // Clamp stepIdx if rows shrink (e.g. user changed cargo).
  useEffect(() => {
    if (stepIdx > rows.length - 1) setStepIdx(Math.max(0, rows.length - 1));
  }, [rows.length, stepIdx]);

  // Build the visible-placedIdx set for rows 0..stepIdx.
  const visiblePlacedSet = useMemo<Set<number> | null>(() => {
    if (!stepMode) return null;
    const s = new Set<number>();
    for (let r = 0; r <= stepIdx; r++) {
      const row = rows[r];
      if (!row) continue;
      for (const b of row.boxes) {
        const idx = pack.placed.indexOf(b);
        if (idx >= 0) s.add(idx);
      }
    }
    return s;
  }, [stepMode, stepIdx, rows, pack.placed]);

  // Reset the stepper when leaving 3D or step mode.
  useEffect(() => {
    if (!is3D) setStepMode(false);
  }, [is3D]);

  const canStep = stepMode && is3D && rows.length > 0;
  const atFirst = stepIdx <= 0;
  const atLast = stepIdx >= rows.length - 1;

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
                <Container3DView
                  ref={isActive ? view3DRef : undefined}
                  pack={pack}
                  shufflePreview={shufflePreview}
                  visiblePlacedSet={visiblePlacedSet}
                  hideDoors={stepMode}
                />
              </Suspense>
            ) : (
              <IsoContainer pack={pack} />
            )}
            {is3D && rows.length > 0 && (
              <RowStepperBar
                stepMode={stepMode}
                onToggleStepMode={() => {
                  setStepMode((v) => !v);
                  setStepIdx(0);
                }}
                stepIdx={stepIdx}
                totalRows={rows.length}
                onPrev={() => setStepIdx((i) => Math.max(0, i - 1))}
                onNext={() => setStepIdx((i) => Math.min(rows.length - 1, i + 1))}
                onReset={() => setStepIdx(0)}
                canStep={canStep}
                atFirst={atFirst}
                atLast={atLast}
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
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Indicative loading pattern. Actual stow depends on weight distribution, carton orientation, and dunnage.
        </p>
      </div>
      <LoadReportPanel pack={pack} rollup={rollup} />
    </div>
  );
}

/* ---------------- Row stepper bar (under the 3D viewer) ---------------- */

function RowStepperBar({
  stepMode,
  onToggleStepMode,
  stepIdx,
  totalRows,
  onPrev,
  onNext,
  onReset,
  canStep,
  atFirst,
  atLast,
}: {
  stepMode: boolean;
  onToggleStepMode: () => void;
  stepIdx: number;
  totalRows: number;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  canStep: boolean;
  atFirst: boolean;
  atLast: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-brand-navy/20 bg-background/60 px-2.5 py-2">
      <Button
        type="button"
        size="sm"
        variant={stepMode ? "default" : "outline"}
        onClick={onToggleStepMode}
        className={cn(
          "h-7 rounded-full px-3 text-[11px]",
          stepMode
            ? "bg-brand-navy text-white hover:bg-brand-navy/90"
            : "border-brand-navy/30 text-brand-navy hover:bg-brand-navy/10",
        )}
      >
        <Layers className="size-3" />
        {stepMode ? "Stepping rows" : "Step rows manually"}
      </Button>

      {stepMode && (
        <>
          <span className="text-[11px] font-medium text-muted-foreground">
            Row {stepIdx + 1} of {totalRows}{" "}
            <span className="hidden sm:inline">· back wall → door</span>
          </span>

          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onPrev}
              disabled={!canStep || atFirst}
              className="h-7 px-2 text-[11px]"
              aria-label="Previous row"
            >
              <ChevronLeft className="size-3" /> Prev
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={atLast ? onReset : onNext}
              disabled={!canStep}
              className="h-7 bg-brand-navy px-2 text-[11px] text-white hover:bg-brand-navy/90"
              aria-label={atLast ? "Reset stepper" : "Next row"}
            >
              {atLast ? "Reset" : (
                <>
                  Next <ChevronRight className="size-3" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
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
