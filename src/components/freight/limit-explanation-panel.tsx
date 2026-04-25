/**
 * Limit Explanation Panel
 * ------------------------------------------------------------------
 * Shows a step-by-step diagnosis of WHY the current pack hit its
 * limit. We compute four candidate constraints from the pack +
 * container preset and rank them — the tightest one is the binding
 * constraint and is shown first with a green badge.
 *
 *   1. Length (door reserve) — usable L = inner.l − 100 mm
 *   2. Width                 — usable W = inner.w (flush, no side gap)
 *   3. Height (ceiling)      — usable H = inner.h − 80 mm
 *   4. Weight                — maxPayloadKg
 *
 * The panel is purely presentational: it reads the existing pack
 * result and container preset, no extra packer state required.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import { DOOR_RESERVE_MM, CEILING_RESERVE_MM } from "@/lib/freight/gap-rules";

interface Props {
  pack: AdvancedPackResult;
}

interface Step {
  axis: "length" | "width" | "height" | "weight";
  label: string;
  /** Inner dimension or capacity (mm or kg). */
  innerValue: number;
  /** Reserve subtracted from inner (mm or kg). 0 if none. */
  reserveValue: number;
  reserveLabel: string;
  /** Usable budget after reserve. */
  usableValue: number;
  /** Smallest box dimension on this axis (mm) or per-pkg weight (kg). */
  rowDepth: number;
  rowDepthLabel: string;
  /** How much of the budget the packed cargo actually used. */
  usedValue: number;
  /** Slack = usable − used. */
  slackValue: number;
  /** Theoretical max units along this axis if every cell was filled. */
  maxUnits: number;
  /** Units actually fit. */
  actualUnits: number;
  unit: string;
}

export function LimitExplanationPanel({ pack }: Props) {
  const [open, setOpen] = useState(false);

  if (pack.placed.length === 0) return null;

  const inner = pack.container.inner;
  const placed = pack.placed;

  // ── Length axis (X, door at +X) ─────────────────────────────────
  const usableL = inner.l - DOOR_RESERVE_MM;
  const deepestX = placed.reduce((m, b) => Math.max(m, b.x + b.l), 0);
  const minBoxL = Math.min(...placed.map((b) => b.l));
  const lengthStep: Step = {
    axis: "length",
    label: "Length (door reserve)",
    innerValue: inner.l,
    reserveValue: DOOR_RESERVE_MM,
    reserveLabel: "door reserve",
    usableValue: usableL,
    rowDepth: minBoxL,
    rowDepthLabel: "smallest box length",
    usedValue: deepestX,
    slackValue: Math.max(0, usableL - deepestX),
    maxUnits: Math.floor(usableL / Math.max(1, minBoxL)),
    actualUnits: new Set(placed.map((b) => Math.round(b.x))).size,
    unit: "mm",
  };

  // ── Width axis (Y, no side reserve) ─────────────────────────────
  const usableW = inner.w;
  const widestY = placed.reduce((m, b) => Math.max(m, b.y + b.w), 0);
  const minBoxW = Math.min(...placed.map((b) => b.w));
  const widthStep: Step = {
    axis: "width",
    label: "Width (no side reserve)",
    innerValue: inner.w,
    reserveValue: 0,
    reserveLabel: "side reserve",
    usableValue: usableW,
    rowDepth: minBoxW,
    rowDepthLabel: "smallest box width",
    usedValue: widestY,
    slackValue: Math.max(0, usableW - widestY),
    maxUnits: Math.floor(usableW / Math.max(1, minBoxW)),
    actualUnits: new Set(placed.map((b) => Math.round(b.y))).size,
    unit: "mm",
  };

  // ── Height axis (Z, ceiling reserve) ────────────────────────────
  const usableH = inner.h - CEILING_RESERVE_MM;
  const tallestZ = placed.reduce((m, b) => Math.max(m, b.z + b.h), 0);
  const minBoxH = Math.min(...placed.map((b) => b.h));
  const heightStep: Step = {
    axis: "height",
    label: "Height (ceiling reserve)",
    innerValue: inner.h,
    reserveValue: CEILING_RESERVE_MM,
    reserveLabel: "ceiling reserve",
    usableValue: usableH,
    rowDepth: minBoxH,
    rowDepthLabel: "shortest box height",
    usedValue: tallestZ,
    slackValue: Math.max(0, usableH - tallestZ),
    maxUnits: Math.floor(usableH / Math.max(1, minBoxH)),
    actualUnits: new Set(placed.map((b) => Math.round(b.z))).size,
    unit: "mm",
  };

  // ── Weight axis ─────────────────────────────────────────────────
  const maxKg = pack.container.maxPayloadKg;
  const usedKg = Math.round(pack.placedWeightKg);
  const avgKgPerPkg =
    placed.length > 0 ? Math.max(0.001, pack.placedWeightKg / placed.length) : 0;
  const weightStep: Step = {
    axis: "weight",
    label: "Weight (payload cap)",
    innerValue: maxKg,
    reserveValue: 0,
    reserveLabel: "weight reserve",
    usableValue: maxKg,
    rowDepth: avgKgPerPkg,
    rowDepthLabel: "avg weight per package",
    usedValue: usedKg,
    slackValue: Math.max(0, maxKg - usedKg),
    maxUnits: Math.floor(maxKg / Math.max(0.001, avgKgPerPkg)),
    actualUnits: placed.length,
    unit: "kg",
  };

  const steps: Step[] = [lengthStep, widthStep, heightStep, weightStep];

  // Binding constraint = the axis where one more unit would not fit
  // (slack < rowDepth) AND has the smallest slack relative to rowDepth.
  // If multiple axes are tight, the one with the smallest slack wins.
  const ranked = [...steps].sort((a, b) => a.slackValue - b.slackValue);
  const bottleneck = ranked.find((s) => s.slackValue < s.rowDepth) ?? ranked[0];

  // ── Rotation usage summary ──────────────────────────────────────
  // Surfaces whether the packer actually used the user's rotation flags.
  // `rotated` is set per placed box: "sideways" (L↔W) or "axis" (tilted).
  const sidewaysCount = placed.filter((b) => b.rotated === "sideways").length;
  const tiltedCount = placed.filter((b) => b.rotated === "axis").length;
  const totalRotated = sidewaysCount + tiltedCount;

  return (
    <div className="rounded-lg border border-brand-navy/20 bg-white shadow-sm dark:bg-[oklch(0.18_0.01_240)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Info className="size-4 text-brand-orange" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-navy">
            Why this load is the limit
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            {bottleneck.label} bound
          </span>
        </div>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-brand-navy/10 px-3 py-3">
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            For each container axis we compute{" "}
            <span className="font-medium">usable = inner − reserve</span>, then
            check how much of it the packer consumed. The axis where the
            remaining slack is smaller than one more unit is the binding
            constraint — it&apos;s the dimension that stopped the packer from
            adding more cargo.
          </p>
          <ol className="space-y-2.5">
            {steps.map((s, idx) => (
              <StepRow
                key={s.axis}
                index={idx + 1}
                step={s}
                isBottleneck={s.axis === bottleneck.axis}
              />
            ))}
          </ol>

          <div className="mt-3 rounded-md border border-brand-navy/15 bg-muted/40 px-3 py-2 text-[10.5px] leading-relaxed">
            <span className="font-semibold text-brand-navy">Rotation usage — </span>
            {totalRotated === 0 ? (
              <span className="text-muted-foreground">
                All {placed.length} packages placed in original orientation. No
                sideways swap or tilt was applied (either the input flags are
                off, or the original orientation already won every position).
              </span>
            ) : (
              <span className="text-brand-navy/90">
                {totalRotated} of {placed.length} package{placed.length === 1 ? "" : "s"} rotated to fit:{" "}
                {sidewaysCount > 0 && (
                  <strong>{sidewaysCount} sideways (L↔W)</strong>
                )}
                {sidewaysCount > 0 && tiltedCount > 0 && ", "}
                {tiltedCount > 0 && (
                  <strong>{tiltedCount} tilted onto a side (axis)</strong>
                )}
                . Tilt is only attempted on cartons with the <em>allow axis
                rotation</em> flag enabled.
              </span>
            )}
          </div>

          <div className="mt-3 rounded-md bg-brand-orange/10 px-3 py-2 text-[11px] leading-relaxed">
            <span className="font-semibold text-brand-navy">Verdict — </span>
            <BottleneckVerdict step={bottleneck} />
          </div>
        </div>
      )}
    </div>
  );
}

function StepRow({
  index,
  step,
  isBottleneck,
}: {
  index: number;
  step: Step;
  isBottleneck: boolean;
}) {
  const fmt = (n: number) =>
    step.unit === "kg"
      ? `${Math.round(n).toLocaleString()} kg`
      : `${Math.round(n).toLocaleString()} mm`;

  const oneMoreFits = step.slackValue >= step.rowDepth - 0.5;

  return (
    <li
      className={cn(
        "rounded-md border px-3 py-2 text-[11px] leading-relaxed",
        isBottleneck
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-950/20"
          : "border-muted bg-muted/30",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-brand-navy">
          Step {index} — {step.label}
        </span>
        {isBottleneck && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            <CheckCircle2 className="size-3" aria-hidden /> binding
          </span>
        )}
      </div>
      <div className="grid gap-1 font-mono text-[10.5px] text-brand-navy/90 sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">inner</span> = {fmt(step.innerValue)}
        </div>
        <div>
          <span className="text-muted-foreground">{step.reserveLabel}</span> ={" "}
          {step.reserveValue === 0 ? "0 (none)" : fmt(step.reserveValue)}
        </div>
        <div>
          <span className="text-muted-foreground">usable</span> = inner − reserve ={" "}
          <span className="font-semibold">{fmt(step.usableValue)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{step.rowDepthLabel}</span> ={" "}
          {fmt(step.rowDepth)}
        </div>
        <div>
          <span className="text-muted-foreground">used</span> = {fmt(step.usedValue)} (
          {step.actualUnits} of {step.maxUnits} max)
        </div>
        <div>
          <span className="text-muted-foreground">slack</span> = usable − used ={" "}
          <span
            className={cn(
              "font-semibold",
              oneMoreFits ? "text-amber-700" : "text-emerald-700",
            )}
          >
            {fmt(step.slackValue)}
          </span>
        </div>
      </div>
      <div className="mt-1 text-[10.5px] text-muted-foreground">
        {oneMoreFits
          ? `Slack ≥ ${step.rowDepthLabel} → another unit could fit on this axis (not the bottleneck).`
          : `Slack < ${step.rowDepthLabel} → no more room on this axis.`}
      </div>
    </li>
  );
}

function BottleneckVerdict({ step }: { step: Step }) {
  const fmt = (n: number) =>
    step.unit === "kg"
      ? `${Math.round(n).toLocaleString()} kg`
      : `${Math.round(n).toLocaleString()} mm`;

  const need = Math.max(0, step.rowDepth - step.slackValue);

  if (step.axis === "length") {
    return (
      <span className="text-brand-navy">
        The <strong>{step.label}</strong> stops the packer. The 100&nbsp;mm door
        reserve is mandatory, leaving {fmt(step.usableValue)} usable. After{" "}
        {step.actualUnits} rows of {fmt(step.rowDepth)}, only {fmt(step.slackValue)}{" "}
        remains — {fmt(need)} short of one more row.
      </span>
    );
  }
  if (step.axis === "height") {
    return (
      <span className="text-brand-navy">
        The <strong>{step.label}</strong> stops the packer. The 80&nbsp;mm
        crossbeam clearance under the roof is mandatory, leaving{" "}
        {fmt(step.usableValue)} usable. The current stack reaches {fmt(step.usedValue)}
        , {fmt(step.slackValue)} short of another layer.
      </span>
    );
  }
  if (step.axis === "width") {
    return (
      <span className="text-brand-navy">
        The <strong>{step.label}</strong> is the tightest axis. Cartons sit flush
        against the side walls, so {fmt(step.usableValue)} is fully usable —{" "}
        {fmt(step.usedValue)} consumed, {fmt(step.slackValue)} slack.
      </span>
    );
  }
  return (
    <span className="text-brand-navy">
      The <strong>payload cap</strong> ({fmt(step.innerValue)}) stops the packer
      before any axis runs out of space. Loaded weight is {fmt(step.usedValue)} —
      adding one more average package ({fmt(step.rowDepth)}) would exceed the cap.
    </span>
  );
}
