/**
 * Adapter driver interface — Core may only claim execution a driver actually performs.
 * Missing/blocked drivers must fail closed (never silent success).
 */

import type { AdapterId } from "../types.js";
import type { V3DataPaths } from "../../paths.js";

export type DriverInvokeStatus =
  | "accepted"
  | "blocked"
  | "unsupported"
  | "failed";

export interface AdapterInvokeRequest {
  work_id: string;
  task_id: string;
  agent_id?: string;
  /** Optional IR path when routing through ExecutionEngine / jobs. */
  ir_path?: string;
  provider_mode?: "mock" | "real";
  note?: string;
  /**
   * Workspace the harness should operate in (git worktree path).
   * Used by cursor-agent `--workspace`; required for non-interactive trust scope.
   */
  workspace_path?: string;
  /**
   * When set, wait up to N ms for the spawned CLI to exit and capture exit_code.
   * Default is fire-and-forget (PROCESS_SPAWNED).
   */
  wait_ms?: number;
  /** cursor-agent execution mode (ask = read-only Q&A; plan = read-only planning). */
  cli_mode?: "ask" | "plan";
  /**
   * When true, pass cursor-agent `--force` so consented live engineering can run
   * npm/git/shell tools. Not an authentication substitute.
   */
  force_tools?: boolean;
}

export interface AdapterInvokeResult {
  kind: "AdapterInvokeResult";
  adapter_id: AdapterId;
  status: DriverInvokeStatus;
  code: string;
  message: string;
  /** Present only when a real bridge accepted work (e.g. cursor jobs). */
  bridge_ref?: string;
  limitations: string[];
}

export interface AgentAdapterDriver {
  readonly adapter_id: AdapterId;
  /** True only if Core can start/drive work without pretending. */
  readonly can_invoke: boolean;
  describe(): { adapter_id: AdapterId; can_invoke: boolean; notes: string[] };
  invoke(paths: V3DataPaths, request: AdapterInvokeRequest): Promise<AdapterInvokeResult>;
}
