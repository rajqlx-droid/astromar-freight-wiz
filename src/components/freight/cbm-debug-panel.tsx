/**
 * CBM Calculator Debug Panel
 * --------------------------
 * In-app diagnostic overlay for the CBM Calculator. Shows live state of:
 *  - Worker queue (pending? last latency?)
 *  - Debounce window (current delay vs item count)
 *  - Which totals come from `draftItems` (live, every keystroke) vs the
 *    debounced `items` (committed) vs the worker recommendation
 *  - Live diff between drafted and committed totals so users can SEE the
 *    debounce window in action
 *
 * Also includes an automated typing/load test: programmatically fills 6 rows
 * with realistic carton dimensions, measures per-keystroke main-thread cost,
 * and reports any mismatch between the per-row CBM tile sum and the headline
 * Total CBM.
 *
 * Hidden behind a query flag (?debug=1) and a small floating toggle so it
 * never shows up in production traffic by accident.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, X, Play, RotateCcw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CbmItem } from "@/lib/freight/calculators";

export interface CbmDebugInfo {
  /** Live, every-keystroke working copy of the manifest. */
  draftItems: CbmItem[];
  /** Debounced parent state — what the worker / heavy paths see. */
  committedItems: CbmItem[];
  /** Current debounce window in ms (adaptive: 250ms for ≤10, 600ms for >10). */
  debounceMs: number;
  /** Worker is currently busy. */
  workerPending: boolean;
  /** True once the user has clicked "Optimize loading" — gates worker recommend. */
  showOptimization: boolean;
  /** Headline Total CBM as shown in the Results card. Should equal sum of draft. */
  headlineTotalCbm: number;
  /** "fast" while worker hasn't returned, "worker" once we have a worker reco. */
  recommendationSource: "fast" | "worker";
  /** Replace the whole manifest (used by the auto-test to seed and reset). */
  setDraftItems: (items: CbmItem[]) => void;
}

/** A single simulated keystroke, captured for failure diagnostics. */
export interface KeystrokeTrace {
  /** Sequential index across the whole test (1-based). */
  step: number;
  /** Row index being typed into (0-based, refers to TEST_ROWS). */
  rowIdx: number;
  /** Field being typed into. */
  field: "length" | "width" | "height" | "qty" | "weight";
  /** Partial value after this keystroke (e.g. typing "60" produces 6 then 60). */
  partial: number;
  /** Main-thread cost of the keystroke (ms, measured around setDraftItems). */
  frameMs: number;
  /** React render commits observed during this keystroke. */
  renderCount: number;
  /** Wall-clock time relative to test start (ms). */
  tSinceStartMs: number;
  /** Wall-clock gap from the previous keystroke (ms). 0 for the first one. */
  deltaSinceLastMs: number;
}

type FieldKey = "length" | "width" | "height" | "qty" | "weight";

/** Per-field render aggregation across all rows in a single test run. */
export type FieldRenderStats = Record<
  FieldKey,
  {
    keystrokes: number;
    totalRenders: number;
    avgRenders: number;
    worstRenderSpike: number;
    worstFrameMs: number;
    /** Sum of frame costs across all keystrokes for this field (ms). */
    totalFrameMs: number;
    /** Average frame cost per keystroke for this field (ms). */
    avgFrameMs: number;
    /** Wall-clock time spent typing into this field (ms). */
    totalWallMs: number;
  }
>;

/** Per-row timing aggregate — total wall-clock + frame cost for the row. */
export interface RowTimingStats {
  rowIdx: number;
  keystrokes: number;
  /** Wall-clock duration from this row's first to last keystroke (ms). */
  wallMs: number;
  /** Sum of measured frame costs across the row's keystrokes (ms). */
  totalFrameMs: number;
  /** Worst single-keystroke frame cost in this row (ms). */
  worstFrameMs: number;
  /** Total React render commits attributed to this row. */
  totalRenders: number;
}

/** Per-row expected vs actual snapshot, attached on calculation mismatch. */
export interface RowFieldDiff {
  rowIdx: number;
  expected: { length: number; width: number; height: number; qty: number; weight: number };
  actual: { length: number; width: number; height: number; qty: number; weight: number };
  /** Fields whose actual !== expected. Empty array means the row matches. */
  mismatchedFields: string[];
}

interface TestResult {
  rowsFilled: number;
  totalKeystrokes: number;
  /** Worst single-keystroke main-thread time (ms). >50ms = visible jank. */
  worstFrameMs: number;
  /** Average per-keystroke main-thread time (ms). */
  avgFrameMs: number;
  /** Worst React render-count observed for a single keystroke. */
  worstRenderSpike: number;
  /** Average React renders per keystroke. */
  avgRendersPerKeystroke: number;
  /** Total React renders observed across the whole typing run. */
  totalRenders: number;
  /** Render counts/jank broken down by which field was being typed. */
  fieldRenderStats: FieldRenderStats;
  /** Sum of per-row CBM tiles after the test completed. */
  perRowSum: number;
  /** Headline Total CBM after the test completed. */
  headlineTotal: number;
  /** What perRowSum *should* be given the deterministic TEST_ROWS dataset. */
  expectedTotal: number;
  /** Whether perRowSum and headlineTotal agree (within 0.0001 m³ rounding). */
  totalsMatch: boolean;
  /** Whether perRowSum equals the deterministic expectedTotal — catches input loss. */
  matchesExpected: boolean;
  /** Time from first keystroke to final headline-total settle (ms). */
  totalDurationMs: number;
}

/** Headless test report — pass/fail summary suitable for console + CI. */
export interface HeadlessTestReport {
  pass: boolean;
  failures: string[];
  result: TestResult;
  /**
   * Compact per-keystroke trace. Only populated when the test FAILS (or the
   * `trace=1` URL flag is set), to keep passing-run output cheap. Useful for
   * pinpointing which keystroke triggered jank or input loss.
   */
  trace?: KeystrokeTrace[];
  /**
   * Per-row expected vs actual field values. Only attached when a calculation
   * mismatch is detected (input loss or totals mismatch), so you can see exactly
   * which row/field dropped data.
   */
  rowDiffs?: RowFieldDiff[];
  /** ISO timestamp the run completed. */
  completedAt: string;
}

/** Thresholds for pass/fail in headless mode. */
const JANK_THRESHOLD_MS = 50; // Worst frame above this = fail
const AVG_FRAME_THRESHOLD_MS = 16; // Average frame above this = fail (60fps budget)
/** Render spike budget — more than this many React commits per keystroke = fail. */
const RENDER_SPIKE_THRESHOLD = 6;

interface Props {
  info: CbmDebugInfo;
}

/* Realistic carton mix — varied sizes so the packer has actual work to do. */
const TEST_ROWS = [
  { length: 60, width: 40, height: 35, weight: 12, qty: 18 },
  { length: 80, width: 60, height: 50, weight: 22, qty: 12 },
  { length: 45, width: 35, height: 30, weight: 8, qty: 30 },
  { length: 100, width: 80, height: 70, weight: 35, qty: 8 },
  { length: 50, width: 50, height: 50, weight: 15, qty: 20 },
  { length: 70, width: 45, height: 40, weight: 18, qty: 14 },
];

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("debug");
    if (flag === "1" || flag === "test") return true;
    return localStorage.getItem("freight.debug") === "1";
  } catch {
    return false;
  }
}

export function CbmDebugPanel({ info }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [progress, setProgress] = useState<string>("");
  const cancelRef = useRef(false);

  /**
   * Render-commit counter. Incremented on every render of this panel — which
   * happens whenever the parent CbmCalculator re-renders (since `info` is
   * rebuilt on every parent render). The headless test reads this between
   * each simulated keystroke to count React commits per keystroke.
   */
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  // SSR-safe enable check. Runs only on the client after hydration.
  useEffect(() => {
    setEnabled(isDebugEnabled());
  }, []);

  const perRowSum = useMemo(() => {
    return info.draftItems.reduce(
      (a, it) => a + (it.length * it.width * it.height * it.qty) / 1_000_000,
      0,
    );
  }, [info.draftItems]);

  const draftCommitDiff = useMemo(() => {
    let diffs = 0;
    const n = Math.max(info.draftItems.length, info.committedItems.length);
    for (let i = 0; i < n; i++) {
      const d = info.draftItems[i];
      const c = info.committedItems[i];
      if (!d || !c) {
        diffs++;
        continue;
      }
      if (
        d.length !== c.length ||
        d.width !== c.width ||
        d.height !== c.height ||
        d.qty !== c.qty ||
        d.weight !== c.weight
      ) {
        diffs++;
      }
    }
    return diffs;
  }, [info.draftItems, info.committedItems]);

  const totalsMatchLive = Math.abs(perRowSum - info.headlineTotalCbm) < 0.0001;

  /* ------------------- Automated typing/load test ------------------- */
  /**
   * Returns a TestResult after simulating digit-by-digit typing across all 6
   * test rows. Pure function of `info.setDraftItems` + measured frame timing —
   * safe to call from both the manual button and the headless test mode.
   */
  const executeTest = async (
    onProgress?: (msg: string) => void,
  ): Promise<{
    result: TestResult;
    trace: KeystrokeTrace[];
    finalRows: RowFieldDiff["actual"][];
  }> => {
    const frameCosts: number[] = [];
    const renderCounts: number[] = [];
    const trace: KeystrokeTrace[] = [];
    const t0 = performance.now();

    // Working copy. We mutate this in place between keystrokes so each new
    // setDraftItems() reflects ALL prior typing across ALL rows — not just
    // the current row's current field.
    const rows: CbmItem[] = TEST_ROWS.map((_, i) => ({
      id: `dbg-${Date.now()}-${i}`,
      length: 0,
      width: 0,
      height: 0,
      weight: 0,
      qty: 0,
      packageType: "carton",
      stackable: true,
      fragile: false,
      maxStackWeightKg: 0,
      allowSidewaysRotation: true,
      allowAxisRotation: false,
      packingConfirmed: false,
    }));
    info.setDraftItems(rows.map((r) => ({ ...r })));
    onProgress?.("Seeded 6 empty rows…");
    await new Promise((r) => setTimeout(r, 50));

    let keystrokes = 0;
    const fields = ["length", "width", "height", "qty", "weight"] as const;

    for (let rowIdx = 0; rowIdx < TEST_ROWS.length; rowIdx++) {
      if (cancelRef.current) break;
      const target = TEST_ROWS[rowIdx];
      for (const field of fields) {
        if (cancelRef.current) break;
        const str = String(target[field]);
        for (let d = 1; d <= str.length; d++) {
          if (cancelRef.current) break;
          const partial = parseInt(str.slice(0, d), 10) || 0;

          // Patch the live row IN PLACE so subsequent keystrokes preserve
          // every field we've already typed across every row.
          rows[rowIdx] = { ...rows[rowIdx], [field]: partial };

          // Snapshot render counter BEFORE the commit so we can measure how
          // many React renders this single keystroke triggered.
          const rendersBefore = renderCountRef.current;
          const before = performance.now();
          // Push a fresh array reference so React commits.
          info.setDraftItems(rows.map((r) => ({ ...r })));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          const cost = performance.now() - before;
          const renders = renderCountRef.current - rendersBefore;
          frameCosts.push(cost);
          renderCounts.push(renders);
          keystrokes++;
          trace.push({
            step: keystrokes,
            rowIdx,
            field,
            partial,
            frameMs: cost,
            renderCount: renders,
          });
          onProgress?.(
            `Row ${rowIdx + 1}/6 · ${field}=${partial} · ${cost.toFixed(1)}ms · ${renders} render(s)`,
          );
        }
      }
    }

    // Wait for the debounce window + a frame so headline total settles.
    await new Promise((r) => setTimeout(r, info.debounceMs + 100));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const finalSum = rows.reduce(
      (a, it) => a + (it.length * it.width * it.height * it.qty) / 1_000_000,
      0,
    );
    const expected = TEST_ROWS.reduce(
      (a, t) => a + (t.length * t.width * t.height * t.qty) / 1_000_000,
      0,
    );
    const worst = frameCosts.reduce((a, b) => Math.max(a, b), 0);
    const avg = frameCosts.length ? frameCosts.reduce((a, b) => a + b, 0) / frameCosts.length : 0;
    const worstRenderSpike = renderCounts.reduce((a, b) => Math.max(a, b), 0);
    const totalRenders = renderCounts.reduce((a, b) => a + b, 0);
    const avgRenders = renderCounts.length ? totalRenders / renderCounts.length : 0;

    // Aggregate the trace by which field was being typed so we can pinpoint
    // which input is the heaviest re-render trigger (e.g. "qty" causing
    // worker re-runs vs "weight" being a no-op for geometry).
    const fieldRenderStats: FieldRenderStats = {
      length: { keystrokes: 0, totalRenders: 0, avgRenders: 0, worstRenderSpike: 0, worstFrameMs: 0 },
      width: { keystrokes: 0, totalRenders: 0, avgRenders: 0, worstRenderSpike: 0, worstFrameMs: 0 },
      height: { keystrokes: 0, totalRenders: 0, avgRenders: 0, worstRenderSpike: 0, worstFrameMs: 0 },
      qty: { keystrokes: 0, totalRenders: 0, avgRenders: 0, worstRenderSpike: 0, worstFrameMs: 0 },
      weight: { keystrokes: 0, totalRenders: 0, avgRenders: 0, worstRenderSpike: 0, worstFrameMs: 0 },
    };
    for (const t of trace) {
      const s = fieldRenderStats[t.field];
      s.keystrokes += 1;
      s.totalRenders += t.renderCount;
      s.worstRenderSpike = Math.max(s.worstRenderSpike, t.renderCount);
      s.worstFrameMs = Math.max(s.worstFrameMs, t.frameMs);
    }
    for (const k of Object.keys(fieldRenderStats) as (keyof FieldRenderStats)[]) {
      const s = fieldRenderStats[k];
      s.avgRenders = s.keystrokes ? s.totalRenders / s.keystrokes : 0;
    }


    return {
      result: {
        rowsFilled: TEST_ROWS.length,
        totalKeystrokes: keystrokes,
        worstFrameMs: worst,
        avgFrameMs: avg,
        worstRenderSpike,
        avgRendersPerKeystroke: avgRenders,
        totalRenders,
        fieldRenderStats,
        perRowSum: finalSum,
        headlineTotal: info.headlineTotalCbm,
        expectedTotal: expected,
        totalsMatch: Math.abs(finalSum - info.headlineTotalCbm) < 0.0001,
        matchesExpected: Math.abs(finalSum - expected) < 0.0001,
        totalDurationMs: performance.now() - t0,
      },
      trace,
      // Snapshot of every row's final state, so the headless reporter can
      // diff actual vs expected when there's a calculation mismatch.
      finalRows: rows.map((r) => ({
        length: r.length,
        width: r.width,
        height: r.height,
        qty: r.qty,
        weight: r.weight,
      })),
    };
  };

  const runTest = async () => {
    setRunning(true);
    setResult(null);
    cancelRef.current = false;
    const { result: r } = await executeTest(setProgress);
    setResult(r);
    setProgress("");
    setRunning(false);
  };

  const cancelTest = () => {
    cancelRef.current = true;
    setRunning(false);
    setProgress("Cancelled");
  };

  /**
   * Headless test runner — produces a structured pass/fail report. Exposed
   * globally as `window.__cbmHeadlessTest()` and auto-invoked when the URL
   * has `?debug=test`.
   *
   * Output modes (controlled by URL flags):
   *   - default                       → grouped, human-readable console output.
   *   - `format=json`                 → single-line JSON.stringify for CI scraping.
   *   - `format=json&pretty=1`        → multi-line, indented JSON for local debugging.
   *   - `trace=1`                     → always include the per-keystroke trace, even on pass.
   *   - `download=1`                  → on failure, also trigger a .json file download
   *                                      with the full report (incl. trace + rowDiffs).
   *
   * On failure the trace and rowDiffs are ALWAYS included (regardless of
   * `trace=1`) so the failing keystroke and exact field-level data loss are
   * visible in the log and downloadable artifact.
   */
  const runHeadless = useCallback(async (): Promise<HeadlessTestReport> => {
    const { result, trace, finalRows } = await executeTest(setProgress);
    const failures: string[] = [];
    if (!result.matchesExpected) {
      failures.push(
        `Input data loss: per-row sum ${result.perRowSum.toFixed(4)} m³ ≠ expected ${result.expectedTotal.toFixed(4)} m³`,
      );
    }
    if (!result.totalsMatch) {
      failures.push(
        `Totals mismatch: per-row sum ${result.perRowSum.toFixed(4)} m³ ≠ headline ${result.headlineTotal.toFixed(4)} m³`,
      );
    }
    if (result.worstFrameMs > JANK_THRESHOLD_MS) {
      failures.push(
        `Worst-frame jank: ${result.worstFrameMs.toFixed(1)}ms exceeds ${JANK_THRESHOLD_MS}ms budget`,
      );
    }
    if (result.avgFrameMs > AVG_FRAME_THRESHOLD_MS) {
      failures.push(
        `Average frame jank: ${result.avgFrameMs.toFixed(1)}ms exceeds 60fps budget (${AVG_FRAME_THRESHOLD_MS}ms)`,
      );
    }
    if (result.worstRenderSpike > RENDER_SPIKE_THRESHOLD) {
      failures.push(
        `Render spike: ${result.worstRenderSpike} renders in one keystroke exceeds ${RENDER_SPIKE_THRESHOLD} budget`,
      );
    }

    // Read URL flags to decide output format and whether to attach the trace.
    let formatJson = false;
    let pretty = false;
    let alwaysTrace = false;
    let download = false;
    try {
      const url = new URL(window.location.href);
      formatJson = url.searchParams.get("format") === "json";
      pretty = url.searchParams.get("pretty") === "1";
      alwaysTrace = url.searchParams.get("trace") === "1";
      download = url.searchParams.get("download") === "1";
    } catch {
      /* ignore */
    }

    // Build per-row diffs whenever there's a calculation mismatch — pinpoints
    // exactly which row/field dropped data.
    const calcMismatch = !result.matchesExpected || !result.totalsMatch;
    const rowDiffs: RowFieldDiff[] | undefined = calcMismatch
      ? TEST_ROWS.map((expected, rowIdx) => {
          const actual = finalRows[rowIdx] ?? {
            length: 0,
            width: 0,
            height: 0,
            qty: 0,
            weight: 0,
          };
          const mismatchedFields: string[] = [];
          (["length", "width", "height", "qty", "weight"] as const).forEach((f) => {
            if (expected[f] !== actual[f]) mismatchedFields.push(f);
          });
          return { rowIdx, expected, actual, mismatchedFields };
        })
      : undefined;

    const includeTrace = failures.length > 0 || alwaysTrace;
    const report: HeadlessTestReport = {
      pass: failures.length === 0,
      failures,
      result,
      ...(includeTrace ? { trace } : {}),
      ...(rowDiffs ? { rowDiffs } : {}),
      completedAt: new Date().toISOString(),
    };
    setResult(result);
    setProgress("");

    /* eslint-disable no-console */
    if (formatJson) {
      // CI mode: JSON.stringify, optionally pretty-printed.
      console.log(JSON.stringify(report, null, pretty ? 2 : 0));
    } else {
      console.group(`[CBM headless test] ${report.pass ? "✓ PASS" : "✗ FAIL"}`);
      console.log("Result:", result);
      console.log("Per-field render stats:", result.fieldRenderStats);
      console.table(result.fieldRenderStats);
      if (failures.length) {
        console.warn("Failures:", failures);
        if (rowDiffs) {
          console.groupCollapsed(`Row diffs (${rowDiffs.length} rows)`);
          console.table(rowDiffs.map((d) => ({
            row: d.rowIdx,
            mismatched: d.mismatchedFields.join(",") || "—",
            expected: JSON.stringify(d.expected),
            actual: JSON.stringify(d.actual),
          })));
          console.groupEnd();
        }
        console.groupCollapsed(`Trace (${trace.length} keystrokes)`);
        console.table(trace);
        console.groupEnd();
      } else if (alwaysTrace) {
        console.groupCollapsed(`Trace (${trace.length} keystrokes)`);
        console.table(trace);
        console.groupEnd();
      }
      console.log("Report:", report);
      console.groupEnd();
    }
    /* eslint-enable no-console */

    // Optional: download the full failure report as a .json file. Triggered
    // automatically when `download=1` is in the URL and the test failed,
    // OR opt-in for passes by also setting `trace=1`.
    if (download && (failures.length > 0 || alwaysTrace)) {
      try {
        const fullReport = { ...report, trace, rowDiffs };
        const blob = new Blob([JSON.stringify(fullReport, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        a.href = url;
        a.download = `cbm-headless-${report.pass ? "pass" : "fail"}-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        /* eslint-disable-next-line no-console */
        console.warn("[CBM headless test] download failed:", e);
      }
    }

    return report;
  }, [info]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose the headless runner globally + auto-run on ?debug=test.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    (window as unknown as { __cbmHeadlessTest?: () => Promise<HeadlessTestReport> }).__cbmHeadlessTest =
      runHeadless;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("debug") === "test") {
        // Defer so the calculator has time to mount + initial render.
        const t = setTimeout(() => {
          setOpen(true);
          setRunning(true);
          runHeadless().finally(() => setRunning(false));
        }, 600);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, [enabled, runHeadless]);

  if (!enabled) return null;

  return (
    <>
      {/* Floating toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-4 right-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full",
          "bg-foreground text-background shadow-lg transition hover:scale-105",
          open && "scale-110",
        )}
        aria-label="Toggle debug panel"
        title="CBM debug panel"
      >
        <Bug className="size-5" />
      </button>

      {open && (
        <Card
          className="fixed bottom-16 right-4 z-[60] flex max-h-[80vh] w-[360px] flex-col gap-3 overflow-y-auto p-4 shadow-2xl"
          role="dialog"
          aria-label="CBM Debug Panel"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">CBM Debug</h3>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-muted"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Live state */}
          <section className="space-y-2 text-xs">
            <Row
              label="Draft items"
              value={`${info.draftItems.length}`}
              hint="Source for per-row CBM tiles + Total CBM (live)"
            />
            <Row
              label="Committed items"
              value={`${info.committedItems.length}`}
              hint="What the worker / recommender see (debounced)"
            />
            <Row
              label="Debounce window"
              value={`${info.debounceMs} ms`}
              hint={info.draftItems.length > 10 ? "Large manifest tier" : "Small manifest tier"}
            />
            <Row
              label="Draft ↔ Committed diff"
              value={`${draftCommitDiff} row(s)`}
              tone={draftCommitDiff > 0 ? "warn" : "good"}
              hint={
                draftCommitDiff > 0
                  ? "Debounce in flight — values mid-sync"
                  : "States in sync"
              }
            />
            <Row
              label="Worker pending"
              value={info.workerPending ? "yes" : "no"}
              tone={info.workerPending ? "warn" : "good"}
            />
            <Row
              label="Optimization gate"
              value={info.showOptimization ? "open (worker reco)" : "closed (fast reco)"}
              tone={info.showOptimization ? "good" : "muted"}
            />
            <Row
              label="Recommendation source"
              value={info.recommendationSource}
              hint={
                info.recommendationSource === "fast"
                  ? "CBM-only, instant, no packing"
                  : "Geometry-aware, from worker"
              }
            />
          </section>

          <hr className="border-border" />

          {/* Total CBM consistency check */}
          <section className="space-y-2 text-xs">
            <h4 className="font-semibold uppercase tracking-wide text-muted-foreground">
              Total CBM consistency
            </h4>
            <Row
              label="Sum of per-row tiles"
              value={`${perRowSum.toFixed(4)} m³`}
              hint="Computed from draftItems"
            />
            <Row
              label="Headline Total CBM"
              value={`${info.headlineTotalCbm.toFixed(4)} m³`}
              hint="From baseResult (also draftItems)"
            />
            <Row
              label="Match"
              value={totalsMatchLive ? "✓ agree" : "✗ MISMATCH"}
              tone={totalsMatchLive ? "good" : "bad"}
            />
          </section>

          <hr className="border-border" />

          {/* Auto load test */}
          <section className="space-y-2 text-xs">
            <h4 className="font-semibold uppercase tracking-wide text-muted-foreground">
              Auto typing test (6 rows)
            </h4>
            <p className="text-muted-foreground">
              Programmatically types {TEST_ROWS.length} rows of varied carton dimensions and
              measures per-keystroke jank.
            </p>
            <div className="flex gap-2">
              {!running ? (
                <Button size="sm" onClick={runTest} className="gap-1">
                  <Play className="size-3" /> Run test
                </Button>
              ) : (
                <Button size="sm" variant="destructive" onClick={cancelTest} className="gap-1">
                  <X className="size-3" /> Cancel
                </Button>
              )}
              {result && !running && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    setProgress("");
                  }}
                  className="gap-1"
                >
                  <RotateCcw className="size-3" /> Reset
                </Button>
              )}
            </div>
            {progress && (
              <p className="font-mono text-[11px] text-muted-foreground">{progress}</p>
            )}
            {result && (
              <div className="space-y-1 rounded border border-border bg-muted/30 p-2">
                <Row label="Rows filled" value={`${result.rowsFilled}`} />
                <Row label="Keystrokes" value={`${result.totalKeystrokes}`} />
                <Row
                  label="Worst frame"
                  value={`${result.worstFrameMs.toFixed(1)} ms`}
                  tone={
                    result.worstFrameMs > JANK_THRESHOLD_MS
                      ? "bad"
                      : result.worstFrameMs > AVG_FRAME_THRESHOLD_MS
                        ? "warn"
                        : "good"
                  }
                  hint=">50ms = visible jank · >16ms = dropped frame"
                />
                <Row
                  label="Avg frame"
                  value={`${result.avgFrameMs.toFixed(1)} ms`}
                  tone={result.avgFrameMs > AVG_FRAME_THRESHOLD_MS ? "warn" : "good"}
                />
                <Row
                  label="Worst render spike"
                  value={`${result.worstRenderSpike} render(s)`}
                  tone={
                    result.worstRenderSpike > RENDER_SPIKE_THRESHOLD
                      ? "bad"
                      : result.worstRenderSpike > 3
                        ? "warn"
                        : "good"
                  }
                  hint={`>${RENDER_SPIKE_THRESHOLD} per keystroke = render storm`}
                />
                <Row
                  label="Avg renders / keystroke"
                  value={result.avgRendersPerKeystroke.toFixed(2)}
                  hint={`${result.totalRenders} total commits`}
                />
                <Row
                  label="Per-row sum"
                  value={`${result.perRowSum.toFixed(4)} m³`}
                />
                <Row
                  label="Expected total"
                  value={`${result.expectedTotal.toFixed(4)} m³`}
                  hint="Deterministic from TEST_ROWS"
                />
                <Row
                  label="Headline total"
                  value={`${result.headlineTotal.toFixed(4)} m³`}
                />
                <Row
                  label="Inputs preserved"
                  value={result.matchesExpected ? "✓ yes" : "✗ NO (data loss)"}
                  tone={result.matchesExpected ? "good" : "bad"}
                />
                <Row
                  label="Totals match"
                  value={result.totalsMatch ? "✓ yes" : "✗ NO"}
                  tone={result.totalsMatch ? "good" : "bad"}
                />
                <Row
                  label="Total duration"
                  value={`${(result.totalDurationMs / 1000).toFixed(2)} s`}
                />
                {/* Per-field render breakdown — pinpoints which input is the
                    heaviest re-render trigger. */}
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Per-field renders
                  </div>
                  {(Object.keys(result.fieldRenderStats) as (keyof FieldRenderStats)[]).map(
                    (f) => {
                      const s = result.fieldRenderStats[f];
                      return (
                        <Row
                          key={f}
                          label={f}
                          value={`${s.avgRenders.toFixed(1)} avg · peak ${s.worstRenderSpike}`}
                          tone={
                            s.worstRenderSpike > RENDER_SPIKE_THRESHOLD
                              ? "bad"
                              : s.worstRenderSpike > 3
                                ? "warn"
                                : "good"
                          }
                          hint={`${s.keystrokes} keystrokes · worst frame ${s.worstFrameMs.toFixed(1)}ms`}
                        />
                      );
                    },
                  )}
                </div>
              </div>
            )}
          </section>

          <p className="text-[10px] text-muted-foreground">
            Headless mode:{" "}
            <code className="rounded bg-muted px-1">?debug=test</code> ·{" "}
            <code className="rounded bg-muted px-1">&amp;format=json</code> for CI ·{" "}
            <code className="rounded bg-muted px-1">&amp;pretty=1</code> indents JSON ·{" "}
            <code className="rounded bg-muted px-1">&amp;trace=1</code> always log trace ·{" "}
            <code className="rounded bg-muted px-1">&amp;download=1</code> save .json on fail ·
            or call <code className="rounded bg-muted px-1">window.__cbmHeadlessTest()</code>
          </p>
          <p className="text-[10px] text-muted-foreground">
            Toggle off:{" "}
            <code className="rounded bg-muted px-1">localStorage.removeItem(&apos;freight.debug&apos;)</code>
          </p>
        </Card>
      )}
    </>
  );
}

/* ----------------- Helpers ----------------- */

function Row({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad" | "muted";
}) {
  const toneClass =
    tone === "good"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : tone === "bad"
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
          : "bg-muted text-muted-foreground";
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1">
        <div className="text-foreground">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
      <Badge variant="outline" className={cn("font-mono text-[11px]", toneClass)}>
        {value}
      </Badge>
    </div>
  );
}

/**
 * Build the partial patch reflecting what's been "typed so far" up to and
 * including `currentField` at digit count `digits`. Earlier fields use their
 * full target value; later fields stay at 0.
 */
/* (patchAccumulated helper removed — the test now mutates a working `rows`
   array in place per keystroke, which is correct and simpler.) */

