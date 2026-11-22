/**
 * V1-PROD-03 — Auto-switch agent adapters on quota/failure while preserving checkpoint_id.
 */

import type {
  AdapterInvokeRequest,
  CircuitAgentAdapter,
  NormalizedAdapterResult,
} from "./adapter-types.js";
import { CursorCircuitAdapter } from "./cursor-adapter.js";
import { AntigravityCircuitAdapter } from "./antigravity-adapter.js";
import type { ExecutionRunner } from "../execution-runner/index.js";

export interface AgentCheckpoint {
  checkpoint_id: string;
  work_id: string;
  task_id: string;
  adapter_id: string;
  created_at: string;
  payload?: Record<string, unknown>;
}

export interface FailoverInvokeRequest extends AdapterInvokeRequest {
  checkpoint_id: string;
}

export interface FailoverInvokeResult {
  kind: "AgentFailoverResult";
  checkpoint_id: string;
  primary_adapter_id: string;
  served_adapter_id: string;
  switched: boolean;
  reason?: string;
  result: NormalizedAdapterResult;
  checkpoint: AgentCheckpoint;
}

export type FailoverDecision =
  | { action: "accept" }
  | { action: "switch"; reason: string };

export function shouldFailover(result: NormalizedAdapterResult): FailoverDecision {
  if (result.status === "ok") return { action: "accept" };
  const code = `${result.code} ${result.message}`.toLowerCase();
  if (
    result.status === "failed" ||
    result.status === "timeout" ||
    result.status === "blocked" ||
    /quota|rate.?limit|exhausted|429|billing|overloaded/.test(code)
  ) {
    return { action: "switch", reason: result.code || result.status };
  }
  return { action: "accept" };
}

export function createDefaultAgentAdapters(runner?: ExecutionRunner): CircuitAgentAdapter[] {
  return [new CursorCircuitAdapter(runner), new AntigravityCircuitAdapter(runner)];
}

/**
 * Try adapters in order; on quota/failure switch while keeping the same checkpoint_id.
 */
export async function invokeWithAgentFailover(opts: {
  adapters: CircuitAgentAdapter[];
  request: FailoverInvokeRequest;
  /** Optional predicate override (tests). */
  decide?: (result: NormalizedAdapterResult) => FailoverDecision;
}): Promise<FailoverInvokeResult> {
  if (opts.adapters.length < 2) {
    throw new Error("agent failover requires ≥2 adapters");
  }
  const decide = opts.decide ?? shouldFailover;
  const checkpoint_id = opts.request.checkpoint_id;
  if (!checkpoint_id?.trim()) {
    throw new Error("checkpoint_id required for failover");
  }

  const primary = opts.adapters[0]!;
  let last: NormalizedAdapterResult | undefined;

  for (let i = 0; i < opts.adapters.length; i++) {
    const adapter = opts.adapters[i]!;
    const result = await adapter.invoke(opts.request);
    last = result;
    const decision = decide(result);
    if (decision.action === "accept" && result.status === "ok") {
      const checkpoint: AgentCheckpoint = {
        checkpoint_id,
        work_id: opts.request.work_id,
        task_id: opts.request.task_id,
        adapter_id: adapter.adapter_id,
        created_at: new Date().toISOString(),
        payload: { switched: i > 0 },
      };
      return {
        kind: "AgentFailoverResult",
        checkpoint_id,
        primary_adapter_id: primary.adapter_id,
        served_adapter_id: adapter.adapter_id,
        switched: i > 0,
        reason: i > 0 ? "failover_success" : undefined,
        result,
        checkpoint,
      };
    }
    if (decision.action === "switch" && i < opts.adapters.length - 1) {
      continue;
    }
  }

  const served = opts.adapters[opts.adapters.length - 1]!;
  const checkpoint: AgentCheckpoint = {
    checkpoint_id,
    work_id: opts.request.work_id,
    task_id: opts.request.task_id,
    adapter_id: served.adapter_id,
    created_at: new Date().toISOString(),
    payload: { switched: true, exhausted: true },
  };
  return {
    kind: "AgentFailoverResult",
    checkpoint_id,
    primary_adapter_id: primary.adapter_id,
    served_adapter_id: served.adapter_id,
    switched: true,
    reason: last?.code ?? "all_adapters_failed",
    result: last!,
    checkpoint,
  };
}
