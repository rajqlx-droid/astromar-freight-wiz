/**
 * Packing Web Worker — runs the heavy 3D packer and scenario runner off the
 * main thread so the UI stays responsive even with 400+ cartons.
 *
 * Vite picks this up via `?worker` import in src/hooks/use-packing-worker.ts.
 *
 * Protocol:
 *   - Main → Worker: { id, kind: "pack" | "scenarios" | "recommend", payload }
 *   - Worker → Main: { id, ok: true, result } | { id, ok: false, error }
 *
 * The id lets the hook drop responses for stale requests without a race.
 */
import { packContainerAdvanced, type AdvancedPackResult } from "./packing-advanced";
import {
  runAllScenarios,
  pickBestPlan,
  type BestPlan,
  type ScenarioResult,
  type StrategyId,
} from "./scenario-runner";
import {
  recommendContainers,
  type ContainerRecommendation,
} from "./container-recommender";
import type { CbmItem } from "./calculators";
import type { ContainerPreset } from "./packing";

export type PackingRequest =
  | {
      kind: "pack";
      items: CbmItem[];
      container: ContainerPreset;
    }
  | {
      kind: "scenarios";
      items: CbmItem[];
      container: ContainerPreset;
      strategies: StrategyId[];
    }
  | {
      kind: "optimise";
      items: CbmItem[];
      container: ContainerPreset;
    }
  | {
      kind: "recommend";
      items: CbmItem[];
    };

export interface RecommendResponseResult {
  recommendation: ContainerRecommendation;
}

export type PackingResponse =
  | { kind: "pack"; result: AdvancedPackResult }
  | { kind: "scenarios"; result: ScenarioResult[] }
  | { kind: "optimise"; result: BestPlan }
  | { kind: "recommend"; result: RecommendResponseResult };

interface IncomingMessage {
  id: number;
  payload: PackingRequest;
}

interface OutgoingMessage {
  id: number;
  ok: boolean;
  result?: PackingResponse;
  error?: string;
}

self.addEventListener("message", (event: MessageEvent<IncomingMessage>) => {
  const { id, payload } = event.data;
  try {
    let response: PackingResponse;
    switch (payload.kind) {
      case "pack":
        response = {
          kind: "pack",
          result: packContainerAdvanced(payload.items, payload.container),
        };
        break;
      case "scenarios":
        response = {
          kind: "scenarios",
          result: runAllScenarios(payload.items, payload.container, payload.strategies),
        };
        break;
      case "optimise":
        response = {
          kind: "optimise",
          result: pickBestPlan(payload.items, payload.container),
        };
        break;
      case "recommend": {
        const recommendation = recommendContainers(payload.items);
        response = {
          kind: "recommend",
          result: { recommendation },
        };
        break;
      }
      default: {
        const exhaust: never = payload;
        throw new Error(`Unknown request kind: ${JSON.stringify(exhaust)}`);
      }
    }
    const message: OutgoingMessage = { id, ok: true, result: response };
    (self as unknown as Worker).postMessage(message);
  } catch (err) {
    const message: OutgoingMessage = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(message);
  }
});

// Required for TypeScript module isolation under Vite's worker bundler.
export {};
