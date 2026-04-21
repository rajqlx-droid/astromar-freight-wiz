import { useEffect, useRef, useState } from "react";
import PackingWorker from "@/lib/freight/packing-worker?worker";
import type { AdvancedPackResult } from "@/lib/freight/packing-advanced";
import type { ScenarioResult, StrategyId } from "@/lib/freight/scenario-runner";
import type { CbmItem } from "@/lib/freight/calculators";
import type { ContainerPreset } from "@/lib/freight/packing";
import type { RecommendResponseResult } from "@/lib/freight/packing-worker";

/**
 * usePackingWorker — runs the heavy 3D packer off the main thread.
 *
 * - Owns one Worker instance per hook invocation (one per consumer component).
 * - Each request gets a sequence id; responses with stale ids are dropped so
 *   rapid input changes don't race.
 * - Returns the latest result + a `pending` flag so callers can show
 *   "Calculating…" while the worker is busy without flicker.
 *
 * The worker is created lazily on first request to avoid spinning one up for
 * empty calculators.
 */

interface PendingRequest<T> {
  id: number;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

type WorkerResponse<R> = { id: number; ok: true; result: R } | { id: number; ok: false; error: string };

function createWorker(): Worker {
  return new PackingWorker();
}

interface PackResponse {
  kind: "pack";
  result: AdvancedPackResult;
}
interface ScenariosResponse {
  kind: "scenarios";
  result: ScenarioResult[];
}
interface MultiResponse {
  kind: "multi";
  result: AdvancedPackResult[];
}
interface RecommendResponse {
  kind: "recommend";
  result: RecommendResponseResult;
}
type AnyResponse = PackResponse | ScenariosResponse | MultiResponse | RecommendResponse;

interface UsePackingWorker {
  /** Pack a single container. */
  pack: (items: CbmItem[], container: ContainerPreset) => Promise<AdvancedPackResult>;
  /** Run scenario comparison. */
  scenarios: (
    items: CbmItem[],
    container: ContainerPreset,
    strategies: StrategyId[],
  ) => Promise<ScenarioResult[]>;
  /** Pack a set of buckets across containers (multi-container splits). */
  multi: (
    buckets: CbmItem[][],
    containers: ContainerPreset[],
  ) => Promise<AdvancedPackResult[]>;
  /** Geometry-aware recommendation + per-bucket packs in one round trip. */
  recommend: (items: CbmItem[]) => Promise<RecommendResponseResult>;
  /** True while at least one job is in flight. */
  pending: boolean;
}

export function usePackingWorker(): UsePackingWorker {
  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);
  const pendingRef = useRef<Map<number, PendingRequest<AnyResponse>>>(new Map());
  const [inflight, setInflight] = useState(0);

  // Lazy-init + cleanup on unmount.
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      // Reject any still-pending requests so callers don't hang.
      pendingRef.current.forEach((req) => req.reject(new Error("Worker terminated")));
      pendingRef.current.clear();
    };
  }, []);

  const ensureWorker = (): Worker => {
    if (workerRef.current) return workerRef.current;
    const w = createWorker();
    w.addEventListener("message", (event: MessageEvent<WorkerResponse<AnyResponse>>) => {
      const data = event.data;
      const req = pendingRef.current.get(data.id);
      if (!req) return; // stale
      pendingRef.current.delete(data.id);
      setInflight((n) => Math.max(0, n - 1));
      if (data.ok) {
        req.resolve(data.result);
      } else {
        req.reject(new Error(data.error));
      }
    });
    w.addEventListener("error", (event) => {
      // Reject every outstanding request on a worker error.
      pendingRef.current.forEach((req) => req.reject(new Error(event.message || "Worker error")));
      pendingRef.current.clear();
      setInflight(0);
    });
    workerRef.current = w;
    return w;
  };

  const send = <R extends AnyResponse>(payload: unknown): Promise<R> => {
    const w = ensureWorker();
    const id = ++seqRef.current;
    setInflight((n) => n + 1);
    return new Promise<R>((resolve, reject) => {
      pendingRef.current.set(id, {
        id,
        resolve: resolve as (v: AnyResponse) => void,
        reject,
      });
      w.postMessage({ id, payload });
    });
  };

  return {
    pack: async (items, container) => {
      const r = await send<PackResponse>({ kind: "pack", items, container });
      return r.result;
    },
    scenarios: async (items, container, strategies) => {
      const r = await send<ScenariosResponse>({
        kind: "scenarios",
        items,
        container,
        strategies,
      });
      return r.result;
    },
    multi: async (buckets, containers) => {
      const r = await send<MultiResponse>({ kind: "multi", buckets, containers });
      return r.result;
    },
    recommend: async (items) => {
      const r = await send<RecommendResponse>({ kind: "recommend", items });
      return r.result;
    },
    pending: inflight > 0,
  };
}
