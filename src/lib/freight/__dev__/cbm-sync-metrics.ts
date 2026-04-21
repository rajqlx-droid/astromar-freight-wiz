/**
 * Dev-only metrics recorder for the CBM calculator's items↔draftItems sync.
 *
 * Tracks three signals to catch regressions of React error #185 EARLY (before
 * React's "Maximum update depth exceeded" actually fires):
 *
 *   1. parentPushCount  — how many times the child has called the parent's
 *      `setItems` setter. Bursts in a short window indicate the echo guard
 *      is broken.
 *   2. effectCycleCount — how many times either sync effect has fired since
 *      mount. A monotonically increasing rate (without user input) is the
 *      classic infinite-loop signature.
 *   3. loopDetected     — true when `effectCycleCount` exceeds a threshold
 *      within a short rolling window.
 *
 * Tree-shaken from production: every call site is gated behind
 * `import.meta.env.DEV`. The recorder itself is a plain object with no React
 * dependencies so it can be unit-tested in isolation.
 */

export interface CbmSyncMetrics {
  /** Total parent setter calls since mount. */
  parentPushCount: number;
  /** Total sync-effect firings (effect A + effect B) since mount. */
  effectCycleCount: number;
  /** True once a loop has been detected in the current window. */
  loopDetected: boolean;
  /** Timestamp of the first cycle in the current rolling window (ms). */
  windowStart: number;
  /** Cycle count at the start of the current rolling window. */
  windowStartCycles: number;
}

export interface CbmSyncRecorder {
  readonly metrics: Readonly<CbmSyncMetrics>;
  recordParentPush(source: "draft-flush" | "push-items" | "external"): void;
  recordEffectCycle(which: "items->draft" | "draft->items"): void;
  reset(): void;
  /** Snapshot for logging or assertions. */
  snapshot(): CbmSyncMetrics;
}

export interface RecorderOptions {
  /** Window size in ms for loop detection. Default 1000ms. */
  windowMs?: number;
  /** Cycles within window that count as a loop. Default 30. */
  loopThreshold?: number;
  /**
   * Called once per detected loop with a short summary. Defaults to
   * `console.error` so the warning is visible in the browser console.
   */
  onLoop?: (summary: string, metrics: Readonly<CbmSyncMetrics>) => void;
  /** Clock injection for deterministic tests. */
  now?: () => number;
}

const DEFAULT_WINDOW_MS = 1000;
const DEFAULT_LOOP_THRESHOLD = 30;

/**
 * Creates a fresh recorder. One per `CbmCalculator` instance.
 *
 * The recorder is intentionally NOT a React hook so it can be tested in
 * isolation with no DOM and no rendering — see `cbm-sync-metrics.test.ts`.
 */
export function createCbmSyncRecorder(opts: RecorderOptions = {}): CbmSyncRecorder {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const loopThreshold = opts.loopThreshold ?? DEFAULT_LOOP_THRESHOLD;
  const now = opts.now ?? (() => Date.now());
  const onLoop =
    opts.onLoop ??
    ((summary) => {
      // eslint-disable-next-line no-console
      console.error(`[cbm-sync] ${summary}`);
    });

  const metrics: CbmSyncMetrics = {
    parentPushCount: 0,
    effectCycleCount: 0,
    loopDetected: false,
    windowStart: now(),
    windowStartCycles: 0,
  };

  function checkLoop(): void {
    const t = now();
    const elapsed = t - metrics.windowStart;
    if (elapsed > windowMs) {
      // Slide the window forward — only count cycles in the most recent windowMs.
      metrics.windowStart = t;
      metrics.windowStartCycles = metrics.effectCycleCount;
      metrics.loopDetected = false;
      return;
    }
    const cyclesInWindow = metrics.effectCycleCount - metrics.windowStartCycles;
    if (cyclesInWindow >= loopThreshold && !metrics.loopDetected) {
      metrics.loopDetected = true;
      onLoop(
        `loop detected: ${cyclesInWindow} sync cycles in ${elapsed}ms (threshold=${loopThreshold}/${windowMs}ms). ` +
          `parentPushCount=${metrics.parentPushCount}. This is the React error #185 fingerprint — check the items↔draftItems sync in cbm-calculator.tsx.`,
        metrics,
      );
    }
  }

  return {
    get metrics() {
      return metrics;
    },
    recordParentPush(_source) {
      metrics.parentPushCount++;
    },
    recordEffectCycle(_which) {
      metrics.effectCycleCount++;
      checkLoop();
    },
    reset() {
      metrics.parentPushCount = 0;
      metrics.effectCycleCount = 0;
      metrics.loopDetected = false;
      metrics.windowStart = now();
      metrics.windowStartCycles = 0;
    },
    snapshot() {
      return { ...metrics };
    },
  };
}

/**
 * No-op recorder for production builds — same shape, zero overhead.
 */
export const NOOP_RECORDER: CbmSyncRecorder = {
  metrics: {
    parentPushCount: 0,
    effectCycleCount: 0,
    loopDetected: false,
    windowStart: 0,
    windowStartCycles: 0,
  },
  recordParentPush() {},
  recordEffectCycle() {},
  reset() {},
  snapshot() {
    return {
      parentPushCount: 0,
      effectCycleCount: 0,
      loopDetected: false,
      windowStart: 0,
      windowStartCycles: 0,
    };
  },
};
