/**
 * Minimal V0 Agent Adapter contract (Bloco 3).
 * invoke() MUST go through ExecutionRunner.
 */

import type { ExecutionRunnerResult } from "../execution-runner/types.js";
import type { CostProvenance } from "../model-providers/types.js";

export interface AdapterHealth {
  kind: "AdapterHealth";
  adapter_id: string;
  ok: boolean;
  code: string;
  message: string;
  cli_path?: string;
  checked_at: string;
  limitations: string[];
}

export interface AdapterInvokeRequest {
  work_id: string;
  task_id: string;
  prompt: string;
  workspace_path: string;
  timeout_ms?: number;
  /** cursor-agent --force for write tools */
  force_tools?: boolean;
  cli_mode?: "ask" | "plan" | "agent";
}

export interface NormalizedAdapterResult {
  kind: "NormalizedAdapterResult";
  adapter_id: string;
  status: "ok" | "blocked" | "failed" | "timeout" | "cancelled";
  code: string;
  message: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  session_id?: string;
  pid?: number;
  pgid?: number;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  cost_provenance: CostProvenance;
  model?: string;
  limitations: string[];
  raw_runner?: ExecutionRunnerResult;
}

export interface CircuitAgentAdapter {
  readonly adapter_id: string;
  healthCheck(): Promise<AdapterHealth>;
  invoke(req: AdapterInvokeRequest): Promise<NormalizedAdapterResult>;
  cancel(pid: number): { signalled: boolean; reason: string };
  normalizeResult(runner: ExecutionRunnerResult, meta?: Partial<NormalizedAdapterResult>): NormalizedAdapterResult;
}
